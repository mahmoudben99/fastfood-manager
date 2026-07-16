package com.fastfood.tv

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ConnectionAttemptGateTest {

    @Test
    fun newerAttemptInvalidatesEveryOlderToken() {
        val gate = ConnectionAttemptGate()
        val first = gate.begin()
        val second = gate.begin()

        assertFalse(gate.isCurrent(first))
        assertTrue(gate.isCurrent(second))
    }

    @Test
    fun loadResultCanCompleteOnlyOnce() {
        val result = OneShotLoadResult()

        assertTrue(result.tryComplete())
        assertFalse(result.tryComplete())
        assertFalse(result.tryComplete())
    }

    @Test
    fun lateLoadResultCannotBelongToNewAttempt() {
        val gate = ConnectionAttemptGate()
        val oldToken = gate.begin()
        val result = OneShotLoadResult()

        val newToken = gate.begin()

        assertTrue(result.tryComplete())
        assertFalse(gate.isCurrent(oldToken))
        assertTrue(gate.isCurrent(newToken))
    }

    @Test
    fun resolverStatusClassificationKeepsNotFoundAndOutageDistinct() {
        assertTrue(classifyResolverHttpStatus(200) == ResolverHttpDisposition.SUCCESS)
        assertTrue(classifyResolverHttpStatus(404) == ResolverHttpDisposition.NOT_FOUND)
        assertTrue(classifyResolverHttpStatus(429) == ResolverHttpDisposition.RATE_LIMITED)
        assertTrue(classifyResolverHttpStatus(408) == ResolverHttpDisposition.SERVER_ERROR)
        assertTrue(classifyResolverHttpStatus(425) == ResolverHttpDisposition.SERVER_ERROR)
        assertTrue(classifyResolverHttpStatus(503) == ResolverHttpDisposition.SERVER_ERROR)
        assertTrue(classifyResolverHttpStatus(401) == ResolverHttpDisposition.CLIENT_ERROR)
    }

    @Test
    fun pairingCodeNormalizesArabicAndPersianDigits() {
        assertTrue(normalizePairingCode("1234") == "1234")
        assertTrue(normalizePairingCode("\u0661\u0662\u0663\u0664") == "1234")
        assertTrue(normalizePairingCode("\u06F1\u06F2\u06F3\u06F4") == "1234")
        assertTrue(normalizePairingCode("12A4") == null)
    }
}
