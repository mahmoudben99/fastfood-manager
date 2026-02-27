import { supabase } from '@/lib/supabase'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { TrialControls } from './TrialControls'

function formatDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  })
}

function formatDaysLeft(expiresAt: string | null) {
  if (!expiresAt) return null
  const ms = new Date(expiresAt).getTime() - Date.now()
  if (ms <= 0) return 'Expired'
  const days = Math.floor(ms / (1000 * 60 * 60 * 24))
  const hours = Math.floor((ms % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
  return days > 0 ? `${days}d ${hours}h left` : `${hours}h left`
}

export default async function UserDetailPage({
  params
}: {
  params: Promise<{ machineId: string }>
}) {
  const { machineId } = await params

  const { data: installation } = await supabase
    .from('installations')
    .select('*')
    .eq('machine_id', machineId)
    .single()

  if (!installation) notFound()

  const { data: trial } = await supabase
    .from('trials')
    .select('*')
    .eq('machine_id', machineId)
    .single()

  const { data: activation } = await supabase
    .from('activations')
    .select('activated_at')
    .eq('machine_id', machineId)
    .single()

  const statusColors: Record<string, string> = {
    active: 'bg-green-100 text-green-700 border-green-200',
    expired: 'bg-red-100 text-red-700 border-red-200',
    paused: 'bg-yellow-100 text-yellow-700 border-yellow-200'
  }
  const trialStatusColor = trial ? (statusColors[trial.status] || 'bg-gray-100 text-gray-600') : ''

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/admin/users" className="text-gray-400 hover:text-gray-600 text-sm">← Users</Link>
        <h1 className="text-2xl font-bold">{installation.restaurant_name || 'Unknown Restaurant'}</h1>
        {activation && (
          <span className="px-2 py-0.5 text-xs rounded-full bg-blue-100 text-blue-700 font-medium">Full License</span>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 mb-4 space-y-3">
        <Row label="Machine ID" value={<span className="font-mono text-sm">{machineId}</span>} />
        <Row label="Phone" value={installation.phone || '—'} />
        <Row label="App Version" value={installation.app_version || '—'} />
        <Row label="First Seen" value={formatDate(installation.created_at)} />
        <Row label="Last Updated" value={formatDate(installation.updated_at)} />
        {activation && <Row label="Activated At" value={formatDate(activation.activated_at)} />}
      </div>

      {trial ? (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 mb-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900">Trial Status</h2>
            <div className="flex items-center gap-2">
              <span className={`px-2 py-0.5 text-xs rounded-full font-medium border ${trialStatusColor}`}>
                {trial.status}
              </span>
              {trial.status === 'active' && (
                <span className="text-xs text-gray-500">{formatDaysLeft(trial.expires_at)}</span>
              )}
            </div>
          </div>

          <div className="space-y-2 mb-5 text-sm text-gray-600">
            <Row label="Started" value={formatDate(trial.started_at)} />
            <Row label="Expires" value={formatDate(trial.expires_at)} />
            {trial.paused_remaining_ms && (
              <Row label="Paused With" value={`${Math.round(trial.paused_remaining_ms / 60000)} min remaining`} />
            )}
          </div>

          <TrialControls machineId={machineId} trialStatus={trial.status} />
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 mb-4 text-center text-gray-400 text-sm">
          No trial registered for this machine.
        </div>
      )}
    </div>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-gray-500 min-w-32">{label}</span>
      <span className="text-gray-900 text-right">{value}</span>
    </div>
  )
}
