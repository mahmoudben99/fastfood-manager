import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

// POST: Upload Excel file for a client
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const machineId = formData.get('machineId') as string | null

    if (!file || !machineId) {
      return NextResponse.json({ error: 'Missing file or machineId' }, { status: 400 })
    }

    // Upload to Supabase Storage
    const storagePath = `${machineId}/excel/menu.xlsx`
    const buffer = Buffer.from(await file.arrayBuffer())

    // Remove old file first (if exists)
    await supabase.storage.from('menu-uploads').remove([storagePath])

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
    const { error: dbError } = await supabase
      .from('menu_upload_requests')
      .update({
        status: 'ready',
        excel_path: storagePath,
        updated_at: new Date().toISOString()
      })
      .eq('machine_id', machineId)

    if (dbError) {
      return NextResponse.json({ error: dbError.message }, { status: 500 })
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

    const validStatuses = ['pending', 'processing', 'ready', 'completed']
    if (!validStatuses.includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    }

    const { error } = await supabase
      .from('menu_upload_requests')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('machine_id', machineId)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 })
  }
}
