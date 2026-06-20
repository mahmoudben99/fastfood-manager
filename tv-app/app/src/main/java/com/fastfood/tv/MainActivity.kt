package com.fastfood.tv

import android.app.Activity
import android.graphics.Color
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.text.InputType
import android.view.Gravity
import android.view.View
import android.view.ViewGroup.LayoutParams.MATCH_PARENT
import android.view.ViewGroup.LayoutParams.WRAP_CONTENT
import android.view.WindowManager
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.InetSocketAddress
import java.net.Socket
import java.net.URL
import kotlin.concurrent.thread

/**
 * Fast Food Manager — TV display kiosk.
 *
 * Flow: user types the 4-digit code shown in the POS Ambiance screen → we ask the cloud
 * resolver for that restaurant's connection info → try each LAN IP (instant, free) → fall
 * back to the cloud display URL only if none answer (firewall / AP-isolation / different
 * network). The working URL + code are remembered, so on every later boot it reconnects by
 * itself with no typing.
 */
class MainActivity : Activity() {

    private lateinit var root: FrameLayout
    private lateinit var web: WebView
    private val prefs by lazy { getSharedPreferences("ffm_tv", MODE_PRIVATE) }
    private val ui = Handler(Looper.getMainLooper())

    private val resolver = "https://fastfood-manager.vercel.app/api/pair"

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        hideSystemUi()

        root = FrameLayout(this).apply { setBackgroundColor(Color.BLACK) }
        web = WebView(this)
        setupWeb()
        root.addView(web, FrameLayout.LayoutParams(MATCH_PARENT, MATCH_PARENT))
        setContentView(root)

        val savedUrl = prefs.getString("last_url", null)
        val savedCode = prefs.getString("code", null)
        if (savedUrl != null) {
            loadDisplay(savedUrl) { ok ->
                if (!ok) {
                    if (savedCode != null) connectWithCode(savedCode) else showPairing(null)
                }
            }
        } else {
            showPairing(null)
        }
    }

    // ---- WebView ----

    @Suppress("SetJavaScriptEnabled")
    private fun setupWeb() {
        with(web.settings) {
            javaScriptEnabled = true
            domStorageEnabled = true
            mediaPlaybackRequiresUserGesture = false
            loadWithOverviewMode = true
            useWideViewPort = true
            cacheMode = android.webkit.WebSettings.LOAD_DEFAULT
        }
        web.setBackgroundColor(Color.BLACK)
    }

    private fun loadDisplay(url: String, onResult: (Boolean) -> Unit) {
        var failed = false
        web.webViewClient = object : WebViewClient() {
            override fun onReceivedError(
                view: WebView?, request: WebResourceRequest?, error: WebResourceError?
            ) {
                // Only treat main-frame failures as a real failure.
                if (request?.isForMainFrame == true && !failed) {
                    failed = true
                    ui.post { onResult(false) }
                }
            }

            override fun onPageFinished(view: WebView?, finishedUrl: String?) {
                if (!failed) ui.post { onResult(true) }
            }
        }
        ui.post {
            removePairing()
            web.loadUrl(url)
        }
    }

    // ---- Pairing / connection ----

    private fun connectWithCode(code: String) {
        setStatus("Connecting…")
        thread {
            try {
                val info = resolve(code)
                if (info == null) {
                    ui.post { setStatus("Code not found. Check the code on the POS screen.") }
                    return@thread
                }
                val lanIps = info.optJSONArray("lanIps") ?: JSONArray()
                val port = info.optInt("port", 3333)
                val cloudUrl = info.optString("cloudUrl", "")

                // Try the LAN IPs first (fast path).
                var target: String? = null
                for (i in 0 until lanIps.length()) {
                    val ip = lanIps.optString(i)
                    if (ip.isNotEmpty() && reachable(ip, port)) {
                        target = "http://$ip:$port/display"
                        break
                    }
                }
                // Fall back to the cloud display.
                if (target == null && cloudUrl.isNotEmpty()) target = cloudUrl

                if (target == null) {
                    ui.post { setStatus("Couldn't reach the POS. Make sure the TV and the POS PC are on the same WiFi.") }
                    return@thread
                }

                val finalUrl = target
                prefs.edit().putString("code", code).putString("last_url", finalUrl).apply()
                ui.post { loadDisplay(finalUrl) { ok -> if (!ok) showPairing(code) } }
            } catch (e: Exception) {
                ui.post { setStatus("Connection error: ${e.message}") }
            }
        }
    }

    /** Ask the cloud resolver for this code's connection info. */
    private fun resolve(code: String): JSONObject? {
        val conn = URL("$resolver?code=$code").openConnection() as HttpURLConnection
        return try {
            conn.connectTimeout = 6000
            conn.readTimeout = 6000
            conn.requestMethod = "GET"
            if (conn.responseCode != 200) return null
            JSONObject(conn.inputStream.bufferedReader().use { it.readText() })
        } catch (e: Exception) {
            null
        } finally {
            conn.disconnect()
        }
    }

    /** Quick TCP probe so we never hang on an unreachable (e.g. printer-NIC) address. */
    private fun reachable(ip: String, port: Int): Boolean {
        return try {
            Socket().use { s ->
                s.connect(InetSocketAddress(ip, port), 900)
                true
            }
        } catch (e: Exception) {
            false
        }
    }

    // ---- Pairing UI (built in code, no XML/appcompat deps) ----

    private var pairingView: View? = null
    private var statusView: TextView? = null

    private fun showPairing(prefill: String?) {
        if (pairingView != null) return
        val pad = (32 * resources.displayMetrics.density).toInt()
        val container = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setBackgroundColor(Color.parseColor("#0b0b0f"))
            setPadding(pad, pad, pad, pad)
        }
        val title = TextView(this).apply {
            text = "Fast Food Manager — TV"
            setTextColor(Color.WHITE)
            textSize = 28f
            gravity = Gravity.CENTER
        }
        val hint = TextView(this).apply {
            text = "Enter the 4-digit code shown on the POS\n(Settings → Ambiance Screen)"
            setTextColor(Color.parseColor("#9aa0aa"))
            textSize = 16f
            gravity = Gravity.CENTER
            setPadding(0, pad / 2, 0, pad / 2)
        }
        val input = EditText(this).apply {
            inputType = InputType.TYPE_CLASS_NUMBER
            hint = "1234"
            setTextColor(Color.WHITE)
            textSize = 40f
            gravity = Gravity.CENTER
            if (prefill != null) setText(prefill)
        }
        val connect = Button(this).apply {
            text = "Connect"
            textSize = 20f
            setOnClickListener {
                val code = input.text.toString().trim()
                if (code.length == 4) {
                    removePairing()
                    connectWithCode(code)
                } else {
                    setStatus("The code is 4 digits.")
                }
            }
        }
        val status = TextView(this).apply {
            setTextColor(Color.parseColor("#ffcc66"))
            textSize = 15f
            gravity = Gravity.CENTER
            setPadding(0, pad / 2, 0, 0)
        }
        statusView = status
        container.addView(title, lp())
        container.addView(hint, lp())
        container.addView(input, lp(widthDp = 320))
        container.addView(connect, lp(widthDp = 320, topDp = 24))
        container.addView(status, lp())
        pairingView = container
        root.addView(container, FrameLayout.LayoutParams(MATCH_PARENT, MATCH_PARENT))
        input.requestFocus()
    }

    private fun removePairing() {
        pairingView?.let { root.removeView(it) }
        pairingView = null
        statusView = null
    }

    private fun setStatus(msg: String) {
        if (statusView != null) statusView?.text = msg else showPairing(prefs.getString("code", null))
        statusView?.text = msg
    }

    private fun lp(widthDp: Int = WRAP_CONTENT, topDp: Int = 0): LinearLayout.LayoutParams {
        val d = resources.displayMetrics.density
        val w = if (widthDp == WRAP_CONTENT) WRAP_CONTENT else (widthDp * d).toInt()
        return LinearLayout.LayoutParams(w, WRAP_CONTENT).apply {
            topMargin = (topDp * d).toInt()
            gravity = Gravity.CENTER_HORIZONTAL
        }
    }

    private fun hideSystemUi() {
        @Suppress("DEPRECATION")
        window.decorView.systemUiVisibility = (
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                or View.SYSTEM_UI_FLAG_FULLSCREEN
                or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                or View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
            )
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) hideSystemUi()
    }

    override fun onBackPressed() {
        // Kiosk: don't let the back button leave the display. Long-press handling could be
        // added later for a maintenance exit.
    }
}
