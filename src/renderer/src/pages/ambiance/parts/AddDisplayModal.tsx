import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus } from 'lucide-react'
import { Button, Input, Modal } from '../../../components/ui'
import { VirtualKeyboard } from '../../../components/VirtualKeyboard'
import type { AddProfileResult } from './useAmbianceProfiles'

interface AddDisplayModalProps {
  isOpen: boolean
  isTouch: boolean
  onClose: () => void
  onCreate: (name: string) => Promise<AddProfileResult>
}

/** Name a new display profile (its own settings + TV link). */
export function AddDisplayModal({ isOpen, isTouch, onClose, onCreate }: AddDisplayModalProps) {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)
  const [keyboardOpen, setKeyboardOpen] = useState(false)

  const close = () => {
    if (creating) return
    setName('')
    setError('')
    setKeyboardOpen(false)
    onClose()
  }

  const create = async () => {
    if (!name.trim() || creating) return
    setCreating(true)
    const result = await onCreate(name)
    setCreating(false)
    if (result === 'ok') {
      setName('')
      setError('')
      setKeyboardOpen(false)
      onClose()
    } else if (result === 'taken') {
      setError(t('ambiance.nameTaken'))
    } else if (result === 'error') {
      setError(t('common.error'))
    }
  }

  const edit = (value: string) => {
    setName(value)
    if (error) setError('')
  }

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={close}
        title={t('ambiance.addDisplayProfile')}
        size="sm"
        closeOnBackdrop={!name}
        footer={
          <>
            <Button variant="secondary" size="lg" onClick={close} disabled={creating}>
              {t('common.cancel')}
            </Button>
            <Button
              size="lg"
              icon={<Plus className="h-5 w-5" />}
              loading={creating}
              disabled={!name.trim()}
              onClick={create}
            >
              {creating ? t('ambiance.creating') : t('ambiance.create')}
            </Button>
          </>
        }
      >
        <Input
          aria-label={t('ambiance.displayName')}
          title={t('ambiance.addDisplayProfileHint')}
          placeholder={t('ambiance.profileNamePlaceholder')}
          value={name}
          error={error || undefined}
          maxLength={40}
          autoFocus={!isTouch}
          readOnly={isTouch}
          onClick={isTouch ? () => setKeyboardOpen(true) : undefined}
          onChange={(e) => edit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void create()
          }}
        />
      </Modal>
      {isOpen && isTouch && keyboardOpen && (
        <VirtualKeyboard
          visible
          type="text"
          extended
          value={name}
          onChange={edit}
          onClose={() => setKeyboardOpen(false)}
        />
      )}
    </>
  )
}
