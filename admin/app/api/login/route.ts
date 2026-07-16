import { NextRequest, NextResponse } from 'next/server'
import { createSession, COOKIE_NAME } from '@/lib/auth'
import { timingSafeEqual } from 'crypto'

export async function POST(request: NextRequest) {
  const expected = process.env.ADMIN_PASSWORD
  if (!expected || expected.length < 8) {
    console.error('ADMIN_PASSWORD is missing or too short')
    return NextResponse.json({ error: 'Admin portal is not configured' }, { status: 503 })
  }

  let password: unknown
  try {
    ;({ password } = await request.json())
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
  if (typeof password !== 'string' || password.length === 0 || password.length > 256) {
    return NextResponse.json({ error: 'Invalid password' }, { status: 401 })
  }

  const suppliedBytes = Buffer.from(password)
  const expectedBytes = Buffer.from(expected)
  if (suppliedBytes.length !== expectedBytes.length || !timingSafeEqual(suppliedBytes, expectedBytes)) {
    return NextResponse.json({ error: 'Invalid password' }, { status: 401 })
  }

  const token = await createSession()

  const response = NextResponse.json({ ok: true })
  response.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7 // 7 days
  })

  return response
}
