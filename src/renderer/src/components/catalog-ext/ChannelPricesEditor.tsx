/**
 * v4 wave-2 CONTRACT: per-channel prices for one menu item (dine-in / takeout / delivery / yassir…).
 * Self-contained: loads and saves through its own IPC. Mounted by the menu item form.
 * STUB — replaced by the fiscal/channels agent.
 */
export interface ChannelPricesEditorProps {
  /** null while the item is not saved yet (the editor then explains it must be saved first). */
  menuItemId: number | null
  /** The item's normal price, shown as the default for channels without an override. */
  basePrice: number
}

export function ChannelPricesEditor(_props: ChannelPricesEditorProps) {
  return null
}
