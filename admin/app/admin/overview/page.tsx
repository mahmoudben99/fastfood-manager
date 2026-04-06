import { supabase } from '@/lib/supabase'
import { OverviewClient } from './OverviewClient'

export const dynamic = 'force-dynamic'

async function getOverviewData() {
  const today = new Date().toISOString().split('T')[0]

  // Yesterday for "today sells" (sync runs for previous day)
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  const yesterdayStr = yesterday.toISOString().split('T')[0]

  // 7 days ago
  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
  const weekStr = sevenDaysAgo.toISOString().split('T')[0]

  // 30 days ago
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const monthStr = thirtyDaysAgo.toISOString().split('T')[0]

  const [
    { data: installations },
    { data: dailyStats },
    { data: topItems }
  ] = await Promise.all([
    supabase.from('installations').select('machine_id, restaurant_name, phone, app_version, updated_at, created_at').order('updated_at', { ascending: false }),
    supabase.from('daily_stats').select('*').gte('date', monthStr).order('date', { ascending: false }),
    supabase.from('daily_top_items').select('*').gte('date', weekStr).order('quantity_sold', { ascending: false }).limit(200)
  ])

  return {
    installations: (installations || []) as any[],
    dailyStats: (dailyStats || []) as any[],
    topItems: (topItems || []) as any[],
    yesterdayStr,
    weekStr
  }
}

export default async function OverviewPage() {
  const data = await getOverviewData()
  return <OverviewClient {...data} />
}
