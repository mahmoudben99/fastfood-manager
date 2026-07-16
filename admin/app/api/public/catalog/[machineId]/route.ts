/**
 * WP-G — Public customer-facing catalog for the remote-order page.
 *
 * GET /api/public/catalog/<machineId>
 *
 * Replaces the page's direct anon Supabase table reads (removed in Phase B).
 * Unknown machine and remote-ordering-disabled return an IDENTICAL 404 body —
 * this endpoint must not leak which machine ids exist (mirrors the submit route).
 * The response carries the catalog `revision` the client must echo back as
 * `quoteRevision` on submission.
 */

interface CatalogItem {
  menuItemId: number
  name: string
  price: number
  emoji?: string
  categoryId: number | string | null
}

const NOT_FOUND_BODY = JSON.stringify({ error: 'not_found' })
const MACHINE_ID_RE = /^[A-Z0-9]{6,64}$/

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
  })
}

function notFound(): Response {
  return new Response(NOT_FOUND_BODY, {
    status: 404,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
  })
}

export async function GET(
  _request: Request,
  context: { params: { machineId: string } }
): Promise<Response> {
  let supabase: any
  try {
    const mod = await import('../../../../../lib/supabase')
    if (!mod.isConfigured) return jsonResponse({ error: 'db_failure' }, 503)
    supabase = mod.supabase
  } catch {
    return jsonResponse({ error: 'db_failure' }, 503)
  }

  const machineId = String(context?.params?.machineId ?? '').trim().toUpperCase()
  if (!MACHINE_ID_RE.test(machineId)) return notFound()

  try {
    // Enable flag DEFAULT OFF; disabled and unknown are byte-identical 404s.
    const { data: machine } = await supabase
      .from('machines')
      .select()
      .eq('machine_id', machineId)
      .maybeSingle()
    if (!machine || machine.remote_ordering_enabled !== true) return notFound()

    const [{ data: menuRows }, { data: installation }, { data: display }] = await Promise.all([
      supabase.from('menu_sync').select().eq('machine_id', machineId),
      supabase
        .from('installations')
        .select('restaurant_name')
        .eq('machine_id', machineId)
        .maybeSingle(),
      supabase
        .from('display_settings')
        .select('settings')
        .eq('machine_id', machineId)
        .eq('profile_name', 'default')
        .maybeSingle()
    ])

    const revision = Number(machine.catalog_revision ?? 0)
    const categories: Array<{ id: number | string; name: string; emoji?: string }> = []
    const items: CatalogItem[] = []
    const rows: any[] = Array.isArray(menuRows) ? menuRows : menuRows ? [menuRows] : []
    for (const row of rows) {
      if (!row) continue
      if (Array.isArray(row.items)) {
        // Live jsonb shape ({ categories, items, quote_revision }).
        for (const category of Array.isArray(row.categories) ? row.categories : []) {
          if (category?.id != null) {
            categories.push({ id: category.id, name: String(category.name ?? ''), emoji: category.emoji })
          }
        }
        for (const item of row.items) {
          if (!item || item.id == null) continue
          if (item.active === false || item.available === false) continue
          items.push({
            menuItemId: Number(item.id),
            name: String(item.name ?? ''),
            price: Number(item.price),
            emoji: item.emoji,
            categoryId: item.category_id ?? null
          })
        }
      } else if (row.menu_item_id != null) {
        // Normalized per-item revision rows: serve only the current revision.
        if (Number(row.revision ?? row.quote_revision ?? 0) !== revision) continue
        if (row.active === false) continue
        items.push({
          menuItemId: Number(row.menu_item_id),
          name: String(row.name ?? ''),
          price: Number(row.price),
          emoji: row.emoji,
          categoryId: row.category_id ?? null
        })
      }
    }

    const settings = (display?.settings ?? {}) as any
    return jsonResponse(
      {
        restaurantName: installation?.restaurant_name || 'Restaurant',
        currency: settings.currency_symbol || settings.currency || 'DA',
        revision,
        categories,
        items
      },
      200
    )
  } catch {
    return jsonResponse({ error: 'db_failure' }, 503)
  }
}
