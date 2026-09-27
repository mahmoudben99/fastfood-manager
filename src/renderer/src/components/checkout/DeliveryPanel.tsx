import type { DeliveryPanelProps } from './contracts'

/** STUB (v4 wave-2 contract) — replaced by the checkout agent. */
export function DeliveryPanel({ value, onChange }: DeliveryPanelProps) {
  return (
    <textarea
      className="w-full rounded-lg border border-line bg-surface p-2"
      value={value?.address ?? ''}
      onChange={(e) => onChange({ ...(value ?? {}), address: e.target.value })}
    />
  )
}
