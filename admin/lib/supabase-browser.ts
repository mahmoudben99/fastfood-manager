import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://ijdiiixkemrmkhhkbcng.supabase.co'
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_xmW71xs0XzNYbTEwnmbLCA_ZmphJkIV'

export const supabaseBrowser = createClient(url, key)
