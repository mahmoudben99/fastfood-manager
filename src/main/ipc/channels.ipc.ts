import { ipcMain } from 'electron'
import { getDb } from '../database/connection'
import type { AvailabilityRule, AvailabilityTarget } from '../../shared/availability'
import type { CustomPlatformInput } from '../../shared/channels'
import { getItemChannelPrices, listChannels, savePlatforms, setItemChannelPrices } from '../services/channels'
import { availabilityState, getEnforce, setEnforce, setRules } from '../services/availability'

/**
 * v4 channels + availability IPC (preload namespaces `channels`, `availability`). Errors reject
 * with a message starting with a stable token (CHANNEL_…: / AVAILABILITY_…:) the editors translate.
 */
const positiveId = (value: unknown): number => {
  const n = Number(value)
  if (!Number.isInteger(n) || n <= 0) throw new Error('A valid id is required')
  return n
}

const target = (value: AvailabilityTarget | undefined): { kind: 'menu_item' | 'category'; id: number } => {
  if (!value || (value.kind !== 'menu_item' && value.kind !== 'category')) throw new Error('AVAILABILITY_INVALID_TARGET: invalid target')
  return { kind: value.kind, id: positiveId(value.id) }
}

export function registerChannelsHandlers(): void {
  ipcMain.handle('channels:list', () => listChannels(getDb()))
  ipcMain.handle('channels:savePlatforms', (_, platforms: CustomPlatformInput[]) => savePlatforms(getDb(), platforms))
  ipcMain.handle('channels:getItemPrices', (_, menuItemId: number) => getItemChannelPrices(getDb(), positiveId(menuItemId)))
  ipcMain.handle('channels:setItemPrices', (_, menuItemId: number, prices: Record<string, number | null>) =>
    setItemChannelPrices(getDb(), positiveId(menuItemId), prices))

  ipcMain.handle('availability:get', (_, value: AvailabilityTarget) => {
    const t = target(value)
    return availabilityState(getDb(), t.kind, t.id, new Date())
  })
  ipcMain.handle('availability:set', (_, value: AvailabilityTarget, rules: Partial<AvailabilityRule>[]) => {
    const t = target(value)
    setRules(getDb(), t.kind, t.id, rules)
    return availabilityState(getDb(), t.kind, t.id, new Date())
  })
  ipcMain.handle('availability:getEnforce', () => getEnforce(getDb()))
  ipcMain.handle('availability:setEnforce', (_, mode: 'warn' | 'block') => setEnforce(getDb(), mode))
}
