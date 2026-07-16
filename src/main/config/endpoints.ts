import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'

export interface FfmEndpoints {
  supabaseUrl: string
  supabaseAnonKey: string
  licenseServerUrl: string
}

export const BAKED_DEFAULTS: FfmEndpoints = {
  supabaseUrl: 'https://ijdiiixkemrmkhhkbcng.supabase.co',
  supabaseAnonKey: 'sb_publishable_xmW71xs0XzNYbTEwnmbLCA_ZmphJkIV',
  licenseServerUrl: 'https://fastfood-manager.vercel.app'
}

type EndpointSource = 'env' | 'file' | 'baked'
type EndpointSources = { [K in keyof FfmEndpoints]: EndpointSource }
type EndpointEnvironment = Readonly<Record<string, string | undefined>>

interface EndpointResolution {
  values: FfmEndpoints
  sources: EndpointSources
  invalid: Array<{ field: keyof FfmEndpoints; source: EndpointSource }>
}

const ENV_NAMES: { [K in keyof FfmEndpoints]: string } = {
  supabaseUrl: 'FFM_SUPABASE_URL',
  supabaseAnonKey: 'FFM_SUPABASE_ANON_KEY',
  licenseServerUrl: 'FFM_LICENSE_SERVER_URL'
}

let cachedEndpoints: FfmEndpoints | undefined
let cachedSources: EndpointSources | undefined

function validHttpsUrl(value: unknown, trailingSlashAllowed: boolean): value is string {
  if (typeof value !== 'string' || value.length === 0) return false
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'https:' && (trailingSlashAllowed || !value.endsWith('/'))
  } catch {
    return false
  }
}

function validValue(field: keyof FfmEndpoints, value: unknown): value is string {
  if (field === 'supabaseAnonKey') return typeof value === 'string' && value.length > 0
  return validHttpsUrl(value, field !== 'licenseServerUrl')
}

function resolveWithMetadata(
  env: EndpointEnvironment,
  fileConfig: Partial<FfmEndpoints> = {}
): EndpointResolution {
  const values = {} as FfmEndpoints
  const sources = {} as EndpointSources
  const invalid: EndpointResolution['invalid'] = []
  const fields: (keyof FfmEndpoints)[] = [
    'supabaseUrl',
    'supabaseAnonKey',
    'licenseServerUrl'
  ]

  for (const field of fields) {
    const candidates: Array<{ source: EndpointSource; value: unknown }> = [
      { source: 'env', value: env[ENV_NAMES[field]] },
      { source: 'file', value: fileConfig[field] },
      { source: 'baked', value: BAKED_DEFAULTS[field] }
    ]

    for (const candidate of candidates) {
      if (candidate.value === undefined) continue
      if (validValue(field, candidate.value)) {
        values[field] = candidate.value
        sources[field] = candidate.source
        break
      }
      invalid.push({ field, source: candidate.source })
    }
  }

  const unresolved = fields.filter((field) => !validValue(field, values[field]))
  if (unresolved.length > 0) {
    throw new Error(`[Endpoints] Unable to resolve required fields: ${unresolved.join(', ')}`)
  }

  return { values, sources, invalid }
}

/** Resolve endpoint values without filesystem access, logging, caching, or mutation. */
export function resolveEndpoints(
  env: EndpointEnvironment,
  fileConfig: Partial<FfmEndpoints> = {}
): FfmEndpoints {
  return resolveWithMetadata(env, fileConfig).values
}

function readFileOverrides(): Partial<FfmEndpoints> {
  const path = join(app.getPath('userData'), 'endpoints.json')
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'))
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Partial<FfmEndpoints>
    }
    console.warn('[Endpoints] Ignoring endpoints.json: expected a JSON object')
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code !== 'ENOENT') {
      console.warn('[Endpoints] Ignoring unreadable endpoints.json:', error)
    }
  }
  return {}
}

export function getEndpoints(): FfmEndpoints {
  if (cachedEndpoints) return cachedEndpoints

  const file = readFileOverrides()
  const resolution = resolveWithMetadata(process.env, file)
  for (const invalid of resolution.invalid) {
    console.warn(`[Endpoints] Ignoring invalid ${invalid.source} override for ${invalid.field}`)
  }

  cachedEndpoints = resolveEndpoints(process.env, file)
  cachedSources = resolution.sources
  return cachedEndpoints
}

export function endpointsDiagnostics(): {
  source: { [K in keyof FfmEndpoints]: 'env' | 'file' | 'baked' }
  values: Omit<FfmEndpoints, 'supabaseAnonKey'> & { supabaseAnonKey: '<redacted>' }
} {
  const values = getEndpoints()
  return {
    source: cachedSources!,
    values: {
      supabaseUrl: values.supabaseUrl,
      supabaseAnonKey: '<redacted>',
      licenseServerUrl: values.licenseServerUrl
    }
  }
}
