import { createHash } from 'crypto'
import { NextResponse } from 'next/server'
import { isConfigured, supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const TV_MEDIA_BUCKET = 'tv-media'
const MAX_JPEG_BYTES = 750 * 1024
const MAX_BASE64_CHARS = Math.ceil(MAX_JPEG_BYTES / 3) * 4

type UploadBody = {
  machineId?: unknown
  profileName?: unknown
  kind?: unknown
  version?: unknown
  jpegBase64?: unknown
}

function errorResponse(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } })
}

function ownedMachineIds(appMetadata: Record<string, unknown>): Set<string> {
  const values: unknown[] = []
  if (typeof appMetadata.machine_id === 'string') values.push(appMetadata.machine_id)
  if (Array.isArray(appMetadata.machine_ids)) values.push(...appMetadata.machine_ids)
  return new Set(
    values
      .filter((value): value is string => typeof value === 'string')
      .map(value => value.trim().toUpperCase())
      .filter(value => /^[A-Z0-9]{6,64}$/.test(value))
  )
}

export async function POST(req: Request) {
  if (!isConfigured) return errorResponse('TV media service is unavailable', 503)

  const authorization = req.headers.get('authorization') || ''
  if (!authorization.startsWith('Bearer ')) return errorResponse('Authentication required', 401)
  const accessToken = authorization.slice('Bearer '.length).trim()
  if (!accessToken) return errorResponse('Authentication required', 401)

  const contentLength = Number(req.headers.get('content-length') || '0')
  if (Number.isFinite(contentLength) && contentLength > MAX_BASE64_CHARS + 16_384) {
    return errorResponse('TV media request is too large', 413)
  }

  const { data: userResult, error: authError } = await supabase.auth.getUser(accessToken)
  const user = userResult.user
  if (authError || !user) return errorResponse('Invalid or expired device session', 401)

  let body: UploadBody
  try {
    body = await req.json() as UploadBody
  } catch {
    return errorResponse('Invalid JSON body', 400)
  }

  const machineId = typeof body.machineId === 'string' ? body.machineId.trim().toUpperCase() : ''
  const profileName = typeof body.profileName === 'string' ? body.profileName.trim() : ''
  const kind = typeof body.kind === 'string' ? body.kind : ''
  const version = typeof body.version === 'string' ? body.version.toLowerCase() : ''
  const jpegBase64 = typeof body.jpegBase64 === 'string' ? body.jpegBase64 : ''

  if (!/^[A-Z0-9]{6,64}$/.test(machineId)) return errorResponse('Invalid machine ID', 400)
  if (!profileName || profileName.length > 80 || /[\u0000-\u001f\u007f]/.test(profileName)) {
    return errorResponse('Invalid display profile', 400)
  }
  if (!/^(logo|slideshow-[0-9])$/.test(kind)) return errorResponse('Invalid TV media kind', 400)
  if (!/^[a-f0-9]{64}$/.test(version)) return errorResponse('Invalid media version', 400)
  if (!jpegBase64 || jpegBase64.length > MAX_BASE64_CHARS) {
    return errorResponse('TV media payload is too large', 413)
  }

  // Only app_metadata is trusted: users can edit user_metadata themselves. Machine ownership
  // must be assigned by the server-side device-auth provisioning flow.
  if (!ownedMachineIds(user.app_metadata || {}).has(machineId)) {
    return errorResponse('Device session does not own this machine', 403)
  }

  const jpeg = Buffer.from(jpegBase64, 'base64')
  if (jpeg.length < 4 || jpeg.length > MAX_JPEG_BYTES ||
      jpeg[0] !== 0xff || jpeg[1] !== 0xd8 || jpeg[2] !== 0xff) {
    return errorResponse('Payload is not a bounded JPEG', 400)
  }
  const actualVersion = createHash('sha256').update(jpeg).digest('hex')
  if (actualVersion !== version) return errorResponse('Media digest mismatch', 400)

  const objectPath = `${machineId}/${encodeURIComponent(profileName)}/${kind}-${version}.jpg`
  const { error: uploadError } = await supabase.storage.from(TV_MEDIA_BUCKET).upload(objectPath, jpeg, {
    cacheControl: '31536000, immutable',
    contentType: 'image/jpeg',
    upsert: false
  })
  const uploadStatus = uploadError
    ? String((uploadError as any).statusCode ?? (uploadError as any).status ?? '')
    : ''
  if (uploadError && uploadStatus !== '409') {
    console.error('[TVMedia] Storage upload failed:', uploadError.message)
    return errorResponse('TV media storage is unavailable', 503)
  }

  const { data } = supabase.storage.from(TV_MEDIA_BUCKET).getPublicUrl(objectPath)
  return NextResponse.json(
    { url: `${data.publicUrl}?v=${version}` },
    { headers: { 'Cache-Control': 'no-store' } }
  )
}
