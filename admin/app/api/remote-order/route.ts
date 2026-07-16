import { createHash, randomBytes as nodeRandomBytes } from 'node:crypto'
import {
  capabilitySecretProblem,
  createRemoteOrderRoute,
  type RemoteOrderRouteHandlers
} from './_handler'

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  })
}

let productionRoute: RemoteOrderRouteHandlers | null = null

async function getProductionRoute(): Promise<RemoteOrderRouteHandlers> {
  if (!productionRoute) {
    const { supabase, isConfigured } = await import('../../../lib/supabase')
    if (!isConfigured) throw new Error('Supabase service role is not configured')
    const previous = process.env.SERVER_CAPABILITY_SECRET_PREVIOUS
    productionRoute = createRemoteOrderRoute({
      supabase,
      now: () => new Date(),
      getClientIp: (request: Request) =>
        request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown',
      randomBytes: (length: number) => new Uint8Array(nodeRandomBytes(length)),
      sha256Hex: (value: string) => createHash('sha256').update(value).digest('hex'),
      capabilitySecret: process.env.SERVER_CAPABILITY_SECRET,
      previousCapabilitySecret: capabilitySecretProblem(previous) === null ? previous : undefined
    })
  }
  return productionRoute
}

export async function POST(request: Request): Promise<Response> {
  if (capabilitySecretProblem(process.env.SERVER_CAPABILITY_SECRET) !== null) {
    console.error(
      '[remote-order] SERVER_CAPABILITY_SECRET missing or <32 bytes — refusing to accept submissions.'
    )
    return jsonResponse({ error: 'config_error' }, 500)
  }
  try {
    const route = await getProductionRoute()
    return await route.POST(request)
  } catch {
    return jsonResponse({ error: 'db_failure' }, 503)
  }
}
