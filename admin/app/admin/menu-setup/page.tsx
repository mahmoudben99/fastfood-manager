import { supabase, isConfigured } from '@/lib/supabase'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-700',
    processing: 'bg-blue-100 text-blue-700',
    ready: 'bg-green-100 text-green-700',
    completed: 'bg-gray-100 text-gray-600'
  }
  return (
    <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${colors[status] || 'bg-gray-100 text-gray-600'}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  )
}

function timeAgo(iso: string | null) {
  if (!iso) return '—'
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < 60000) return 'just now'
  if (ms < 3600000) return `${Math.floor(ms / 60000)}m ago`
  if (ms < 86400000) return `${Math.floor(ms / 3600000)}h ago`
  return `${Math.floor(ms / 86400000)}d ago`
}

export default async function MenuSetupPage() {
  if (!isConfigured) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-6">Menu Setup</h1>
        <div className="bg-red-50 border border-red-200 rounded-xl p-6">
          <p className="text-sm text-red-600">Supabase not configured. Add environment variables in Vercel.</p>
        </div>
      </div>
    )
  }

  const { data: requests, error } = await supabase
    .from('menu_upload_requests')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-6">Menu Setup</h1>
        <div className="bg-red-50 border border-red-200 rounded-xl p-6">
          <p className="text-sm text-red-600">Error loading requests: {error.message}</p>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Menu Setup</h1>
        <span className="text-sm text-gray-500">{(requests || []).length} requests</span>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Restaurant</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Machine ID</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Images</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Submitted</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {(requests || []).map((r: any) => (
              <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3 font-medium">{r.restaurant_name || '—'}</td>
                <td className="px-4 py-3 font-mono text-xs text-gray-500">{r.machine_id}</td>
                <td className="px-4 py-3 text-gray-600">{r.image_count || 0}</td>
                <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                <td className="px-4 py-3 text-gray-500" title={r.created_at}>{timeAgo(r.created_at)}</td>
                <td className="px-4 py-3">
                  <Link href={`/admin/menu-setup/${r.machine_id}`} className="text-orange-500 hover:text-orange-600 font-medium">
                    View
                  </Link>
                </td>
              </tr>
            ))}
            {(requests || []).length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-400">No menu upload requests yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
