import { supabase } from '@/lib/supabase'
import { TVDisplay } from './TVDisplay'

export const dynamic = 'force-dynamic'

export default async function TVPage({ params, searchParams }: { params: { machineId: string }, searchParams: { profile?: string } }) {
  const { machineId } = params
  const profile = searchParams.profile || 'default'

  const { data } = await supabase
    .from('display_settings')
    .select('settings')
    .eq('machine_id', machineId)
    .eq('profile_name', profile)
    .single()

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950 text-white">
        <div className="text-center">
          <p className="text-6xl mb-4">📺</p>
          <h1 className="text-xl font-bold">Display Not Found</h1>
          <p className="text-gray-400 mt-2">This display hasn&apos;t been set up yet.</p>
        </div>
      </div>
    )
  }

  return <TVDisplay machineId={machineId} profile={profile} initialSettings={data.settings} />
}
