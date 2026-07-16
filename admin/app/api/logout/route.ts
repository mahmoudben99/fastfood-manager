import { NextResponse } from 'next/server'
import { COOKIE_NAME } from '@/lib/auth'
import { isSameOriginRequest } from '@/lib/owner-auth'

// LOW-6 (security review): every other mutating admin/owner route checks Origin/Sec-Fetch-Site;
// logout was the one exception. A cross-site page silently logging an admin out is a minor
// nuisance on its own, but an auth route skipping the CSRF check other auth routes enforce is
// exactly the kind of inconsistency that becomes a real hole once anything more is bolted on here.
export async function POST(request: Request): Promise<Response> {
  if (!isSameOriginRequest(request, new URL(request.url).origin)) {
    return NextResponse.json({ error: 'cross_origin_rejected' }, { status: 403 })
  }
  const response = NextResponse.json({ ok: true })
  response.cookies.delete(COOKIE_NAME)
  return response
}
