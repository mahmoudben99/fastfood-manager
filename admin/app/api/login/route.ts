import { createSession } from '@/lib/auth'
import { createAdminLoginHandler } from '@/lib/owner-auth'

// Frozen seam (admin/tests/auth/auth.contract.d.ts): the acceptance tests import this factory
// directly to exercise same-origin handling for the mutating admin login route.
export { createAdminLoginHandler }

// The factory takes a static `appOrigin`, so it is (re)built per request with the origin derived
// from the request's own URL (Next.js reconstructs this from Host/X-Forwarded-Host + protocol).
// A same-origin fetch's `Origin` header always matches this; a cross-site page's fetch carries
// its OWN page origin in `Origin` while the request URL is still this app's host, so the
// mismatch is caught without needing a separately configured "trusted origin" env var — one
// fewer thing to misconfigure per deployment/preview URL.
//
// adminPassword() and createSession are likewise invoked per request (not captured once at
// import time) so a live ADMIN_PASSWORD/SESSION_SECRET misconfiguration always fails closed with
// 503, per-request, rather than only at cold start.
export async function POST(request: Request): Promise<Response> {
  const handler = createAdminLoginHandler({
    appOrigin: new URL(request.url).origin,
    adminPassword: () => process.env.ADMIN_PASSWORD,
    createSession
  })
  return handler(request)
}
