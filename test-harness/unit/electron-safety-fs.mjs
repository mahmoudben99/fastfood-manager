export {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
  unlinkSync
} from 'node:fs'
import { renameSync as nativeRenameSync } from 'node:fs'

let failRename = false

export function setFailRename(value) { failRename = value }
export function renameSync(...args) {
  if (failRename) throw new Error('forced replacement failure')
  return nativeRenameSync(...args)
}
