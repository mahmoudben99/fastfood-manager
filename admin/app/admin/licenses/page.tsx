import { isLicenseServerConfigured, listLicenses } from '@/lib/license-server'
import { LicensesTable } from './LicensesTable'

export const dynamic = 'force-dynamic'

export default async function LicensesPage() {
  if (!isLicenseServerConfigured()) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-6">Licenses</h1>
        <div className="bg-red-50 border border-red-200 rounded-xl p-6">
          <h2 className="text-base font-bold text-red-700 mb-2">License server not configured</h2>
          <p className="text-sm text-red-600 mb-4">
            This page calls the license-server admin API on the server only. Go to:
            <strong> Vercel → Your Project → Settings → Environment Variables</strong> and add:
          </p>
          <ul className="text-sm font-mono text-red-800 space-y-1 bg-red-100 rounded-lg p-4">
            <li>LICENSE_ADMIN_BEARER — required, the license-server&apos;s ADMIN_BEARER value</li>
            <li>LICENSE_SERVER_URL — optional, defaults to https://ffm-license.xilentm20.workers.dev</li>
          </ul>
          <p className="text-xs text-red-500 mt-3">
            These stay server-side; the browser never sees them. Redeploy after adding.
          </p>
        </div>
      </div>
    )
  }

  const result = await listLicenses()

  if (!result.ok) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-6">Licenses</h1>
        <div className="bg-red-50 border border-red-200 rounded-xl p-6">
          <h2 className="text-base font-bold text-red-700 mb-2">Could not reach the license server</h2>
          <p className="text-sm text-red-600 font-mono">{result.error}</p>
        </div>
      </div>
    )
  }

  const fetchedAt = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Licenses</h1>
        <div className="text-right">
          <span className="text-sm text-gray-500">{result.data.length} customers</span>
          <p className="text-xs text-gray-400">fetched at {fetchedAt} (server time)</p>
        </div>
      </div>
      <LicensesTable initialLicenses={result.data} />
    </div>
  )
}
