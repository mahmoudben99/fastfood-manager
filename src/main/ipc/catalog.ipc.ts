import { ipcMain } from 'electron'
import { getDb } from '../database/connection'
import { createModifiersService } from '../services/modifiers'
import { createCombosService, createSoldOutService } from '../services/combos'

/**
 * v4 catalog IPC: `modifiers:*`, `combos:*`, `soldOut:*` (see the preload blocks for the exact
 * signatures). Errors are thrown with a message already in the app language.
 */
export function registerCatalogHandlers(): void {
  const modifiers = () => createModifiersService(getDb())
  const combos = () => createCombosService(getDb())
  const soldOut = () => createSoldOutService(getDb())
  const id = (value: unknown): number => {
    const n = Number(value)
    if (!Number.isInteger(n) || n <= 0) throw new Error('A valid id is required')
    return n
  }

  ipcMain.handle('modifiers:listGroups', (_, opts?: { includeInactive?: boolean }) => modifiers().listGroups(opts ?? {}))
  ipcMain.handle('modifiers:getGroup', (_, groupId: number) => modifiers().getGroup(id(groupId)) ?? null)
  ipcMain.handle('modifiers:createGroup', (_, input) => modifiers().createGroup(input))
  ipcMain.handle('modifiers:updateGroup', (_, groupId: number, input) => modifiers().updateGroup(id(groupId), input))
  ipcMain.handle('modifiers:deleteGroup', (_, groupId: number) => modifiers().deleteGroup(id(groupId)))
  ipcMain.handle('modifiers:createOption', (_, groupId: number, input) => modifiers().createOption(id(groupId), input))
  ipcMain.handle('modifiers:updateOption', (_, optionId: number, input) => modifiers().updateOption(id(optionId), input))
  ipcMain.handle('modifiers:deleteOption', (_, optionId: number) => modifiers().deleteOption(id(optionId)))
  ipcMain.handle('modifiers:getItemAssignments', (_, menuItemId: number) => modifiers().getItemAssignments(id(menuItemId)))
  ipcMain.handle('modifiers:setItemAssignments', (_, menuItemId: number, entries) =>
    modifiers().setItemAssignments(id(menuItemId), entries))
  ipcMain.handle('modifiers:getCategoryAssignments', (_, categoryId: number) => modifiers().getCategoryAssignments(id(categoryId)))
  ipcMain.handle('modifiers:setCategoryAssignments', (_, categoryId: number, entries) =>
    modifiers().setCategoryAssignments(id(categoryId), entries))
  ipcMain.handle('modifiers:getForMenuItem', (_, menuItemId: number) => modifiers().getForMenuItem(id(menuItemId)))

  ipcMain.handle('combos:list', () => combos().list())
  ipcMain.handle('combos:get', (_, menuItemId: number) => combos().get(id(menuItemId)))
  ipcMain.handle('combos:save', (_, menuItemId: number, input) => combos().save(id(menuItemId), input))
  ipcMain.handle('combos:remove', (_, menuItemId: number) => combos().remove(id(menuItemId)))
  ipcMain.handle('combos:getForMenuItem', (_, menuItemId: number) => combos().getForMenuItem(id(menuItemId)))

  ipcMain.handle('soldOut:set', (_, menuItemId: number, value: boolean) => soldOut().set(id(menuItemId), value === true))
  ipcMain.handle('soldOut:list', () => soldOut().list())
  ipcMain.handle('soldOut:getAuto', () => soldOut().getAuto())
  ipcMain.handle('soldOut:setAuto', (_, enabled: boolean) => soldOut().setAuto(enabled === true))
}
