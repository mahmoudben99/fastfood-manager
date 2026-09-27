import { useTranslation } from 'react-i18next'
import { Button, Input, Modal } from '../../../components/ui'
import type { SocialMediaEntry } from '../../../../../shared/settings-rules'
import { SocialMediaEditor } from '../SocialMediaEditor'
import { InfoNote } from '../SettingsFeedback'

interface SaveAsModalProps {
  isOpen: boolean
  name: string
  saving: boolean
  isTouch: boolean
  onName: (name: string) => void
  onRequestKeyboard: () => void
  onSave: () => void
  onClose: () => void
}

/** Save the current blocks as a new template (it becomes the receipt layout). */
export function SaveAsModal({ isOpen, name, saving, isTouch, onName, onRequestKeyboard, onSave, onClose }: SaveAsModalProps) {
  const { t } = useTranslation()
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('receiptEditor.saveAs')}
      size="sm"
      footer={
        <>
          <Button variant="secondary" size="lg" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button size="lg" onClick={onSave} disabled={!name.trim()} loading={saving}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <Input
        label={t('receiptEditor.templateName')}
        inputSize="lg"
        value={name}
        readOnly={isTouch}
        onClick={isTouch ? onRequestKeyboard : undefined}
        onChange={isTouch ? undefined : (e) => onName(e.target.value)}
        onKeyDown={isTouch ? undefined : (e) => e.key === 'Enter' && name.trim() && onSave()}
        autoFocus={!isTouch}
      />
    </Modal>
  )
}

interface SocialModalProps {
  isOpen: boolean
  draft: SocialMediaEntry[]
  isTouch: boolean
  onDraft: (items: SocialMediaEntry[]) => void
  onRequestKeyboard: (index: number) => void
  onSave: () => void
  onClose: () => void
}

/** Edits settings.social_media — the same list as Settings > General (single source). */
export function SocialModal({ isOpen, draft, isTouch, onDraft, onRequestKeyboard, onSave, onClose }: SocialModalProps) {
  const { t } = useTranslation()
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('settings.socialMedia')}
      size="lg"
      footer={
        <>
          <Button variant="secondary" size="lg" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button size="lg" onClick={onSave}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <InfoNote tone="neutral">{t('receiptEditor.socialSharedNote')}</InfoNote>
        <SocialMediaEditor items={draft} onChange={onDraft} isTouch={isTouch} onRequestKeyboard={onRequestKeyboard} />
      </div>
    </Modal>
  )
}
