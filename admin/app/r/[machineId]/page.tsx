import { supabase } from '@/lib/supabase'
import { RemoteOrder } from './RemoteOrder'

export const dynamic = 'force-dynamic'

export default async function RemoteOrderPage({ params }: { params: { machineId: string } }) {
  const { machineId } = params

  // Get restaurant info
  const { data: installation } = await supabase
    .from('installations')
    .select('restaurant_name, phone')
    .eq('machine_id', machineId)
    .single()

  // Get menu
  const { data: menuData } = await supabase
    .from('menu_sync')
    .select('categories, items')
    .eq('machine_id', machineId)
    .single()

  if (!installation) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950 text-white">
        <div className="text-center">
          <p className="text-6xl mb-4">🍔</p>
          <h1 className="text-xl font-bold">Restaurant Not Found</h1>
          <p className="text-gray-400 mt-2">This link is invalid or the restaurant hasn&apos;t set up yet.</p>
        </div>
      </div>
    )
  }

  if (!menuData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950 text-white">
        <div className="text-center">
          <p className="text-6xl mb-4">⏳</p>
          <h1 className="text-xl font-bold">{installation.restaurant_name || 'Restaurant'}</h1>
          <p className="text-gray-400 mt-2">Menu is being synced. Please try again in a few minutes.</p>
          <a href="" className="mt-4 inline-block px-4 py-2 bg-orange-500 text-white rounded-lg text-sm">Retry</a>
        </div>
      </div>
    )
  }

  return <RemoteOrder machineId={machineId} restaurantName={installation.restaurant_name || 'Restaurant'} categories={menuData.categories} items={menuData.items} />
}
