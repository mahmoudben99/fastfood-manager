import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import { PackageOpen, Plus, SlidersHorizontal, Tags, UtensilsCrossed } from 'lucide-react'
import type { ComboDefinition, ModifierGroup } from '../../../../shared/catalog-types'
import { Button, PageHeader, Tabs, toast } from '../../components/ui'
import { ipcErrorMessage } from '../../utils/ipcErrorMessage'
import { useFoodName } from './catalogShared'
import { CategoryManager } from './CategoryManager'
import { CombosManager } from './CombosManager'
import { MenuItemForm, toRecipeRows, type FormTab } from './MenuItemForm'
import { MenuItemsSection } from './MenuItemsSection'
import type { CategoryRow, ItemFacts, MenuRow, MenuSection, StockRow } from './menuTypes'
import { ModifiersManager } from './ModifiersManager'
import { checkRecipeRows, isBlockingIssue } from './recipeUnits'

type FormState = { item: MenuRow | null; validate: boolean; combo: boolean; tab?: FormTab; key: number }
const SECTIONS: MenuSection[] = ['items', 'groups', 'combos']

export function MenuManagement() {
  const { t } = useTranslation()
  const getName = useFoodName()
  const [params, setParams] = useSearchParams()
  const section: MenuSection = SECTIONS.includes(params.get('tab') as MenuSection) ? (params.get('tab') as MenuSection) : 'items'
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<MenuRow[]>([])
  const [deletedItems, setDeletedItems] = useState<MenuRow[]>([])
  const [categories, setCategories] = useState<CategoryRow[]>([])
  const [stockItems, setStockItems] = useState<StockRow[]>([])
  const [groups, setGroups] = useState<ModifierGroup[]>([])
  const [combos, setCombos] = useState<ComboDefinition[]>([])
  const [facts, setFacts] = useState<Record<number, ItemFacts>>({})
  const [autoSoldOut, setAutoSoldOut] = useState(false)
  const [showDeleted, setShowDeleted] = useState(false)
  const [showCategories, setShowCategories] = useState(false)
  const [groupRequest, setGroupRequest] = useState(0)
  // Add/edit form: remounted (fresh state) every time it opens.
  const [form, setForm] = useState<FormState | null>(null)

  const loadFacts = useCallback(async (menuItems: MenuRow[], stock: StockRow[]) => {
    const [resolvedGroups, usage] = await Promise.all([
      Promise.all(menuItems.map((i) => window.api.modifiers.getForMenuItem(i.id).catch(() => []))),
      Promise.all(stock.map((s) => window.api.stock.getRecipeUsage(s.id).catch(() => [])))
    ])
    const withRecipe = new Set(usage.flat().map((u) => u.menu_item_id))
    setFacts(
      Object.fromEntries(
        menuItems.map((item, i) => [
          item.id,
          {
            groups: resolvedGroups[i].length,
            hasRecipe: withRecipe.has(item.id),
            itemGroupIds: resolvedGroups[i].filter((g) => g.source === 'item').map((g) => g.id)
          }
        ])
      )
    )
  }, [])

  const loadData = useCallback(async (): Promise<StockRow[]> => {
    try {
      const [menuItems, cats, stock, deleted, library, comboList, auto] = await Promise.all([
        window.api.menu.getAll(),
        window.api.categories.getAll(),
        window.api.stock.getAll(),
        window.api.menu.getDeleted(),
        window.api.modifiers.listGroups({ includeInactive: true }),
        window.api.combos.list(),
        window.api.soldOut.getAuto()
      ])
      setItems(menuItems)
      setCategories(cats)
      setStockItems(stock)
      setDeletedItems(deleted)
      setGroups(library)
      setCombos(comboList)
      setAutoSoldOut(auto)
      void loadFacts(menuItems, stock)
      return stock
    } catch (err) {
      toast.error(ipcErrorMessage(err, t('menu.loadFailed')))
      return []
    } finally {
      setLoading(false)
    }
  }, [loadFacts, t])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const setSection = (next: MenuSection) => {
    setShowDeleted(false)
    setParams(next === 'items' ? {} : { tab: next }, { replace: true })
  }

  const openForm = async (item?: MenuRow | null, opts: { validate?: boolean; combo?: boolean; tab?: FormTab } = {}) => {
    if (!item) {
      setForm({ item: null, validate: false, combo: !!opts.combo, tab: opts.tab, key: Date.now() })
      return
    }
    try {
      const full = await window.api.menu.getById(item.id)
      if (full) setForm({ item: full, validate: !!opts.validate, combo: false, tab: opts.tab, key: Date.now() })
    } catch (err) {
      toast.error(ipcErrorMessage(err, t('menu.loadFailed')))
    }
  }

  const handleRestore = async (item: MenuRow) => {
    const name = getName(item)
    try {
      const { item: restored, categoryRestored } = await window.api.menu.restore(item.id)
      const stock = await loadData()
      const full = await window.api.menu.getById(restored.id)
      if (checkRecipeRows(toRecipeRows(full?.ingredients), stock).some(isBlockingIssue)) {
        toast.warning(t('menu.restoredNeedsRecipeFix', { name }), { duration: 8000 })
        await openForm(restored, { validate: true, tab: 'recipe' })
      } else {
        toast.success(
          categoryRestored ? t('menu.restoredWithCategory', { name, category: restored.category_name }) : t('menu.restored', { name })
        )
      }
    } catch (err) {
      toast.error(ipcErrorMessage(err, t('menu.restoreFailed')))
    }
  }

  const handleDelete = async (item: MenuRow) => {
    try {
      await window.api.menu.delete(item.id)
      await loadData()
      // Reversible (soft delete): an Undo toast instead of a confirmation dialog.
      toast.info(t('menu.deletedUndo', { name: getName(item) }), {
        action: { label: t('ui.undo'), onClick: () => void handleRestore(item) }
      })
    } catch (err) {
      toast.error(ipcErrorMessage(err, t('menu.deleteFailed')))
    }
  }

  const applySoldOut = (id: number, patch: Partial<MenuRow>) =>
    setItems((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)))

  const handleSoldOut = async (item: MenuRow, soldOut: boolean, undo = true) => {
    applySoldOut(item.id, { is_sold_out: soldOut ? 1 : 0, sold_out: soldOut ? 1 : item.sold_out })
    try {
      const result = await window.api.soldOut.set(item.id, soldOut)
      applySoldOut(item.id, { is_sold_out: result.is_sold_out, sold_out: result.sold_out })
      const name = getName(item)
      const message = soldOut ? t('menu.soldOut.marked', { name }) : t('menu.soldOut.back', { name })
      if (undo) toast.info(message, { id: `sold-${item.id}`, action: { label: t('ui.undo'), onClick: () => void handleSoldOut({ ...item, ...result }, !soldOut, false) } })
      else toast.info(message, { id: `sold-${item.id}` })
    } catch (err) {
      applySoldOut(item.id, { is_sold_out: item.is_sold_out, sold_out: item.sold_out })
      toast.error(ipcErrorMessage(err, t('menu.saveFailed')))
    }
  }

  const handleAutoSoldOut = async (enabled: boolean) => {
    setAutoSoldOut(enabled)
    try {
      await window.api.soldOut.setAuto(enabled)
      await loadData()
      toast.success(enabled ? t('menu.autoSoldOut.on') : t('menu.autoSoldOut.off'))
    } catch (err) {
      setAutoSoldOut(!enabled)
      toast.error(ipcErrorMessage(err, t('menu.saveFailed')))
    }
  }

  const activeCombos = combos.filter((c) => c.is_active === 1).length
  const actions =
    section === 'items' ? (
      <>
        <Button variant="secondary" size="lg" icon={<Tags className="h-5 w-5" />} onClick={() => setShowCategories(true)}>
          {t('menu.categories.manage')}
        </Button>
        <Button size="lg" icon={<Plus className="h-5 w-5" />} onClick={() => void openForm()}>
          {t('menu.addItem')}
        </Button>
      </>
    ) : section === 'groups' ? (
      <Button size="lg" icon={<Plus className="h-5 w-5" />} onClick={() => setGroupRequest((n) => n + 1)}>
        {t('modifiers.newGroup')}
      </Button>
    ) : (
      <Button size="lg" icon={<Plus className="h-5 w-5" />} onClick={() => void openForm(null, { combo: true })}>
        {t('combos.newCombo')}
      </Button>
    )

  return (
    <div>
      <PageHeader
        icon={<UtensilsCrossed />}
        title={t('menu.page.title')}
        subtitle={t('menu.page.subtitle', { items: items.length, categories: categories.length })}
        actions={actions}
      />
      <Tabs<MenuSection>
        className="mb-5"
        value={section}
        onChange={setSection}
        tabs={[
          { id: 'items', label: t('menu.tabs.items'), icon: <UtensilsCrossed />, count: items.length },
          { id: 'groups', label: t('menu.tabs.groups'), icon: <SlidersHorizontal />, count: groups.length },
          { id: 'combos', label: t('menu.tabs.combos'), icon: <PackageOpen />, count: activeCombos }
        ]}
      />

      {section === 'items' && (
        <MenuItemsSection
          loading={loading}
          items={items}
          deletedItems={deletedItems}
          categories={categories}
          facts={facts}
          autoSoldOut={autoSoldOut}
          onAutoSoldOut={(v) => void handleAutoSoldOut(v)}
          showDeleted={showDeleted}
          setShowDeleted={setShowDeleted}
          onAdd={() => void openForm()}
          onOpen={(item) => void openForm(item)}
          onDelete={(item) => void handleDelete(item)}
          onRestore={(item) => void handleRestore(item)}
          onSoldOut={(item, soldOut) => void handleSoldOut(item, soldOut)}
        />
      )}
      {section === 'groups' && (
        <ModifiersManager
          groups={groups}
          categories={categories}
          items={items}
          facts={facts}
          stockItems={stockItems}
          createRequest={groupRequest}
          onChanged={loadData}
        />
      )}
      {section === 'combos' && (
        <CombosManager
          combos={combos}
          items={items}
          categories={categories}
          onCreate={() => void openForm(null, { combo: true })}
          onEdit={(id) => {
            const item = items.find((i) => i.id === id)
            if (item) void openForm(item, { tab: 'combo' })
          }}
        />
      )}

      {form && (
        <MenuItemForm
          key={form.key}
          item={form.item}
          startAsCombo={form.combo}
          initialTab={form.tab}
          validateOnOpen={form.validate}
          categories={categories}
          stockItems={stockItems}
          items={items}
          library={groups}
          onClose={() => setForm(null)}
          onSaved={loadData}
        />
      )}

      <CategoryManager isOpen={showCategories} onClose={() => setShowCategories(false)} categories={categories} items={items} onChanged={loadData} />
    </div>
  )
}
