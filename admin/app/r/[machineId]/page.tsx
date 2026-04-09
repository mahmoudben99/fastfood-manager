import { RemoteOrder } from './RemoteOrder'

export default function RemoteOrderPage({ params }: { params: { machineId: string } }) {
  return <RemoteOrder machineId={params.machineId} />
}
