// Native Node test loader: resolves the app's `@/` TypeScript aliases and
// replaces the two Next request-context imports with tiny test doubles.
const ADMIN_ROOT = new URL('../../', import.meta.url)
const SERVER_STUB = new URL('./next-server.stub.mjs', import.meta.url).href
const HEADERS_STUB = new URL('./next-headers.stub.mjs', import.meta.url).href

export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'next/server') return { url: SERVER_STUB, shortCircuit: true }
  if (specifier === 'next/headers') return { url: HEADERS_STUB, shortCircuit: true }
  if (specifier.startsWith('@/')) {
    return {
      url: new URL(`${specifier.slice(2)}.ts`, ADMIN_ROOT).href,
      shortCircuit: true
    }
  }
  return nextResolve(specifier, context)
}
