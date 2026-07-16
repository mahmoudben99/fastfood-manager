package com.fastfood.tv

import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicLong

/**
 * Assigns a monotonically increasing token to each connection attempt.
 *
 * Network and WebView callbacks can arrive after a newer manual or automatic attempt has
 * started. Callers must hold the token they were given and verify it before changing UI or
 * persisted connection state.
 */
internal class ConnectionAttemptGate {
    private val generation = AtomicLong(0)

    fun begin(): Long = generation.incrementAndGet()

    fun current(): Long = generation.get()

    fun isCurrent(token: Long): Boolean = generation.get() == token
}

/** Makes a WebView load result terminal: the first success/failure wins. */
internal class OneShotLoadResult {
    private val completed = AtomicBoolean(false)

    fun tryComplete(): Boolean = completed.compareAndSet(false, true)
}

internal enum class ResolverHttpDisposition {
    SUCCESS,
    NOT_FOUND,
    RATE_LIMITED,
    SERVER_ERROR,
    CLIENT_ERROR
}

internal fun classifyResolverHttpStatus(statusCode: Int): ResolverHttpDisposition = when {
    statusCode == 200 -> ResolverHttpDisposition.SUCCESS
    statusCode == 404 -> ResolverHttpDisposition.NOT_FOUND
    statusCode == 429 -> ResolverHttpDisposition.RATE_LIMITED
    statusCode == 408 || statusCode == 425 -> ResolverHttpDisposition.SERVER_ERROR
    statusCode in 500..599 -> ResolverHttpDisposition.SERVER_ERROR
    else -> ResolverHttpDisposition.CLIENT_ERROR
}

/** Accept locale-specific decimal digits but send the resolver canonical ASCII digits. */
internal fun normalizePairingCode(rawCode: String): String? {
    val trimmed = rawCode.trim()
    if (trimmed.length != 4) return null

    val normalized = StringBuilder(4)
    for (character in trimmed) {
        val digit = Character.digit(character, 10)
        if (digit !in 0..9) return null
        normalized.append(('0'.code + digit).toChar())
    }
    return normalized.toString()
}
