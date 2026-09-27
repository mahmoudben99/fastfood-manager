import type { WithApproval } from './contracts'

/** STUB (v4 wave-2 contract) — replaced by the checkout agent (PIN + reason dialog host). */
export function ApprovalHost() {
  return null
}

/** STUB: runs once without approval. */
export const withApproval: WithApproval = async (run) => run()
