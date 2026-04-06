import { supabase } from '@/lib/supabase'
import { OwnerDashboard } from './OwnerDashboard'

export const dynamic = 'force-dynamic'

export default async function OwnerPage({ params }: { params: { machineId: string } }) {
  const { machineId } = params

  const { data: installation } = await supabase
    .from('installations')
    .select('restaurant_name, phone, app_version')
    .eq('machine_id', machineId)
    .single()

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
