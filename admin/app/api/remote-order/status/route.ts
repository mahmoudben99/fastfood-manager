import { createHash } from 'node:crypto'
import {
  createRemoteOrderStatusRoute,
  type RemoteOrderStatusHandlers
} from './_handler'

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  })
}

let productionRoute: RemoteOrderStatusHandlers | null = null

async function getProductionRoute(): Promise<RemoteOrderStatusHandlers> {
  if (!productionRoute) {
    const { supabase, isConfigured } = await import('../../../../lib/supabase')
    if (!isConfigured) throw new Error('Supabase service role is not configured')
    productionRoute = createRemoteOrderStatusRoute({
      supabase,
      now: () => new Date(),
      sha256Hex: (value: string) => createHash('sha256').update(value).digest('hex')
    })
  }
  return productionRoute
}

export async function GET(request: Request): Promise<Response> {
  try {
    const route = await getProductionRoute()
    return await route.GET(request)
  } catch {
    return jsonResponse({ error: 'db_failure' }, 503)
  }
}
