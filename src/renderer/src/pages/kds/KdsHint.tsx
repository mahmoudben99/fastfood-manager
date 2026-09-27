import { Info } from 'lucide-react'

/** Info icon whose tooltip carries the longer explanation (keeps the page short). */
export function KdsHint({ text }: { text: string }) {
  return (
    <span role="img" aria-label={text} title={text} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted">
      <Info className="h-4 w-4" aria-hidden="true" />
    </span>
  )
}
