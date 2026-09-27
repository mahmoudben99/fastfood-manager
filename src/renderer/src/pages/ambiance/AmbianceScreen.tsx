import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, ImagePlay, LayoutList, Monitor, Palette, Plus, Trash2 } from 'lucide-react'
import { useAppStore } from '../../store/appStore'
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  PageHeader,
  Skeleton,
  SkeletonText,
  Tabs,
  toast
} from '../../components/ui'
import { GOOGLE_FONTS_URL } from './parts/presets'
import { useAmbianceProfiles } from './parts/useAmbianceProfiles'
import { ConnectTvCard } from './parts/ConnectTvCard'
import { DisplayLinkCard } from './parts/DisplayLinkCard'
import { AppearanceSection } from './parts/AppearanceSection'
import { ContentSection } from './parts/ContentSection'
import { MediaSection } from './parts/MediaSection'
import { TvPreview } from './parts/TvPreview'
import { AddDisplayModal } from './parts/AddDisplayModal'

type SectionId = 'look' | 'content' | 'media'

/** /admin/ambiance: branded TV displays (one pairing code per POS, one settings set per profile). */
export function AmbianceScreen() {
  const { t } = useTranslation()
  const isTouch = useAppStore((s) => s.inputMode) === 'touchscreen'
  const a = useAmbianceProfiles()
  const [section, setSection] = useState<SectionId>('look')
  const [addOpen, setAddOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  const labelOf = (profile: string) => (profile === 'default' ? t('ambiance.mainDisplay') : profile)
  const activeLabel = labelOf(a.activeProfile)

  const doDelete = async () => {
    if (!confirmDelete) return
    const name = confirmDelete
    setDeleting(true)
    try {
      await a.deleteProfile(name)
      toast.success(t('ambiance.profileDeleted', { name }))
      setConfirmDelete(null)
    } catch {
      toast.error(t('common.error'))
    } finally {
      setDeleting(false)
    }
  }

  return (
    <>
      {/* Preview-only web fonts (the TV loads its own copy); offline falls back to system fonts. */}
      <link href={GOOGLE_FONTS_URL} rel="stylesheet" />

      <PageHeader
        icon={<Monitor />}
        title={t('nav.ambianceScreen')}
        actions={
          <>
            <span aria-live="polite">
              {a.saved && (
                <Badge variant="success" size="md" icon={<Check />} className="animate-fade-in">
                  {t('ambiance.saved')}
                </Badge>
              )}
            </span>
            <Button size="lg" icon={<Plus className="h-5 w-5" />} onClick={() => setAddOpen(true)}>
              {t('ambiance.addDisplay')}
            </Button>
          </>
        }
      />

      <ConnectTvCard
        pairingCode={a.pairingCode}
        pairingLoaded={a.pairingLoaded}
        firewallState={a.firewallState}
        onAllowFirewall={a.allowFirewall}
      />

      {/* Which TV profile is being edited */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <Tabs
          variant="pills"
          className="min-w-0 flex-1"
          value={a.activeProfile}
          onChange={a.setActiveProfile}
          tabs={a.profiles.map((profile) => ({
            id: profile,
            label: <bdi>{labelOf(profile)}</bdi>,
            icon: <Monitor />
          }))}
        />
        {a.activeProfile !== 'default' && (
          <Button
            variant="secondary"
            size="lg"
            icon={<Trash2 className="h-5 w-5 text-danger-ink" />}
            onClick={() => setConfirmDelete(a.activeProfile)}
          >
            {t('ambiance.deleteProfile')}
          </Button>
        )}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(340px,420px)]">
        <div className="min-w-0 space-y-6">
          <DisplayLinkCard
            profile={a.activeProfile}
            profileLabel={activeLabel}
            tvUrl={a.current.tvUrl}
            tabletRunning={a.tabletRunning}
            tabletUrl={a.tabletUrl}
          />

          <Card padding={false}>
            <Tabs<SectionId>
              className="px-3"
              value={section}
              onChange={setSection}
              tabs={[
                { id: 'look', label: t('ambiance.tabAppearance'), icon: <Palette /> },
                { id: 'content', label: t('ambiance.tabContent'), icon: <LayoutList /> },
                { id: 'media', label: t('ambiance.tabMedia'), icon: <ImagePlay /> }
              ]}
            />
            <div className="p-5">
              {!a.loaded ? (
                <SkeletonText lines={8} />
              ) : section === 'look' ? (
                <AppearanceSection current={a.current} onChange={a.updateSetting} />
              ) : section === 'content' ? (
                <ContentSection
                  current={a.current}
                  isTouch={isTouch}
                  onChange={a.updateSetting}
                  onWelcomeText={a.setWelcomeText}
                />
              ) : (
                <MediaSection
                  current={a.current}
                  isTouch={isTouch}
                  onEditYoutube={(v) => a.editLocal('youtubeUrl', v)}
                  onSaveYoutube={(v) => a.updateSetting('youtubeUrl', v)}
                  onUpload={a.uploadImages}
                  onRemoveImage={a.removeImage}
                />
              )}
            </div>
          </Card>
        </div>

        <aside className="min-w-0 xl:sticky xl:top-0 xl:self-start">
          {a.loaded ? (
            <TvPreview current={a.current} restaurantName={a.restaurantName} profileLabel={activeLabel} />
          ) : (
            <Card>
              <Skeleton className="aspect-video w-full" />
            </Card>
          )}
        </aside>
      </div>

      <AddDisplayModal isOpen={addOpen} isTouch={isTouch} onClose={() => setAddOpen(false)} onCreate={a.addProfile} />

      <ConfirmDialog
        isOpen={confirmDelete !== null}
        title={t('ambiance.deleteProfileTitle', { name: confirmDelete ?? '' })}
        message={t('ambiance.deleteProfileMessage')}
        confirmLabel={t('common.delete')}
        tone="danger"
        busy={deleting}
        onConfirm={doDelete}
        onCancel={() => setConfirmDelete(null)}
      />
    </>
  )
}
