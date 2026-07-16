import { ipcMain, dialog } from 'electron'
import { readFileSync } from 'fs'
import { basename, extname } from 'path'
import { randomUUID } from 'crypto'
import { getMachineId } from '../activation/activation'
import { settingsRepo } from '../database/repositories/settings.repo'
import { getClient } from '../activation/cloud'
import { SETUP_IMPORT_LIMITS } from '../../shared/excel-import'

export function registerMenuUploadHandlers(): void {
  // Open file dialog for selecting multiple menu images
  ipcMain.handle('menu-upload:selectImages', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp'] }]
    })

    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths
  })

  // Upload selected images to Supabase Storage + create request row
  ipcMain.handle('menu-upload:upload', async (_, paths: string[]) => {
    const machineId = getMachineId()
    const restaurantName = settingsRepo.get('restaurant_name') || 'Unknown'
    const client = getClient()

    // Insert request row
    const { error: dbError } = await client.from('menu_upload_requests').upsert(
      {
        machine_id: machineId,
        restaurant_name: restaurantName,
        image_count: paths.length,
        status: 'pending',
        updated_at: new Date().toISOString()
      },
      { onConflict: 'machine_id' }
    )
    if (dbError) return { ok: false, error: dbError.message }

    // Upload each image
    for (const filePath of paths) {
      const ext = extname(filePath)
      const fileName = `${randomUUID()}${ext}`
      const storagePath = `${machineId}/images/${fileName}`
      const fileBuffer = readFileSync(filePath)

      const { error: uploadError } = await client.storage
        .from('menu-uploads')
        .upload(storagePath, fileBuffer, {
          contentType: `image/${ext.replace('.', '') === 'jpg' ? 'jpeg' : ext.replace('.', '')}`,
          upsert: false
        })

      if (uploadError) {
        console.error(`Failed to upload ${basename(filePath)}:`, uploadError.message)
      }
    }

    return { ok: true }
  })

  // Check status of menu upload request (for polling)
  ipcMain.handle('menu-upload:checkStatus', async () => {
    const machineId = getMachineId()
    const client = getClient()

    const { data, error } = await client
      .from('menu_upload_requests')
      .select('status, excel_path')
      .eq('machine_id', machineId)
      .single()

    if (error || !data) return { status: 'not_found', excelPath: null }
    return { status: data.status, excelPath: data.excel_path }
  })

  // Download the Excel file uploaded by admin
  ipcMain.handle('menu-upload:downloadExcel', async (_, excelPath: string) => {
    const machineId = getMachineId()
    const expectedPath = `${machineId}/excel/menu.xlsx`
    if (excelPath !== expectedPath) {
      return { ok: false, error: 'Invalid menu workbook path' }
    }
    const client = getClient()

    const { data, error } = await client.storage
      .from('menu-uploads')
      .download(excelPath)

    if (error || !data) return { ok: false, error: error?.message || 'Download failed' }

    const buffer = Buffer.from(await data.arrayBuffer())
    if (buffer.byteLength === 0 || buffer.byteLength > SETUP_IMPORT_LIMITS.fileBytes) {
      return { ok: false, error: 'Downloaded workbook is empty or larger than the 10 MB safety limit' }
    }

    // Return bytes over the context-isolated IPC bridge. A file:// fetch from the renderer is
    // unreliable in packaged Electron and exposed an unnecessary arbitrary-file read surface.
    return { ok: true, data: new Uint8Array(buffer) }
  })

  // A workbook is completed only after the validated local database transaction succeeds.
  ipcMain.handle('menu-upload:markCompleted', async () => {
    const machineId = getMachineId()
    const client = getClient()
    const { data, error } = await client
      .from('menu_upload_requests')
      .update({ status: 'completed', updated_at: new Date().toISOString() })
      .eq('machine_id', machineId)
      .eq('status', 'ready')
      .eq('excel_path', `${machineId}/excel/menu.xlsx`)
      .select('machine_id')
      .maybeSingle()

    if (error) return { ok: false, error: error.message }
    return data
      ? { ok: true }
      : { ok: false, error: 'Ready menu upload request was not found' }
  })
}
