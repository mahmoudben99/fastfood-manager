import { supabase } from '@/lib/supabase'
import { OwnerDashboard } from './OwnerDashboard'

export const dynamic = 'force-dynamic'

export default async function OwnerPage({ params }: { params: { machineId: string } }) {
  const { machineId } = params

  // .maybeSingle() (not .single()) so a genuinely missing row (data: null, error: null) can be
  // told apart from an actual Supabase error — .single() reports BOTH as an error, which is
  // exactly the outage-honesty bug the security review flagged: a transient Supabase outage must
  // never render as "this restaurant doesn't exist".
  const { data: installation, error } = await supabase
    .from('installations')
    .select('restaurant_name, phone, app_version')
    .eq('machine_id', machineId)
    .maybeSingle()

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950 text-white px-6">
        <div className="text-center">
          <p className="text-6xl mb-4">&#x26A0;&#xFE0F;</p>
          <h1 className="text-xl font-bold">Temporarily Unavailable</h1>
          <p className="text-gray-400 mt-2">Could not reach the server. Please try again shortly.</p>
        </div>
      </div>
    )
  }

  if (!installation) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950 text-white">
        <div className="text-center">
          <p className="text-6xl mb-4">&#x1F354;</p>
          <h1 className="text-xl font-bold">Restaurant Not Found</h1>
          <p className="text-gray-400 mt-2">This dashboard link is invalid.</p>
        </div>
      </div>
    )
  }

  return (
    <OwnerDashboard
      machineId={machineId}
      restaurantName={installation.restaurant_name || 'Restaurant'}
    />
  )
}
