import { supabase, isConfigured } from '@/lib/supabase'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

interface Installation {
  machine_id: string
  restaurant_name: string | null
  phone: string | null
  app_version: string | null
  created_at: string
  updated_at: string
  trials: {
    status: string
    expires_at: string | null
  } | null
}

function StatusBadge({ trial }: { trial: Installation['trials'] }) {
  if (!trial) {
    return <span className="px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-600">No Trial</span>
  }
  const colors: Record<string, string> = {
    active: 'bg-green-100 text-green-700',
    expired: 'bg-red-100 text-red-700',
    paused: 'bg-yellow-100 text-yellow-700'
  }
  return (
    <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${colors[trial.status] || 'bg-gray-100 text-gray-600'}`}>
      {trial.status}
    </span>
  )
}

function formatDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default async function UsersPage({
  searchParams
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const { q } = await searchParams
  const search = q?.trim() || ''

  if (!isConfigured) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-6">Users</h1>
        <div className="bg-red-50 border border-red-200 rounded-xl p-6">
          <h2 className="text-base font-bold text-red-700 mb-2">⚠️ Supabase not configured</h2>
          <p className="text-sm text-red-600 mb-4">
            The admin dashboard needs environment variables set in Vercel. Go to:
            <strong> Vercel → Your Project → Settings → Environment Variables</strong> and add:
          </p>
          <ul className="text-sm font-mono text-red-800 space-y-1 bg-red-100 rounded-lg p-4">
            <li>SUPABASE_URL</li>
            <li>SUPABASE_SERVICE_ROLE_KEY</li>
            <li>ADMIN_PASSWORD</li>
            <li>SESSION_SECRET</li>
            <li>FFM_SECRET_KEY</li>
            <li>FFM_UNLOCK_KEY</li>
          </ul>
          <p className="text-xs text-red-500 mt-3">Values are in your local <code>.env.local</code> file. After adding, redeploy.</p>
        </div>
      </div>
    )
  }

  let query = supabase
    .from('installations')
    .select('machine_id, restaurant_name, phone, app_version, created_at, updated_at, trials(status, expires_at)')
    .order('updated_at', { ascending: false })
    .limit(200)

  if (search) {
    query = query.or(`restaurant_name.ilike.%${search}%,machine_id.ilike.%${search}%,phone.ilike.%${search}%`)
  }

  const { data } = await query
  const users = (data || []) as unknown as Installation[]
  const fetchedAt = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Users</h1>
        <div className="text-right">
          <span className="text-sm text-gray-500">{users.length} results</span>
          <p className="text-xs text-gray-400">fetched at {fetchedAt} (server time)</p>
        </div>
      </div>

      <form className="mb-4">
        <input
          name="q"
          defaultValue={search}
          placeholder="Search by name, machine ID, or phone…"
          className="w-full max-w-md border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
        />
      </form>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Restaurant</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Machine ID</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Phone</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Version</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Trial Expiry</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Last Seen</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {users.map((u) => (
              <tr key={u.machine_id} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3 font-medium">{u.restaurant_name || '—'}</td>
                <td className="px-4 py-3 font-mono text-xs text-gray-500">{u.machine_id}</td>
                <td className="px-4 py-3 text-gray-600">{u.phone || '—'}</td>
                <td className="px-4 py-3 text-gray-600">{u.app_version || '—'}</td>
                <td className="px-4 py-3"><StatusBadge trial={u.trials} /></td>
                <td className="px-4 py-3 text-gray-600">{formatDate(u.trials?.expires_at || null)}</td>
                <td className="px-4 py-3 text-gray-500">{formatDate(u.updated_at)}</td>
                <td className="px-4 py-3">
                  <Link href={`/admin/users/${u.machine_id}`} className="text-orange-500 hover:text-orange-600 font-medium">
                    View →
                  </Link>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-gray-400">No users found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
