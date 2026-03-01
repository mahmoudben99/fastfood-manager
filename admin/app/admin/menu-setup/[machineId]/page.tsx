import { supabase, isConfigured } from '@/lib/supabase'
import Link from 'next/link'
import { ExcelUploadForm } from './ExcelUploadForm'

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

export default async function MenuSetupDetailPage({
  params
}: {
  params: Promise<{ machineId: string }>
}) {
  const { machineId } = await params

  if (!isConfigured) {
    return <p className="text-red-600">Supabase not configured.</p>
  }

  // Fetch request info
  const { data: request } = await supabase
    .from('menu_upload_requests')
    .select('*')
    .eq('machine_id', machineId)
    .single()

  if (!request) {
    return (
      <div>
        <Link href="/admin/menu-setup" className="text-orange-500 hover:text-orange-600 text-sm">&larr; Back to Menu Setup</Link>
        <p className="mt-4 text-gray-500">No menu upload request found for this machine.</p>
      </div>
    )
  }

  // List images from storage
  const { data: imageFiles } = await supabase.storage
    .from('menu-uploads')
    .list(`${machineId}/images`, { limit: 100 })

  // Get public URLs for each image
  const images = (imageFiles || [])
    .filter(f => !f.name.startsWith('.'))
    .map(f => {
      const { data } = supabase.storage
        .from('menu-uploads')
        .getPublicUrl(`${machineId}/images/${f.name}`)
      return { name: f.name, url: data.publicUrl }
    })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/admin/menu-setup" className="text-orange-500 hover:text-orange-600 text-sm">&larr; Back to Menu Setup</Link>
          <h1 className="text-2xl font-bold mt-2">{request.restaurant_name || 'Unknown Restaurant'}</h1>
          <p className="text-sm text-gray-500 font-mono">{machineId}</p>
        </div>
        <StatusBadge status={request.status} />
      </div>

      {/* Image Gallery */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-bold mb-4">Menu Images ({images.length})</h2>

        {images.length === 0 ? (
          <p className="text-gray-400 text-sm">No images uploaded yet.</p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {images.map((img) => (
              <div key={img.name} className="group relative">
                <img
                  src={img.url}
                  alt={img.name}
                  className="w-full h-48 object-cover rounded-lg border border-gray-200"
                />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors rounded-lg flex items-center justify-center">
                  <a
                    href={img.url}
                    download={img.name}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="opacity-0 group-hover:opacity-100 transition-opacity bg-white text-gray-800 px-3 py-1.5 rounded-lg text-sm font-medium shadow-lg"
                  >
                    Download
                  </a>
                </div>
                <p className="text-xs text-gray-400 mt-1 truncate">{img.name}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Excel Upload Section */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-bold mb-4">Upload Excel Menu</h2>
        <p className="text-sm text-gray-500 mb-4">
          After creating the Excel file from the images, upload it here. The client app will automatically download and import it.
        </p>
        <ExcelUploadForm machineId={machineId} currentStatus={request.status} />
      </div>
    </div>
  )
}
