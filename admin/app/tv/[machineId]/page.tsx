import { redirect } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { TVPicker } from './TVPicker'

export const dynamic = 'force-dynamic'

export default async function TVPage({
  params,
  searchParams
}: {
  params: { machineId: string }
  searchParams: { profile?: string; picker?: string }
}) {
  const { machineId } = params

  // Explicit profile in URL — go straight to that display (legacy behaviour)
  if (searchParams.profile) {
    redirect(`/api/tv-html?machineId=${machineId}&profile=${searchParams.profile}`)
  }

  // Fetch the list of profiles configured for this machine
  const { data, error } = await supabase
    .from('display_settings')
    .select('profile_name, settings, updated_at')
    .eq('machine_id', machineId)
    .order('updated_at', { ascending: false })

  if (error || !data || data.length === 0) {
    // No profiles configured — fall back to default rendering so the user gets *something*
    redirect(`/api/tv-html?machineId=${machineId}&profile=default`)
  }

  // Build picker entries — pull a few preview fields from settings JSON
  const profiles = (data || []).map((row: { profile_name: string; settings: Record<string, unknown> | null }) => {
    const s = (row.settings || {}) as Record<string, string>
    const p = row.profile_name === 'default' ? 'display_' : `display_${row.profile_name}_`
    return {
      name: row.profile_name,
      gradientPreset: parseInt(s[p + 'gradient_preset'] || '0'),
      accentColor: s[p + 'accent_color'] || '#f97316',
      textColor: s[p + 'text_color'] || '#ffffff',
      restaurantName: s.restaurant_name || ''
    }
  })

  // Single profile → no picker needed, just go
  if (profiles.length === 1 && !searchParams.picker) {
    redirect(`/api/tv-html?machineId=${machineId}&profile=${profiles[0].name}`)
  }

  return <TVPicker machineId={machineId} profiles={profiles} forcePicker={!!searchParams.picker} />
}
