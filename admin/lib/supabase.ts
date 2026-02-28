import { createClient } from '@supabase/supabase-js'

// Service role key — server-side only, never exposed to browser
const supabaseUrl = process.env.SUPABASE_URL || ''
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

export const isConfigured = !!(supabaseUrl && supabaseServiceKey)

export const supabase = isConfigured
  ? createClient(supabaseUrl, supabaseServiceKey, {
      global: {
        fetch: (url, options = {}) =>
          fetch(url, { ...options, cache: 'no-store' })
      }
    })
  : null as any
