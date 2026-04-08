import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { jwtVerify } from 'jose'

const SESSION_SECRET = new TextEncoder().encode(process.env.SESSION_SECRET!)

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Allow login page, API login, owner dashboard (has its own PIN auth), TV display, remote ordering, and short codes
  if (
    pathname === '/login' ||
    pathname.startsWith('/api/login') ||
    pathname.startsWith('/owner') ||
    pathname.startsWith('/api/owner') ||
    pathname.startsWith('/tv/') ||
    pathname.startsWith('/api/tv-') ||
    pathname.startsWith('/r/') ||
    pathname.startsWith('/o/') ||
    pathname.startsWith('/api/remote-order') ||
    /^\/\d{4}$/.test(pathname)
  ) {
    return NextResponse.next()
  }

  const token = request.cookies.get('ffm_admin_session')?.value
  if (!token) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  try {
    await jwtVerify(token, SESSION_SECRET)
    return NextResponse.next()
  } catch {
    return NextResponse.redirect(new URL('/login', request.url))
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)']
}
