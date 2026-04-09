import { redirect } from 'next/navigation'

export default function TVPage({ params, searchParams }: { params: { machineId: string }; searchParams: { profile?: string } }) {
  const profile = searchParams.profile || 'default'
  redirect(`/api/tv-html?machineId=${params.machineId}&profile=${profile}`)
}
