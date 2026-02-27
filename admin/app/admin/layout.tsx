import { Sidebar } from '@/components/Sidebar'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 p-4 md:p-6 overflow-auto pt-16 md:pt-6">{children}</main>
    </div>
  )
}
