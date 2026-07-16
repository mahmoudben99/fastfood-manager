package com.fastfood.tv

import android.app.Activity
import android.content.pm.ApplicationInfo
import android.graphics.Bitmap
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.text.InputFilter
import android.text.InputType
import android.view.Gravity
import android.view.KeyEvent
import android.view.View
import android.view.ViewGroup.LayoutParams.MATCH_PARENT
import android.view.ViewGroup.LayoutParams.WRAP_CONTENT
import android.view.WindowManager
import android.view.inputmethod.EditorInfo
import android.webkit.RenderProcessGoneDetail
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.InetSocketAddress
import java.net.Socket
import java.net.URL
import java.net.URLEncoder
import java.util.concurrent.ArrayBlockingQueue
import java.util.concurrent.RejectedExecutionException
import java.util.concurrent.ThreadFactory
import java.util.concurrent.ThreadPoolExecutor
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger

/**
 * Fast Food Manager TV display kiosk.
 *
 * A restaurant code is resolved once, LAN endpoints are tried first, and the cloud display is
 * used as a fallback. A connection is remembered only after the WebView has completed a usable
 * main-frame load. Every asynchronous result carries an attempt token so an old request cannot
 * replace a newer manual choice.
 */
class MainActivity : Activity() {

    private lateinit var root: FrameLayout
    private lateinit var web: WebView
    private val prefs by lazy { getSharedPreferences(PREFS_NAME, MODE_PRIVATE) }
    private val ui = Handler(Looper.getMainLooper())
    private val attempts = ConnectionAttemptGate()
    private val networkThreadCounter = AtomicInteger(0)
    private val networkExecutor = ThreadPoolExecutor(
        NETWORK_WORKERS,
        NETWORK_WORKERS,
        0L,
        TimeUnit.MILLISECONDS,
        ArrayBlockingQueue(NETWORK_QUEUE_CAPACITY),
        ThreadFactory { task ->
            Thread(task, "ffm-tv-network-${networkThreadCounter.incrementAndGet()}").apply {
                isDaemon = true
            }
        },
        ThreadPoolExecutor.DiscardOldestPolicy()
    )

    @Volatile
    private var destroyed = false
    private var pendingCode: String? = null
    private var retryAttempt = 0
    private var activeLoadTimeout: Runnable? = null
    private var activeNavigationTimeout: Runnable? = null
    private var rendererRecoveryToken = 0L
    private var rendererCrashWindowStartedAt = 0L
    private var rendererCrashCount = 0

    private val retryRunnable = Runnable { retrySaved() }
    private val lanReprobeRunnable = Runnable { startLanReprobe() }
    private val rendererRecoveryRunnable = Runnable { recoverAfterRendererCrash(rendererRecoveryToken) }

    private val defaultResolver = "https://fastfood-manager.vercel.app/api/pair"

    /** Resolver override for the debug-only local end-to-end harness. */
    private fun resolver(): String =
        prefs.getString(KEY_RESOLVER_OVERRIDE, null) ?: defaultResolver

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        hideSystemUi()

        // MainActivity is exported because it is the launcher. Never allow another application
        // to repoint a production build's resolver through an Intent extra.
        val debuggable = (applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE) != 0
        if (debuggable) {
            intent?.getStringExtra("resolver")?.trim()?.let { value ->
                prefs.edit().apply {
                    when {
                        value.isEmpty() -> remove(KEY_RESOLVER_OVERRIDE)
                        isHttpUrl(value) -> putString(KEY_RESOLVER_OVERRIDE, value)
                    }
                }.apply()
            }
        }

        root = FrameLayout(this).apply { setBackgroundColor(Color.BLACK) }
        web = WebView(this)
        setupWebView(web)
        root.addView(web, FrameLayout.LayoutParams(MATCH_PARENT, MATCH_PARENT))
        setContentView(root)

        val savedUrl = prefs.getString(KEY_LAST_URL, null)
        val savedCode = prefs.getString(KEY_CODE, null)
        when {
            savedUrl != null -> loadSavedDisplay(savedUrl, savedCode)
            savedCode != null -> connectWithCode(savedCode)
            else -> showPairing(null)
        }
    }

    /** Starts a new user-visible operation and invalidates every older callback. */
    private fun beginAttempt(stopCurrentLoad: Boolean = true): Long {
        ui.removeCallbacks(retryRunnable)
        ui.removeCallbacks(lanReprobeRunnable)
        ui.removeCallbacks(rendererRecoveryRunnable)
        activeLoadTimeout?.let(ui::removeCallbacks)
        activeLoadTimeout = null
        activeNavigationTimeout?.let(ui::removeCallbacks)
        activeNavigationTimeout = null
        // Invalidate callbacks before stopLoading(), which itself can synchronously emit a
        // cancellation callback on some WebView versions.
        val token = attempts.begin()
        if (stopCurrentLoad && ::web.isInitialized) {
            try {
                web.stopLoading()
            } catch (_: Exception) {
                // A renderer-gone WebView can reject calls while it is being replaced.
            }
        }
        return token
    }

    private fun isCurrent(token: Long): Boolean = !destroyed && attempts.isCurrent(token)

    private fun runOnCurrent(token: Long, action: () -> Unit) {
        ui.post {
            if (isCurrent(token)) action()
        }
    }

    /** Keep resolver/probe work bounded even if a remote button is pressed repeatedly. */
    private fun runNetwork(action: () -> Unit) {
        if (destroyed) return
        try {
            networkExecutor.execute(Runnable { action() })
        } catch (_: RejectedExecutionException) {
            // Activity teardown invalidates the token; no UI callback should survive it.
        }
    }

    private fun loadSavedDisplay(url: String, code: String?) {
        val token = beginAttempt()
        loadDisplay(url, token) { ok ->
            if (ok) {
                retryAttempt = 0
                pendingCode = null
                if (prefs.getBoolean(KEY_VIA_CLOUD, false)) startLanReprobe()
            } else if (code != null) {
                connectWithCode(code)
            } else {
                showPairing(null)
                setStatus("The saved display is unavailable. Retrying automatically.")
                scheduleRetry(token)
            }
        }
    }

    /** Schedules reconnect with a 10s, 20s, 40s, then 60s capped backoff. */
    private fun scheduleRetry(token: Long) {
        if (!isCurrent(token)) return
        val hasReconnectTarget = pendingCode != null ||
            prefs.getString(KEY_CODE, null) != null || prefs.getString(KEY_LAST_URL, null) != null
        if (!hasReconnectTarget) return

        ui.removeCallbacks(retryRunnable)
        val delay = when (retryAttempt) {
            0 -> 10_000L
            1 -> 20_000L
            2 -> 40_000L
            else -> 60_000L
        }
        retryAttempt++
        ui.postDelayed(retryRunnable, delay)
    }

    /** A pending, not-yet-persisted manual code always wins over the last saved connection. */
    private fun retrySaved() {
        pendingCode?.let {
            connectWithCode(it)
            return
        }

        val url = prefs.getString(KEY_LAST_URL, null)
        val code = prefs.getString(KEY_CODE, null)
        when {
            url != null -> loadSavedDisplay(url, code)
            code != null -> connectWithCode(code)
            else -> showPairing(null)
        }
    }

    // ---- WebView ----

    @Suppress("SetJavaScriptEnabled")
    private fun setupWebView(target: WebView) {
        with(target.settings) {
            javaScriptEnabled = true
            domStorageEnabled = true
            mediaPlaybackRequiresUserGesture = false
            loadWithOverviewMode = true
            useWideViewPort = true
            cacheMode = android.webkit.WebSettings.LOAD_DEFAULT
            allowFileAccess = false
            allowContentAccess = false
            javaScriptCanOpenWindowsAutomatically = false
            setSupportMultipleWindows(false)
        }
        target.setBackgroundColor(Color.BLACK)
        target.webViewClient = rendererAwareClient()
    }

    private fun rendererAwareClient(): WebViewClient = object : WebViewClient() {
        override fun onRenderProcessGone(view: WebView?, detail: RenderProcessGoneDetail?): Boolean {
            ui.post { handleRendererGone(view) }
            return true
        }
    }

    /**
     * Loads one candidate URL. Only the first terminal callback is delivered, and it is dropped
     * if another attempt has started. HTTP main-frame errors and a load timeout are failures.
     */
    private fun loadDisplay(url: String, token: Long, onResult: (Boolean) -> Unit) {
        if (!isCurrent(token)) return
        if (!isHttpUrl(url)) {
            runOnCurrent(token) { onResult(false) }
            return
        }

        val targetWeb = web
        val oneShot = OneShotLoadResult()
        var activeNavigationUrl: String? = url
        lateinit var timeout: Runnable

        fun complete(ok: Boolean) {
            if (!oneShot.tryComplete()) return
            ui.removeCallbacks(timeout)
            if (activeLoadTimeout === timeout) activeLoadTimeout = null
            val deliver = {
                if (isCurrent(token) && targetWeb === web) onResult(ok)
            }
            if (Looper.myLooper() == Looper.getMainLooper()) {
                if (ok && isCurrent(token) && targetWeb === web) {
                    targetWeb.webViewClient = connectedDisplayClient(token, targetWeb.url)
                }
                deliver()
            } else {
                ui.post {
                    if (ok && isCurrent(token) && targetWeb === web) {
                        targetWeb.webViewClient = connectedDisplayClient(token, targetWeb.url)
                    }
                    deliver()
                }
            }
        }

        timeout = Runnable { complete(false) }
        activeLoadTimeout?.let(ui::removeCallbacks)
        activeLoadTimeout = timeout

        targetWeb.webViewClient = object : WebViewClient() {
            override fun onPageStarted(view: WebView?, startedUrl: String?, favicon: Bitmap?) {
                if (startedUrl == null) return
                if (hasSameOrigin(url, startedUrl)) {
                    activeNavigationUrl = startedUrl
                } else {
                    complete(false)
                }
            }

            override fun onReceivedError(
                view: WebView?,
                request: WebResourceRequest?,
                error: WebResourceError?
            ) {
                if (request?.isForMainFrame == true &&
                    matchesNavigationFailure(request.url?.toString(), activeNavigationUrl)
                ) {
                    complete(false)
                }
            }

            @Deprecated("Only used for the pre-API-23 main-frame callback")
            override fun onReceivedError(
                view: WebView?,
                errorCode: Int,
                description: String?,
                failingUrl: String?
            ) {
                // On newer Android versions this legacy overload can also be called for a broken
                // subresource. The request-based overload above identifies the main frame.
                if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M &&
                    matchesNavigationFailure(failingUrl, activeNavigationUrl)
                ) {
                    complete(false)
                }
            }

            override fun onReceivedHttpError(
                view: WebView?,
                request: WebResourceRequest?,
                errorResponse: WebResourceResponse?
            ) {
                if (request?.isForMainFrame == true &&
                    (errorResponse?.statusCode ?: 0) >= 400 &&
                    matchesNavigationFailure(request.url?.toString(), activeNavigationUrl)
                ) {
                    complete(false)
                }
            }

            override fun onRenderProcessGone(
                view: WebView?,
                detail: RenderProcessGoneDetail?
            ): Boolean {
                ui.post { handleRendererGone(view) }
                return true
            }

            override fun onPageFinished(view: WebView?, finishedUrl: String?) {
                // Redirects may produce more than one callback. A result is accepted only when
                // the finished URL is the WebView's current main-frame URL. A DOM marker also
                // protects Android 5.x, where onReceivedHttpError does not exist, and rejects a
                // 200 login/error/picker page reached through a redirect.
                if (finishedUrl != null && finishedUrl == view?.url && view != null &&
                    hasSameOrigin(url, finishedUrl)
                ) {
                    verifyDisplayDocument(view) { isDisplay -> complete(isDisplay) }
                }
            }
        }

        removePairing()
        ui.postDelayed(timeout, DISPLAY_LOAD_TIMEOUT_MS)
        try {
            targetWeb.loadUrl(url)
        } catch (_: Exception) {
            complete(false)
        }
    }

    /**
     * Once initial verification succeeds, continue watching main-frame navigation. Otherwise a
     * later router reload or network loss can leave Chromium's error page on an unattended TV
     * forever even though the initial callback already completed.
     */
    private fun connectedDisplayClient(token: Long, initialVerifiedUrl: String?): WebViewClient {
        val failure = OneShotLoadResult()
        var verifiedUrl = initialVerifiedUrl
        var activeNavigationUrl = initialVerifiedUrl

        fun clearNavigationTimeout() {
            activeNavigationTimeout?.let(ui::removeCallbacks)
            activeNavigationTimeout = null
        }

        fun reconnect() {
            if (!failure.tryComplete() || !isCurrent(token)) return
            clearNavigationTimeout()
            val reconnectToken = beginAttempt()
            showPairing(prefs.getString(KEY_CODE, null))
            setStatus("The display connection was lost. Reconnecting automatically.")
            scheduleRetry(reconnectToken)
        }

        fun armNavigationTimeout() {
            clearNavigationTimeout()
            lateinit var timeout: Runnable
            timeout = Runnable {
                if (activeNavigationTimeout === timeout) {
                    activeNavigationTimeout = null
                    reconnect()
                }
            }
            activeNavigationTimeout = timeout
            ui.postDelayed(timeout, DISPLAY_LOAD_TIMEOUT_MS)
        }

        return object : WebViewClient() {
            override fun onPageStarted(view: WebView?, startedUrl: String?, favicon: Bitmap?) {
                if (!isCurrent(token)) return
                if (startedUrl == null) return
                val trustedOrigin = verifiedUrl
                if (trustedOrigin == null || hasSameOrigin(trustedOrigin, startedUrl)) {
                    activeNavigationUrl = startedUrl
                    armNavigationTimeout()
                } else {
                    reconnect()
                }
            }

            override fun onReceivedError(
                view: WebView?,
                request: WebResourceRequest?,
                error: WebResourceError?
            ) {
                if (request?.isForMainFrame == true &&
                    matchesNavigationFailure(request.url?.toString(), activeNavigationUrl)
                ) {
                    reconnect()
                }
            }

            @Deprecated("Only used for the pre-API-23 main-frame callback")
            override fun onReceivedError(
                view: WebView?,
                errorCode: Int,
                description: String?,
                failingUrl: String?
            ) {
                if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M &&
                    matchesNavigationFailure(failingUrl, activeNavigationUrl)
                ) {
                    reconnect()
                }
            }

            override fun onReceivedHttpError(
                view: WebView?,
                request: WebResourceRequest?,
                errorResponse: WebResourceResponse?
            ) {
                if (request?.isForMainFrame == true &&
                    (errorResponse?.statusCode ?: 0) >= 400 &&
                    matchesNavigationFailure(request.url?.toString(), activeNavigationUrl)
                ) {
                    reconnect()
                }
            }

            override fun onRenderProcessGone(
                view: WebView?,
                detail: RenderProcessGoneDetail?
            ): Boolean {
                ui.post { handleRendererGone(view) }
                return true
            }

            override fun onPageFinished(view: WebView?, finishedUrl: String?) {
                if (finishedUrl != null && finishedUrl == view?.url && view != null) {
                    verifyDisplayDocument(view) { isDisplay ->
                        if (!isCurrent(token)) return@verifyDisplayDocument
                        if (isDisplay) {
                            clearNavigationTimeout()
                            verifiedUrl = finishedUrl
                            activeNavigationUrl = finishedUrl
                        } else {
                            reconnect()
                        }
                    }
                }
            }
        }
    }

    private fun verifyDisplayDocument(view: WebView, onResult: (Boolean) -> Unit) {
        try {
            view.evaluateJavascript(DISPLAY_MARKER_SCRIPT) { rawResult ->
                onResult(rawResult == "true")
            }
        } catch (_: Exception) {
            onResult(false)
        }
    }

    /** Ignore a late failure from the previous candidate after the WebView has navigated again. */
    private fun matchesNavigationFailure(failingUrl: String?, activeUrl: String?): Boolean {
        if (failingUrl == null || activeUrl == null) return false
        return try {
            val failing = URL(failingUrl)
            val active = URL(activeUrl)
            failing.protocol.equals(active.protocol, ignoreCase = true) &&
                failing.host.equals(active.host, ignoreCase = true) &&
                effectivePort(failing) == effectivePort(active) &&
                (failing.path.ifEmpty { "/" }) == (active.path.ifEmpty { "/" }) &&
                failing.query == active.query
        } catch (_: Exception) {
            failingUrl == activeUrl
        }
    }

    private fun hasSameOrigin(expectedUrl: String, candidateUrl: String): Boolean {
        return try {
            val expected = URL(expectedUrl)
            val candidate = URL(candidateUrl)
            expected.protocol.equals(candidate.protocol, ignoreCase = true) &&
                expected.host.equals(candidate.host, ignoreCase = true) &&
                effectivePort(expected) == effectivePort(candidate)
        } catch (_: Exception) {
            false
        }
    }

    private fun effectivePort(url: URL): Int = if (url.port >= 0) url.port else url.defaultPort

    /**
     * Recover renderer crashes with bounded backoff. Three automatic reloads are allowed in a
     * five-minute window; after that the pairing overlay remains visible until a person retries
     * or the activity restarts, preventing an unattended crash/reload loop.
     */
    private fun handleRendererGone(crashedView: WebView?) {
        if (destroyed || crashedView !== web) return

        val now = SystemClock.elapsedRealtime()
        if (rendererCrashWindowStartedAt == 0L ||
            now - rendererCrashWindowStartedAt > RENDERER_CRASH_WINDOW_MS
        ) {
            rendererCrashWindowStartedAt = now
            rendererCrashCount = 0
        }
        rendererCrashCount++

        val token = beginAttempt(stopCurrentLoad = false)
        replaceWebView()
        showPairing(pendingCode ?: prefs.getString(KEY_CODE, null))

        if (rendererCrashCount > MAX_RENDERER_RECOVERIES) {
            setStatus(
                "The display stopped after repeated renderer crashes. " +
                    "Select Connect to retry, or restart the TV."
            )
            return
        }

        val delay = RENDERER_RECOVERY_DELAYS_MS[rendererCrashCount - 1]
        setStatus(
            "The display renderer stopped. Automatic recovery " +
                "$rendererCrashCount/$MAX_RENDERER_RECOVERIES starts shortly."
        )
        rendererRecoveryToken = token
        ui.postDelayed(rendererRecoveryRunnable, delay)
    }

    private fun replaceWebView() {
        try {
            root.removeView(web)
        } catch (_: Exception) {
        }
        try {
            web.destroy()
        } catch (_: Exception) {
        }
        web = WebView(this)
        setupWebView(web)
        root.addView(web, 0, FrameLayout.LayoutParams(MATCH_PARENT, MATCH_PARENT))
    }

    private fun recoverAfterRendererCrash(token: Long) {
        if (!isCurrent(token)) return
        pendingCode?.let {
            connectWithCode(it)
            return
        }

        val url = prefs.getString(KEY_LAST_URL, null)
        val code = prefs.getString(KEY_CODE, null)
        when {
            url != null -> loadSavedDisplay(url, code)
            code != null -> connectWithCode(code)
            else -> showPairing(null)
        }
    }

    private fun resetRendererCrashGuard() {
        rendererCrashWindowStartedAt = 0L
        rendererCrashCount = 0
    }

    // ---- Pairing and connection ----

    private sealed class ResolveResult {
        data class Success(val info: JSONObject) : ResolveResult()
        object NotFound : ResolveResult()
        data class RateLimited(val statusCode: Int) : ResolveResult()
        data class ServerError(val statusCode: Int) : ResolveResult()
        data class ClientError(val statusCode: Int) : ResolveResult()
        data class NetworkError(val detail: String?) : ResolveResult()
        data class InvalidResponse(val detail: String?) : ResolveResult()
    }

    private data class DisplayCandidate(val url: String, val viaCloud: Boolean)

    private fun connectWithCode(rawCode: String) {
        val code = normalizePairingCode(rawCode)
        if (code == null) {
            showPairing(rawCode.trim())
            setStatus("The pairing code must contain exactly 4 digits.")
            return
        }

        val token = beginAttempt()
        pendingCode = code
        showPairing(code)
        setStatus("Connecting...")

        runNetwork {
            if (!isCurrent(token)) return@runNetwork
            when (val result = resolve(code)) {
                is ResolveResult.Success -> connectResolved(code, result.info, token)
                ResolveResult.NotFound -> runOnCurrent(token) {
                    pendingCode = null
                    setStatus("Pairing code not found. Check the code shown on the POS screen.")
                    // A 404 is terminal for this code. Do not hammer the resolver automatically.
                }
                is ResolveResult.RateLimited -> runOnCurrent(token) {
                    setStatus("The pairing service is busy (HTTP ${result.statusCode}). Retrying automatically.")
                    scheduleRetry(token)
                }
                is ResolveResult.ServerError -> runOnCurrent(token) {
                    setStatus(
                        "The pairing service is temporarily unavailable " +
                            "(HTTP ${result.statusCode}). Retrying automatically."
                    )
                    scheduleRetry(token)
                }
                is ResolveResult.ClientError -> runOnCurrent(token) {
                    pendingCode = null
                    setStatus(
                        "The pairing request was rejected (HTTP ${result.statusCode}). " +
                            "Check the code and update the TV app if this continues."
                    )
                }
                is ResolveResult.NetworkError -> runOnCurrent(token) {
                    setStatus("Cannot reach the pairing service. Check the TV internet connection; retrying automatically.")
                    scheduleRetry(token)
                }
                is ResolveResult.InvalidResponse -> runOnCurrent(token) {
                    setStatus("The pairing service returned invalid data. Retrying automatically.")
                    scheduleRetry(token)
                }
            }
        }
    }

    private fun connectResolved(code: String, info: JSONObject, token: Long) {
        if (!isCurrent(token)) return

        val lanIps = info.optJSONArray("lanIps") ?: JSONArray()
        val requestedPort = info.optInt("port", DEFAULT_DISPLAY_PORT)
        val port = if (requestedPort in 1..65535) requestedPort else DEFAULT_DISPLAY_PORT
        val profile = info.optString("profile", "default")
        val cloudUrl = normalizeCloudDisplayUrl(info.optString("cloudUrl", "").trim(), profile)

        val candidateUrls = linkedSetOf<String>()
        val ipCount = minOf(lanIps.length(), MAX_LAN_CANDIDATES)
        for (index in 0 until ipCount) {
            if (!isCurrent(token)) return
            val ip = lanIps.optString(index).trim()
            if (ip.isNotEmpty() && reachable(ip, port)) {
                candidateUrls.add(lanDisplayUrl(ip, port, profile))
            }
        }

        val candidates = candidateUrls.map { DisplayCandidate(it, viaCloud = false) }.toMutableList()
        if (cloudUrl != null) candidates.add(DisplayCandidate(cloudUrl, viaCloud = true))

        if (candidates.isEmpty()) {
            runOnCurrent(token) {
                setStatus(
                    "The restaurant was found, but neither its POS nor cloud display is reachable. " +
                        "Check WiFi and the POS PC; retrying automatically."
                )
                scheduleRetry(token)
            }
            return
        }

        runOnCurrent(token) { loadResolvedCandidate(code, candidates, 0, token) }
    }

    /** Marker-verify every reachable LAN candidate in order, then try cloud as the last resort. */
    private fun loadResolvedCandidate(
        code: String,
        candidates: List<DisplayCandidate>,
        index: Int,
        token: Long
    ) {
        if (!isCurrent(token)) return
        if (index >= candidates.size) {
            showPairing(code)
            setStatus("The display page did not load from LAN or cloud. Retrying automatically.")
            scheduleRetry(token)
            return
        }

        val candidate = candidates[index]
        loadDisplay(candidate.url, token) { ok ->
            if (ok) {
                // Persist the entire tuple only after this exact candidate's marker is verified.
                prefs.edit()
                    .putString(KEY_CODE, code)
                    .putString(KEY_LAST_URL, candidate.url)
                    .putBoolean(KEY_VIA_CLOUD, candidate.viaCloud)
                    .apply()
                pendingCode = null
                retryAttempt = 0
                if (candidate.viaCloud) {
                    // LAN candidates were just exhausted; wait before probing them again.
                    scheduleLanReprobe(token)
                }
            } else {
                loadResolvedCandidate(code, candidates, index + 1, token)
            }
        }
    }

    /**
     * Resolve the code while preserving operationally useful error classes. In particular, a
     * 404 is a bad/expired code, a 5xx is a service outage, and IO failures indicate networking.
     */
    private fun resolve(code: String): ResolveResult {
        val startedAt = SystemClock.elapsedRealtime()
        return try {
            val separator = if (resolver().contains('?')) '&' else '?'
            val encodedCode = URLEncoder.encode(code, "UTF-8")
            val connection = URL("${resolver()}$separator" + "code=$encodedCode")
                .openConnection() as HttpURLConnection
            try {
                connection.connectTimeout = RESOLVER_TIMEOUT_MS
                connection.readTimeout = RESOLVER_TIMEOUT_MS
                connection.requestMethod = "GET"
                connection.setRequestProperty("Accept", "application/json")
                val status = connection.responseCode
                when (classifyResolverHttpStatus(status)) {
                    ResolverHttpDisposition.SUCCESS -> {
                        val body = readResolverBody(connection, startedAt)
                        try {
                            ResolveResult.Success(JSONObject(body))
                        } catch (error: Exception) {
                            ResolveResult.InvalidResponse(error.message)
                        }
                    }
                    ResolverHttpDisposition.NOT_FOUND -> ResolveResult.NotFound
                    ResolverHttpDisposition.RATE_LIMITED -> ResolveResult.RateLimited(status)
                    ResolverHttpDisposition.SERVER_ERROR -> ResolveResult.ServerError(status)
                    ResolverHttpDisposition.CLIENT_ERROR -> ResolveResult.ClientError(status)
                }
            } finally {
                connection.disconnect()
            }
        } catch (error: IOException) {
            ResolveResult.NetworkError(error.message)
        } catch (error: Exception) {
            ResolveResult.InvalidResponse(error.message)
        }
    }

    private fun readResolverBody(connection: HttpURLConnection, startedAt: Long): String {
        val output = StringBuilder()
        val buffer = CharArray(4_096)
        connection.inputStream.bufferedReader().use { reader ->
            while (true) {
                if (SystemClock.elapsedRealtime() - startedAt > RESOLVER_TOTAL_TIMEOUT_MS) {
                    throw IOException("Pairing response exceeded the total time limit")
                }
                val count = reader.read(buffer)
                if (SystemClock.elapsedRealtime() - startedAt > RESOLVER_TOTAL_TIMEOUT_MS) {
                    throw IOException("Pairing response exceeded the total time limit")
                }
                if (count < 0) break
                if (output.length + count > MAX_RESOLVER_BODY_CHARS) {
                    throw IllegalStateException("Pairing response exceeded the size limit")
                }
                output.append(buffer, 0, count)
            }
        }
        return output.toString()
    }

    /** Re-probe LAN periodically while the verified cloud page remains the active display. */
    private fun startLanReprobe() {
        if (destroyed || !prefs.getBoolean(KEY_VIA_CLOUD, false)) return
        val code = prefs.getString(KEY_CODE, null) ?: return
        val cloudUrl = prefs.getString(KEY_LAST_URL, null) ?: return
        val token = attempts.current()

        runNetwork {
            if (!isCurrent(token)) return@runNetwork
            val result = resolve(code)
            if (!isCurrent(token)) return@runNetwork

            if (result is ResolveResult.Success) {
                val info = result.info
                val requestedPort = info.optInt("port", DEFAULT_DISPLAY_PORT)
                val port = if (requestedPort in 1..65535) requestedPort else DEFAULT_DISPLAY_PORT
                val profile = info.optString("profile", "default")
                val lanIps = info.optJSONArray("lanIps") ?: JSONArray()
                val ipCount = minOf(lanIps.length(), MAX_LAN_CANDIDATES)
                val lanCandidates = linkedSetOf<String>()
                for (index in 0 until ipCount) {
                    if (!isCurrent(token)) return@runNetwork
                    val ip = lanIps.optString(index).trim()
                    if (ip.isNotEmpty() && reachable(ip, port)) {
                        lanCandidates.add(lanDisplayUrl(ip, port, profile))
                    }
                }
                if (lanCandidates.isNotEmpty()) {
                    runOnCurrent(token) {
                        switchCloudDisplayToLan(code, cloudUrl, lanCandidates.toList(), 0)
                    }
                    return@runNetwork
                }
            }

            runOnCurrent(token) { scheduleLanReprobe(token) }
        }
    }

    private fun scheduleLanReprobe(token: Long) {
        if (!isCurrent(token) || !prefs.getBoolean(KEY_VIA_CLOUD, false)) return
        ui.removeCallbacks(lanReprobeRunnable)
        ui.postDelayed(lanReprobeRunnable, LAN_REPROBE_INTERVAL_MS)
    }

    /** Do not overwrite the verified cloud tuple until the LAN page itself has loaded. */
    private fun switchCloudDisplayToLan(
        code: String,
        cloudUrl: String,
        lanCandidates: List<String>,
        index: Int
    ) {
        if (index >= lanCandidates.size) {
            restoreCloudAfterFailedLanSwitch(code, cloudUrl)
            return
        }

        val token = beginAttempt()
        val lanUrl = lanCandidates[index]
        loadDisplay(lanUrl, token) { ok ->
            if (ok) {
                prefs.edit()
                    .putString(KEY_CODE, code)
                    .putString(KEY_LAST_URL, lanUrl)
                    .putBoolean(KEY_VIA_CLOUD, false)
                    .apply()
                retryAttempt = 0
            } else {
                switchCloudDisplayToLan(code, cloudUrl, lanCandidates, index + 1)
            }
        }
    }

    private fun restoreCloudAfterFailedLanSwitch(code: String, cloudUrl: String) {
        val token = beginAttempt()
        loadDisplay(cloudUrl, token) { restored ->
            if (restored) {
                retryAttempt = 0
                // A TCP-reachable but invalid endpoint must not create a cloud/LAN hot loop.
                scheduleLanReprobe(token)
            } else {
                connectWithCode(code)
            }
        }
    }

    private fun lanDisplayUrl(ip: String, port: Int, profile: String): String {
        val host = if (ip.contains(':') && !ip.startsWith("[")) "[$ip]" else ip
        val base = "http://$host:$port/display"
        return if (profile.isEmpty() || profile == "default") {
            base
        } else {
            "$base?profile=${URLEncoder.encode(profile, "UTF-8")}"
        }
    }

    /**
     * The current resolver's default-profile URL omits `profile=default`; restaurants with more
     * than one screen are then sent to an interactive profile picker. Point known cloud TV URLs
     * directly at the resolved profile while leaving third-party/test resolver URLs untouched.
     */
    private fun normalizeCloudDisplayUrl(rawUrl: String, profile: String): String? {
        if (!isHttpUrl(rawUrl)) return null
        return try {
            val parsed = URL(rawUrl)
            val isManagedTvUrl = parsed.host.equals("fastfood-manager.vercel.app", ignoreCase = true) &&
                parsed.path.startsWith("/tv/")
            if (!isManagedTvUrl || Uri.parse(rawUrl).getQueryParameter("profile") != null) {
                rawUrl
            } else {
                Uri.parse(rawUrl).buildUpon()
                    .appendQueryParameter("profile", profile.ifBlank { "default" })
                    .build()
                    .toString()
            }
        } catch (_: Exception) {
            null
        }
    }

    /** Quick TCP probe so an unreachable adapter cannot stall the kiosk indefinitely. */
    private fun reachable(ip: String, port: Int): Boolean {
        return try {
            Socket().use { socket ->
                socket.connect(InetSocketAddress(ip, port), LAN_PROBE_TIMEOUT_MS)
                true
            }
        } catch (_: Exception) {
            false
        }
    }

    private fun isHttpUrl(value: String): Boolean {
        return try {
            val parsed = URL(value)
            (parsed.protocol == "http" || parsed.protocol == "https") && parsed.host.isNotBlank()
        } catch (_: Exception) {
            false
        }
    }

    // ---- Pairing UI (framework widgets keep the APK small and TV-compatible) ----

    private var pairingView: View? = null
    private var statusView: TextView? = null

    private fun showPairing(prefill: String?) {
        if (pairingView != null) return
        val padding = (32 * resources.displayMetrics.density).toInt()
        val container = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setBackgroundColor(Color.parseColor("#0b0b0f"))
            setPadding(padding, padding, padding, padding)
        }
        val title = TextView(this).apply {
            text = "Fast Food Manager - TV"
            setTextColor(Color.WHITE)
            textSize = 28f
            gravity = Gravity.CENTER
        }
        val subtitle = TextView(this).apply {
            text = "Enter the 4-digit code shown on the POS\n(Settings > Ambiance Screen)"
            setTextColor(Color.parseColor("#9aa0aa"))
            textSize = 16f
            gravity = Gravity.CENTER
            setPadding(0, padding / 2, 0, padding / 2)
        }
        val input = EditText(this).apply {
            inputType = InputType.TYPE_CLASS_NUMBER
            filters = arrayOf(InputFilter.LengthFilter(4))
            imeOptions = EditorInfo.IME_ACTION_DONE
            setSingleLine(true)
            hint = "1234"
            setTextColor(Color.WHITE)
            setHintTextColor(Color.parseColor("#6f7480"))
            textSize = 40f
            gravity = Gravity.CENTER
            if (prefill != null) setText(prefill)
        }
        val submitCode = {
            val code = normalizePairingCode(input.text.toString())
            if (code != null) {
                retryAttempt = 0
                resetRendererCrashGuard()
                connectWithCode(code)
            } else {
                setStatus("The pairing code must contain exactly 4 digits.")
            }
        }
        val connect = Button(this).apply {
            text = "Connect"
            textSize = 20f
            setOnClickListener { submitCode() }
        }
        input.setOnEditorActionListener { _, actionId, event ->
            val remoteEnter = event?.let {
                it.keyCode == KeyEvent.KEYCODE_ENTER && it.action == KeyEvent.ACTION_DOWN
            } == true
            if (actionId == EditorInfo.IME_ACTION_DONE || remoteEnter) {
                submitCode()
                true
            } else {
                false
            }
        }
        val status = TextView(this).apply {
            setTextColor(Color.parseColor("#ffcc66"))
            textSize = 15f
            gravity = Gravity.CENTER
            setPadding(0, padding / 2, 0, 0)
        }
        statusView = status
        container.addView(title, layoutParams())
        container.addView(subtitle, layoutParams())
        container.addView(input, layoutParams(widthDp = 320))
        container.addView(connect, layoutParams(widthDp = 320, topDp = 24))
        container.addView(status, layoutParams())
        pairingView = container
        root.addView(container, FrameLayout.LayoutParams(MATCH_PARENT, MATCH_PARENT))
        input.requestFocus()
    }

    private fun removePairing() {
        pairingView?.let { root.removeView(it) }
        pairingView = null
        statusView = null
    }

    private fun setStatus(message: String) {
        if (statusView == null) {
            showPairing(pendingCode ?: prefs.getString(KEY_CODE, null))
        }
        statusView?.text = message
    }

    private fun layoutParams(
        widthDp: Int = WRAP_CONTENT,
        topDp: Int = 0
    ): LinearLayout.LayoutParams {
        val density = resources.displayMetrics.density
        val width = if (widthDp == WRAP_CONTENT) WRAP_CONTENT else (widthDp * density).toInt()
        return LinearLayout.LayoutParams(width, WRAP_CONTENT).apply {
            topMargin = (topDp * density).toInt()
            gravity = Gravity.CENTER_HORIZONTAL
        }
    }

    private fun hideSystemUi() {
        @Suppress("DEPRECATION")
        window.decorView.systemUiVisibility = (
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY or
                View.SYSTEM_UI_FLAG_FULLSCREEN or
                View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or
                View.SYSTEM_UI_FLAG_LAYOUT_STABLE or
                View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN or
                View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
            )
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) hideSystemUi()
    }

    override fun onBackPressed() {
        // Kiosk mode: Back must not leave the unattended display.
    }

    override fun onDestroy() {
        destroyed = true
        attempts.begin()
        networkExecutor.shutdownNow()
        // This removes retry, LAN re-probe, renderer recovery, load timeout, and queued UI work.
        ui.removeCallbacksAndMessages(null)
        activeLoadTimeout = null
        activeNavigationTimeout = null
        if (::web.isInitialized) {
            try {
                web.stopLoading()
                web.webViewClient = WebViewClient()
                root.removeView(web)
                web.destroy()
            } catch (_: Exception) {
            }
        }
        super.onDestroy()
    }

    companion object {
        private const val PREFS_NAME = "ffm_tv"
        private const val KEY_CODE = "code"
        private const val KEY_LAST_URL = "last_url"
        private const val KEY_VIA_CLOUD = "via_cloud"
        private const val KEY_RESOLVER_OVERRIDE = "resolver_override"

        private const val DEFAULT_DISPLAY_PORT = 3333
        private const val RESOLVER_TIMEOUT_MS = 6_000
        private const val RESOLVER_TOTAL_TIMEOUT_MS = 15_000L
        private const val MAX_RESOLVER_BODY_CHARS = 64 * 1_024
        private const val LAN_PROBE_TIMEOUT_MS = 900
        private const val MAX_LAN_CANDIDATES = 12
        private const val NETWORK_WORKERS = 2
        private const val NETWORK_QUEUE_CAPACITY = 2
        private const val DISPLAY_LOAD_TIMEOUT_MS = 25_000L
        private const val LAN_REPROBE_INTERVAL_MS = 10 * 60 * 1_000L
        private const val DISPLAY_MARKER_SCRIPT =
            "document.title === 'Display' && document.getElementById('panelStage') !== null"

        private const val MAX_RENDERER_RECOVERIES = 3
        private const val RENDERER_CRASH_WINDOW_MS = 5 * 60 * 1_000L
        private val RENDERER_RECOVERY_DELAYS_MS = longArrayOf(1_000L, 5_000L, 15_000L)
    }
}
