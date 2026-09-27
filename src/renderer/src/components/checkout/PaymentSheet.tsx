import type { PaymentSheetProps } from './contracts'

/** STUB (v4 wave-2 contract) — replaced by the checkout agent. Pays the full total in cash. */
export function PaymentSheet({ open, total, onConfirm }: PaymentSheetProps) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40">
      <button className="rounded-xl bg-primary px-6 py-4 text-on-primary" onClick={() => onConfirm([{ method: 'cash', amount: total }])}>
        Cash {total}
      </button>
    </div>
  )
}
