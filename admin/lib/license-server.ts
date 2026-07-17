// SERVER-ONLY client for the license-server admin API (Cloudflare Worker + D1).
// NEVER import this from a 'use client' component or expose LICENSE_ADMIN_BEARER to the browser.
// All calls happen from server components / route handlers only.
//
// Mirrors license-server/src/index.ts admin endpoints exactly (see CONTRACT.md §1.5):
//   POST /v1/admin/list    body { search?, limit?, offset? } -> { licenses: LicenseRow[] }
//   POST /v1/admin/get     body { machineId }                -> { license: LicenseRow } | 404
//   POST /v1/admin/mutate  body { machineId, action, ...args } -> { ok: true, license: LicenseRow }

const DEFAULT_LICENSE_SERVER_URL = 'https://ffm-license.xilentm20.workers.dev'

export type LicenseStatus = 'trial' | 'active' | 'expired' | 'revoked'
export type LicensePlan = 'trial' | 'monthly' | 'yearly' | 'lifetime' | null

/** Shape returned by admin/list and admin/get (device_secret_hash is never included — see publicLicense() server-side). */
export interface LicenseRow {
  machine_id: string
  status: LicenseStatus
  plan: LicensePlan
  subscription_until: string | null
  restaurant_name: string | null
  phone: string | null
  app_version: string | null
  notes: string | null
  created_at: string
  updated_at: string
  last_seen: string | null
  last_ip: string | null
  check_count: number
  device_bound_at: string | null
  revision: number
  bound: boolean
  effective: LicenseStatus
}

export type MutateAction =
  | 'setPlan'
  | 'extend'
  | 'grantTrial'
  | 'revoke'
  | 'reinstate'
  | 'rebindDevice'
  | 'tombstone'
  | 'setInfo'

export interface MutateArgs {
  plan?: 'monthly' | 'yearly' | 'lifetime'
  until?: string
  days?: number
  restaurantName?: string
  phone?: string
  notes?: string
}

export type LicenseServerResult<T> = { ok: true; data: T } | { ok: false; error: string; status?: number }

function licenseServerUrl(): string {
  return (process.env.LICENSE_SERVER_URL || DEFAULT_LICENSE_SERVER_URL).replace(/\/+$/, '')
}

function adminBearer(): string | null {
  const value = process.env.LICENSE_ADMIN_BEARER
  return value && value.trim() ? value.trim() : null
}

/** Fail-closed check: the UI/routes must refuse to call the license server at all when this is false. */
export function isLicenseServerConfigured(): boolean {
  return adminBearer() !== null
}

async function callAdmin<T>(path: string, body: Record<string, unknown>): Promise<LicenseServerResult<T>> {
  const bearer = adminBearer()
  if (!bearer) {
    // Fail-closed: never issue the request without a bearer.
    return { ok: false, error: 'not_configured' }
  }

  let response: Response
  try {
    response = await fetch(`${licenseServerUrl()}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${bearer}`
      },
      body: JSON.stringify(body),
      cache: 'no-store'
    })
  } catch {
    return { ok: false, error: 'network_error' }
  }

  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    return { ok: false, error: 'bad_response', status: response.status }
  }

  if (!response.ok) {
    const errorText =
      payload && typeof payload === 'object' && 'error' in payload && typeof (payload as { error: unknown }).error === 'string'
        ? (payload as { error: string }).error
        : 'request_failed'
    return { ok: false, error: errorText, status: response.status }
  }

  return { ok: true, data: payload as T }
}

export async function listLicenses(params?: {
  search?: string
  limit?: number
  offset?: number
}): Promise<LicenseServerResult<LicenseRow[]>> {
  const result = await callAdmin<{ licenses: LicenseRow[] }>('/v1/admin/list', params || {})
  return result.ok ? { ok: true, data: result.data.licenses } : result
}

export async function getLicense(machineId: string): Promise<LicenseServerResult<LicenseRow>> {
  const result = await callAdmin<{ license: LicenseRow }>('/v1/admin/get', { machineId })
  return result.ok ? { ok: true, data: result.data.license } : result
}

export async function mutateLicense(
  machineId: string,
  action: MutateAction,
  args: MutateArgs = {}
): Promise<LicenseServerResult<LicenseRow>> {
  const result = await callAdmin<{ ok: true; license: LicenseRow }>('/v1/admin/mutate', {
    machineId,
    action,
    ...args
  })
  return result.ok ? { ok: true, data: result.data.license } : result
}
