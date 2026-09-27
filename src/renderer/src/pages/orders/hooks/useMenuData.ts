import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ResolvedCombo, ResolvedModifierGroup } from '../../../../../shared/catalog-types'
import type { CategoryData, MenuItemData } from '../types'

export interface MenuData {
  categories: CategoryData[]
  items: MenuItemData[]
  byId: Map<number, MenuItemData>
  loaded: boolean
  /** Prefetched modifier groups per item (bumps `catalogVersion` when filled). */
  groupsById: Map<number, ResolvedModifierGroup[]>
  catalogVersion: number
  groupsFor: (menuItemId: number) => Promise<ResolvedModifierGroup[]>
  comboFor: (menuItemId: number) => Promise<ResolvedCombo | null>
  /** Re-read the menu (sold-out / availability flags). */
  refresh: () => Promise<MenuItemData[]>
}

const CHUNK = 24

/**
 * Categories + menu, then the v4 catalog in the background: every item's modifier groups are
 * prefetched so a tap decides instantly between "add now" and "open the options sheet".
 * Tolerates a main process without the catalog API (older builds): no options, no combos.
 */
export function useMenuData(): MenuData {
  const [categories, setCategories] = useState<CategoryData[]>([])
  const [items, setItems] = useState<MenuItemData[]>([])
  const [loaded, setLoaded] = useState(false)
  const [catalogVersion, setCatalogVersion] = useState(0)
  const groupsRef = useRef(new Map<number, ResolvedModifierGroup[]>())
  const alive = useRef(true)

  const fetchGroups = useCallback(async (id: number): Promise<ResolvedModifierGroup[]> => {
    const api = window.api.modifiers
    if (!api?.getForMenuItem) return []
    try {
      const groups = (await api.getForMenuItem(id)) || []
      groupsRef.current.set(id, groups)
      return groups
    } catch {
      return []
    }
  }, [])

  const groupsFor = useCallback(
    async (id: number) => groupsRef.current.get(id) ?? fetchGroups(id),
    [fetchGroups]
  )

  const comboFor = useCallback(async (id: number): Promise<ResolvedCombo | null> => {
    const api = window.api.combos
    if (!api?.getForMenuItem) return null
    try {
      return await api.getForMenuItem(id)
    } catch {
      return null
    }
  }, [])

  const refresh = useCallback(async (): Promise<MenuItemData[]> => {
    try {
      const next = ((await window.api.menu.getAll()) || []) as MenuItemData[]
      if (alive.current) setItems(next)
      return next
    } catch {
      return []
    }
  }, [])

  useEffect(() => {
    alive.current = true
    ;(async () => {
      const [cats, menu] = await Promise.all([
        window.api.categories.getAll().catch(() => []),
        window.api.menu.getAll().catch(() => [])
      ])
      if (!alive.current) return
      setCategories(cats || [])
      setItems(menu || [])
      setLoaded(true)
      // Background prefetch in small chunks; the grid is already usable meanwhile.
      const ids = (menu as MenuItemData[]).map((m) => m.id)
      for (let i = 0; i < ids.length && alive.current; i += CHUNK) {
        await Promise.all(ids.slice(i, i + CHUNK).map((id) => fetchGroups(id)))
      }
      if (alive.current) setCatalogVersion((v) => v + 1)
    })()
    return () => {
      alive.current = false
    }
  }, [fetchGroups])

  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items])

  return {
    categories,
    items,
    byId,
    loaded,
    groupsById: groupsRef.current,
    catalogVersion,
    groupsFor,
    comboFor,
    refresh
  }
}
