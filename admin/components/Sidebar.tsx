'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'

const navItems = [
  { href: '/admin/users', label: 'Users', icon: '👥' },
  { href: '/admin/keygen', label: 'Keygen', icon: '🔑' },
  { href: '/admin/reset', label: 'Reset Codes', icon: '🔓' }
]

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const [open, setOpen] = useState(false)

  // Close drawer on route change
  useEffect(() => {
    setOpen(false)
  }, [pathname])

  const handleLogout = async () => {
    await fetch('/api/logout', { method: 'POST' })
    router.push('/login')
  }

  const NavLinks = () => (
    <>
      <nav className="flex-1 p-3 space-y-1">
        {navItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-orange-500 text-white'
                  : 'text-gray-300 hover:bg-gray-800 hover:text-white'
              }`}
            >
              <span className="text-lg">{item.icon}</span>
              {item.label}
            </Link>
          )
        })}
      </nav>

      <div className="p-3 border-t border-gray-700">
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-300 hover:bg-gray-800 hover:text-white transition-colors"
        >
          <span className="text-lg">🚪</span>
          Sign Out
        </button>
        <p className="text-center text-gray-600 text-xs mt-2">admin build 2026-02-27c</p>
      </div>
    </>
  )

  return (
    <>
      {/* ── Mobile top bar ── */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-40 flex items-center justify-between bg-gray-900 px-4 py-3 shadow-md">
        <div className="flex items-center gap-2">
          <span className="text-xl">🍔</span>
          <span className="font-bold text-white text-sm">FFM Admin</span>
        </div>
        <button
          onClick={() => setOpen((o) => !o)}
          className="text-white p-1.5 rounded-lg hover:bg-gray-800 transition-colors"
          aria-label="Toggle menu"
        >
          {open ? (
            // X icon
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            // Hamburger icon
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          )}
        </button>
      </div>

      {/* ── Mobile drawer backdrop ── */}
      {open && (
        <div
          className="md:hidden fixed inset-0 z-30 bg-black/50"
          onClick={() => setOpen(false)}
        />
      )}

      {/* ── Mobile drawer ── */}
      <aside
        className={`md:hidden fixed top-0 left-0 z-40 h-full w-64 bg-gray-900 text-white flex flex-col transform transition-transform duration-200 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="p-5 border-b border-gray-700 pt-16">
          <p className="text-gray-400 text-xs uppercase tracking-wider">Navigation</p>
        </div>
        <NavLinks />
      </aside>

      {/* ── Desktop sidebar ── */}
      <aside className="hidden md:flex w-56 bg-gray-900 text-white flex-col min-h-screen sticky top-0 h-screen">
        <div className="p-5 border-b border-gray-700">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🍔</span>
            <div>
              <p className="font-bold text-sm leading-tight">FFM Admin</p>
              <p className="text-gray-400 text-xs">Management Dashboard</p>
            </div>
          </div>
        </div>
        <NavLinks />
      </aside>
    </>
  )
}
