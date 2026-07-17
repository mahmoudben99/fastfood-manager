import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { jwtVerify } from 'jose'

const ADMIN_ISSUER = 'fast-food-manager-admin'
const ADMIN_AUDIENCE = 'fast-food-manager-admin-portal'

function adminSecret(): Uint8Array {
  const value = process.env.SESSION_SECRET
  if (!value || value.length < 32) throw new Error('SESSION_SECRET must contain at least 32 characters')
  return new TextEncoder().encode(value)
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Allow login page, API login, owner dashboard (has its own PIN auth), TV display, remote ordering
  if (
    pathname === '/login' ||
    pathname.startsWith('/api/login') ||
    pathname === '/owner' ||
    pathname.startsWith('/owner/') ||
    pathname === '/api/owner' ||
    pathname.startsWith('/api/owner/') ||
    pathname.startsWith('/tv/') ||
    pathname.startsWith('/api/tv-') ||
    pathname.startsWith('/r/') ||
    pathname.startsWith('/o/') ||
    pathname.startsWith('/api/remote-order') ||
    pathname === '/api/owner-credential/provision' ||
    pathname.startsWith('/api/pair')
  ) {
    // NOTE: the bare `/api/owner-credential` reset endpoint deliberately does NOT match here — it is
    // ADMIN-SESSION gated. Only its `/provision` sub-path is bypassed: that one carries its own
    // WP-D device-access-token auth (verified inside the route), exactly like /api/remote-order and
    // the owner dashboard's own credential auth, so it must not be forced through the admin login.
    return NextResponse.next()
  }

  const token = request.cookies.get('ffm_admin_session')?.value
  if (!token) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  try {
    const { payload } = await jwtVerify(token, adminSecret(), {
      issuer: ADMIN_ISSUER,
      audience: ADMIN_AUDIENCE
    })
    if (payload.admin !== true) throw new Error('Not an administrator session')
    return NextResponse.next()
  } catch {
    return NextResponse.redirect(new URL('/login', request.url))
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)']
}
