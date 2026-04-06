import { redirect } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export default async function ShortCodeRedirect({ params }: { params: { code: string } }) {
  const { code } = params

  // Only handle 4-digit numeric codes
  if (!/^\d{4}$/.test(code)) {
    return <div className="min-h-screen flex items-center justify-center"><p>Page not found</p></div>
  }

  const { data } = await supabase
    .from('short_codes')
    .select('machine_id, type, profile_name')
    .eq('code', code)
    .single()

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950 text-white">
        <div className="text-center">
          <p className="text-6xl mb-4">🔗</p>
          <h1 className="text-xl font-bold">Invalid Code</h1>
          <p className="text-gray-400 mt-2">This short code doesn&apos;t exist.</p>
        </div>
      </div>
    )
  }

  switch (data.type) {
    case 'tv':
      redirect(`/tv/${data.machine_id}${data.profile_name !== 'default' ? '?profile=' + data.profile_name : ''}`)
    case 'owner':
      redirect(`/owner/${data.machine_id}`)
    case 'order':
      redirect(`/r/${data.machine_id}`)
    default:
      redirect('/')
  }
}
