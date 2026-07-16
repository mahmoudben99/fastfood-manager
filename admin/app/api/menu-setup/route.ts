import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

const MAX_WORKBOOK_BYTES = 10 * 1024 * 1024
const MACHINE_ID_PATTERN = /^[A-Z0-9]{16}$/i

// POST: Upload Excel file for a client
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const fileEntry = formData.get('file')
    const machineId = formData.get('machineId')

    if (!fileEntry || typeof fileEntry === 'string' || typeof machineId !== 'string') {
      return NextResponse.json({ error: 'Missing file or machineId' }, { status: 400 })
    }
    const file = fileEntry as File
    if (!MACHINE_ID_PATTERN.test(machineId)) {
      return NextResponse.json({ error: 'Invalid machineId' }, { status: 400 })
    }
    if (!file.name.toLocaleLowerCase('en-US').endsWith('.xlsx')) {
      return NextResponse.json({ error: 'Only .xlsx workbooks are accepted' }, { status: 400 })
    }
    if (file.size === 0 || file.size > MAX_WORKBOOK_BYTES) {
      return NextResponse.json({ error: 'Workbook must be between 1 byte and 10 MB' }, { status: 400 })
    }

    // Upload to Supabase Storage
    const normalizedMachineId = machineId.toUpperCase()
    const storagePath = `${normalizedMachineId}/excel/menu.xlsx`
    const { data: requestRow, error: requestError } = await supabase
      .from('menu_upload_requests')
      .select('machine_id')
      .eq('machine_id', normalizedMachineId)
      .maybeSingle()
    if (requestError) {
      return NextResponse.json({ error: requestError.message }, { status: 500 })
    }
    if (!requestRow) {
      return NextResponse.json({ error: 'Menu upload request not found' }, { status: 404 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    // XLSX is a ZIP container. Reject renamed arbitrary uploads before they reach shared storage.
    if (buffer.length < 4 || buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
      return NextResponse.json({ error: 'File is not a valid .xlsx container' }, { status: 400 })
    }

    const { error: uploadError } = await supabase.storage
      .from('menu-uploads')
      .upload(storagePath, buffer, {
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        upsert: true
      })

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 })
    }

    // Update request status to 'ready' and set excel_path
    const { data: updatedRequest, error: dbError } = await supabase
      .from('menu_upload_requests')
      .update({
        status: 'ready',
        excel_path: storagePath,
        updated_at: new Date().toISOString()
      })
      .eq('machine_id', normalizedMachineId)
      .select('machine_id')
      .maybeSingle()

    if (dbError) {
      return NextResponse.json({ error: dbError.message }, { status: 500 })
    }
    if (!updatedRequest) {
      return NextResponse.json({ error: 'Menu upload request not found' }, { status: 404 })
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 })
  }
}

// PUT: Update status of a menu upload request
export async function PUT(request: NextRequest) {
  try {
    const { machineId, status } = await request.json()

    if (!machineId || !status) {
      return NextResponse.json({ error: 'Missing machineId or status' }, { status: 400 })
    }
    if (typeof machineId !== 'string' || !MACHINE_ID_PATTERN.test(machineId)) {
      return NextResponse.json({ error: 'Invalid machineId' }, { status: 400 })
    }

    // Only the POS marks a request completed, after its local atomic import succeeds.
    const validStatuses = ['pending', 'processing', 'ready']
    if (!validStatuses.includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    }

    const { data: updatedRequest, error } = await supabase
      .from('menu_upload_requests')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('machine_id', machineId.toUpperCase())
      .select('machine_id')
      .maybeSingle()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    if (!updatedRequest) {
      return NextResponse.json({ error: 'Menu upload request not found' }, { status: 404 })
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 })
  }
}
