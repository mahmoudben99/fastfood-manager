import { TVDisplay } from './TVDisplay'

export default function TVPage({ params, searchParams }: { params: { machineId: string }; searchParams: { profile?: string } }) {
  return <TVDisplay machineId={params.machineId} profile={searchParams.profile || 'default'} initialSettings={{}} />
}
