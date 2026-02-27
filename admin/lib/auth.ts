import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'

const SESSION_SECRET = new TextEncoder().encode(process.env.SESSION_SECRET!)
const COOKIE_NAME = 'ffm_admin_session'

export async function createSession(): Promise<string> {
  const token = await new SignJWT({ admin: true })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('7d')
    .sign(SESSION_SECRET)
  return token
}

export async function verifySession(token: string): Promise<boolean> {
  try {
    await jwtVerify(token, SESSION_SECRET)
    return true
  } catch {
    return false
  }
}

export async function getSessionToken(): Promise<string | undefined> {
  const cookieStore = await cookies()
  return cookieStore.get(COOKIE_NAME)?.value
}

export { COOKIE_NAME }
