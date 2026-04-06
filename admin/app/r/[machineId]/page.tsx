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

  if (!installation || !menuData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950 text-white">
        <div className="text-center">
          <p className="text-6xl mb-4">🍔</p>
          <h1 className="text-xl font-bold">Restaurant Not Found</h1>
        </div>
      </div>
    )
  }

  return <RemoteOrder machineId={machineId} restaurantName={installation.restaurant_name || 'Restaurant'} categories={menuData.categories} items={menuData.items} />
}
