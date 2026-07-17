import { app, safeStorage } from 'electron'
import { getDb } from '../database/connection'
import { settingsRepo } from '../database/repositories/settings.repo'
import { getEndpoints } from '../config/endpoints'
import {
  createLicenseClient,
  type DeviceSecretStorage,
  type KeyValueStorage,
  type LicenseClient,
  type LicenseDecision
} from './license-client'
import { BAKED_LICENSE_KEYS } from './license-keys'
import { getMachineId, getPinnedMachineId, validateActivationForMachine } from './activation'

/**
 * Production wiring for the desktop entitlement client (brief WP-D §2). Everything licensing goes
 * through here against getEndpoints().licenseServerUrl — no more direct Supabase licensing calls.
 */

// Settings-backed key/value store for the client's floor/cache/machine-id persistence.
const kvStorage: KeyValueStorage = {
  get(key) {
    return settingsRepo.get(key) ?? undefined
  },
  set(key, value) {
    settingsRepo.set(key, value)
  },
  delete(key) {
    getDb().prepare('DELETE FROM settings WHERE key = ?').run(key)
  }
}

const DEVICE_SECRET_KEY = 'license_device_secret'
const DEVICE_SECRET_ENC = 'license_device_secret_enc' // 'safe' (encrypted) | 'plain' (fallback)

/**
 * Device credential store (CONTRACT.md §1.2): raw secret encrypted via Electron safeStorage, with a
 * flagged plaintext settings fallback when the OS keychain is unavailable. The secret is only ever
 * read to build the Device header inside the client and is never logged.
 */
class SafeStorageDeviceSecret implements DeviceSecretStorage {
  fallback = false

  private encryptionAvailable(): boolean {
    try {
      return safeStorage.isEncryptionAvailable()
    } catch {
      return false
    }
  }

  load(): string | undefined {
    const stored = settingsRepo.get(DEVICE_SECRET_KEY)
    if (!stored) return undefined
    const mode = settingsRepo.get(DEVICE_SECRET_ENC)
    if (mode === 'safe') {
      try {
        return safeStorage.decryptString(Buffer.from(stored, 'base64'))
      } catch {
        return undefined
      }
    }
    this.fallback = true
    return stored
  }

  save(secret: string): void {
    if (this.encryptionAvailable()) {
      try {
        settingsRepo.set(DEVICE_SECRET_KEY, safeStorage.encryptString(secret).toString('base64'))
        settingsRepo.set(DEVICE_SECRET_ENC, 'safe')
        this.fallback = false
        return
      } catch {
        // fall through to plaintext fallback below
      }
    }
    settingsRepo.set(DEVICE_SECRET_KEY, secret)
    settingsRepo.set(DEVICE_SECRET_ENC, 'plain')
    this.fallback = true
  }

  clear(): void {
    kvStorage.delete(DEVICE_SECRET_KEY)
    kvStorage.delete(DEVICE_SECRET_ENC)
  }
}

let client: LicenseClient | undefined

function getLicenseClient(): LicenseClient {
  if (client) return client
  client = createLicenseClient({
    licenseServerUrl: getEndpoints().licenseServerUrl,
    appVersion: safeAppVersion(),
    publicKeys: BAKED_LICENSE_KEYS,
    storage: kvStorage,
    deviceSecretStorage: new SafeStorageDeviceSecret(),
    clock: { now: () => Date.now() },
    recomputeMachineId: () => getMachineId(),
    // Legacy paid machine detection — gates the one-time 7-day migration on a definitive 404 (B3).
    // Validate the HMAC serial against the PINNED id (the id the license was issued for), NOT a
    // fresh host recompute; and treat an admin-granted cloud license (CLOUD-VERIFIED) as legacy paid
    // too, so neither class is locked out immediately before D1 seeding completes.
    legacySerialIsValid: () => {
      const code = settingsRepo.get('activation_code')
      if (!code) return false
      if (code === 'CLOUD-VERIFIED') return true
      try {
        return validateActivationForMachine(code, getPinnedMachineId())
      } catch {
        return false
      }
    }
  })
  return client
}

function safeAppVersion(): string {
  try {
    return app.getVersion()
  } catch {
    return '0.0.0'
  }
}

/** Read-only periodic/startup entitlement check. Inconclusive never flips licensed→locked. */
export function checkLicense(): Promise<LicenseDecision> {
  return getLicenseClient().check()
}

/** The ONLY path that creates a fresh trial (explicit activation action → /v1/trial/start). */
export function startLicenseTrial(input: { restaurantName?: string; phone?: string }): Promise<LicenseDecision> {
  return getLicenseClient().startTrial(input)
}

export function licenseDiagnostics(): Pick<LicenseDecision, 'machineIdMismatch' | 'deviceSecretStorageFallback'> {
  return getLicenseClient().diagnostics()
}

/**
 * The current device ACCESS token (CONTRACT §1.3, typ 'access', ~1h TTL) from the last successful
 * /check, refreshed via a /check when stale. Null only when genuinely unlicensed / never checked.
 * This is the credential the desktop presents as `Authorization: Bearer <token>` to the admin
 * endpoints that enable remote ordering and provision the owner-dashboard credential. NEVER log it.
 */
export function getDeviceAccessToken(): Promise<string | null> {
  return getLicenseClient().getAccessToken()
}
