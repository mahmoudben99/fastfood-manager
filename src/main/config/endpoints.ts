import { createRequire } from 'node:module'

/**
 * Desktop endpoint resolution (CONTRACT.md §4). Precedence per field: env > file > baked.
 *
 * The pure `resolveEndpoints({ baked, file, env, log })` carries NO Electron / filesystem /
 * module-cache coupling so the frozen acceptance test can exercise it deterministically. The
 * production entry point `getEndpoints()` layers process.env + userData/endpoints.json on top and
 * caches the result. Electron is loaded lazily (only inside getEndpoints) so importing this module
 * under `node --test` never pulls in the Electron runtime.
 */
export interface FfmEndpoints {
  supabaseUrl: string // https URL of the Supabase project
  supabaseAnonKey: string // publishable anon key (public by design)
  licenseServerUrl: string // https URL of the CF Worker, no trailing slash
}

/** Current production values, compiled in. licenseServerUrl = the LIVE ffm-license worker. */
export const BAKED_DEFAULTS: FfmEndpoints = {
  supabaseUrl: 'https://ijdiiixkemrmkhhkbcng.supabase.co',
  supabaseAnonKey: 'sb_publishable_xmW71xs0XzNYbTEwnmbLCA_ZmphJkIV',
  licenseServerUrl: 'https://ffm-license.xilentm20.workers.dev'
}

export type EndpointSource = 'env' | 'file' | 'baked'
export type EndpointSources = { [K in keyof FfmEndpoints]: EndpointSource }
type EndpointEnvironment = Readonly<Record<string, string | undefined>>

const ENV_NAMES: { [K in keyof FfmEndpoints]: string } = {
  supabaseUrl: 'FFM_SUPABASE_URL',
  supabaseAnonKey: 'FFM_SUPABASE_ANON_KEY',
  licenseServerUrl: 'FFM_LICENSE_SERVER_URL'
}

const FIELDS: (keyof FfmEndpoints)[] = ['supabaseUrl', 'supabaseAnonKey', 'licenseServerUrl']

export interface ResolveInput {
  baked: FfmEndpoints
  file?: Partial<FfmEndpoints>
  env?: EndpointEnvironment
  log?: (message: string) => void
}

export interface ResolvedEndpoints {
  values: FfmEndpoints
  source: EndpointSources
}

/**
 * Parse + normalize an https override into a clean, trailing-slash-free plain origin(+path). Returns
 * undefined for anything unusable so resolution falls through to the next source (M9): whitespace
 * (e.g. a trailing space that would build an invalid request URL), non-https, embedded credentials,
 * or a query/hash are all rejected rather than silently accepted.
 */
function normalizeHttpsUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length === 0) return undefined
  if (/\s/.test(value)) return undefined // a URL with whitespace is a corrupt override
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    return undefined
  }
  if (parsed.protocol !== 'https:') return undefined
  if (parsed.search || parsed.hash || parsed.username || parsed.password) return undefined
  return parsed.origin + parsed.pathname.replace(/\/+$/, '')
}

/** Validate + normalize a single field value from one source. Returns undefined if unusable. */
function normalizeField(field: keyof FfmEndpoints, value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined
  if (field === 'supabaseAnonKey') {
    return typeof value === 'string' && value.length > 0 ? value : undefined
  }
  return normalizeHttpsUrl(value)
}

/**
 * Pure resolver — no I/O, no caching, no Electron. Per field, try env then file then baked and
 * take the FIRST that validates; an invalid override is logged and skipped (falls through). If no
 * source yields a valid value for a field it throws — but the baked defaults are always valid, so
 * that only happens if a caller passes a broken `baked`.
 */
export function resolveEndpoints({ baked, file = {}, env = {}, log }: ResolveInput): ResolvedEndpoints {
  const values = {} as FfmEndpoints
  const source = {} as EndpointSources

  for (const field of FIELDS) {
    const candidates: Array<{ source: EndpointSource; value: unknown }> = [
      { source: 'env', value: env[ENV_NAMES[field]] },
      { source: 'file', value: file[field] },
      { source: 'baked', value: baked[field] }
    ]

    let resolved = false
    for (const candidate of candidates) {
      if (candidate.value === undefined) continue
      const normalized = normalizeField(field, candidate.value)
      if (normalized !== undefined) {
        values[field] = normalized
        source[field] = candidate.source
        resolved = true
        break
      }
      log?.(`[Endpoints] Ignoring invalid ${candidate.source} override for ${field}`)
    }

    if (!resolved) {
      throw new Error(`[Endpoints] Unable to resolve required field: ${field}`)
    }
  }

  return { values, source }
}

let cached: ResolvedEndpoints | undefined

/** Lazily load Electron's app so this module stays importable outside the Electron runtime. */
function loadElectronApp(): { getPath(name: string): string } | undefined {
  try {
    const req = createRequire(import.meta.url)
    return (req('electron') as { app?: { getPath(name: string): string } }).app
  } catch {
    return undefined
  }
}

function readFileOverrides(log: (message: string) => void): Partial<FfmEndpoints> {
  const app = loadElectronApp()
  if (!app) return {}
  let path: string
  try {
    // node:path avoided at top-level to keep the pure resolver dependency-free; require lazily.
    const { join } = createRequire(import.meta.url)('node:path') as typeof import('node:path')
    const { readFileSync } = createRequire(import.meta.url)('node:fs') as typeof import('node:fs')
    path = join(app.getPath('userData'), 'endpoints.json')
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'))
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Partial<FfmEndpoints>
    }
    log('[Endpoints] Ignoring endpoints.json: expected a JSON object')
  } catch (error) {
    const code = (error as NodeJS.ErrnoException | undefined)?.code
    if (code && code !== 'ENOENT') {
      log(`[Endpoints] Ignoring unreadable endpoints.json: ${String(error)}`)
    }
  }
  return {}
}

/** Resolve once (env > file > baked), then cache. The POS must never crash/lock on a bad override. */
export function getEndpoints(): FfmEndpoints {
  if (cached) return cached.values
  const log = (message: string): void => console.warn(message)
  const file = readFileOverrides(log)
  cached = resolveEndpoints({ baked: BAKED_DEFAULTS, file, env: process.env, log })
  return cached.values
}

export function endpointsDiagnostics(): {
  source: EndpointSources
  values: Omit<FfmEndpoints, 'supabaseAnonKey'> & { supabaseAnonKey: '<redacted>' }
} {
  const values = getEndpoints()
  return {
    source: cached!.source,
    values: {
      supabaseUrl: values.supabaseUrl,
      supabaseAnonKey: '<redacted>',
      licenseServerUrl: values.licenseServerUrl
    }
  }
}
