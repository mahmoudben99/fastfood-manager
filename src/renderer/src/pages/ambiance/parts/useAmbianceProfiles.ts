import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from '../../../components/ui'
import {
  DEFAULT_PROFILE_SETTINGS,
  MAX_SLIDESHOW_IMAGES,
  PROFILE_KEYS_TO_PURGE,
  SETTING_KEY_SUFFIX,
  buildTvUrl,
  readProfileSettings,
  settingsPrefix,
  type ProfileSettings
} from './presets'

export type FirewallState = 'idle' | 'working' | 'done' | 'failed'
export type AddProfileResult = 'ok' | 'empty' | 'taken' | 'error'

const WELCOME_SAVE_DELAY_MS = 700

async function syncCloud(profile: string): Promise<void> {
  if (!window.api.cloud?.syncDisplay) return
  try {
    await window.api.cloud.syncDisplay(profile)
  } catch {
    /* offline: the 5-min reconcile job catches up */
  }
}

/** All Ambiance-screen state + IPC actions (profiles, per-profile settings, TV pairing). */
export function useAmbianceProfiles() {
  const { t } = useTranslation()
  const [profiles, setProfiles] = useState<string[]>(['default'])
  const [activeProfile, setActiveProfile] = useState('default')
  const [settings, setSettings] = useState<Record<string, ProfileSettings>>({})
  const [loaded, setLoaded] = useState(false)
  const [saved, setSaved] = useState(false)
  const [restaurantName, setRestaurantName] = useState('')
  const [tabletRunning, setTabletRunning] = useState(false)
  const [tabletUrl, setTabletUrl] = useState('')
  const [pairingCode, setPairingCode] = useState('')
  const [pairingLoaded, setPairingLoaded] = useState(false)
  const [firewallState, setFirewallState] = useState<FirewallState>('idle')
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const welcomeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingWelcome = useRef<{ profile: string; value: string } | null>(null)

  const flashSaved = useCallback(() => {
    setSaved(true)
    if (savedTimer.current) clearTimeout(savedTimer.current)
    savedTimer.current = setTimeout(() => setSaved(false), 2000)
  }, [])

  /** Write one field to the settings table, then push the profile to the cloud TV. */
  const persist = useCallback(
    async <K extends keyof ProfileSettings>(profile: string, key: K, value: ProfileSettings[K]) => {
      const p = settingsPrefix(profile)
      try {
        const suffix = SETTING_KEY_SUFFIX[key]
        if (suffix) {
          const stringValue = typeof value === 'boolean' ? (value ? 'true' : 'false') : String(value)
          await window.api.settings.set(`${p}${suffix}`, stringValue)
        }
        if (key === 'panelToggles') {
          for (const [panelKey, on] of Object.entries(value as Record<string, boolean>)) {
            await window.api.settings.set(`${p}panel_${panelKey}`, on ? 'true' : 'false')
          }
        }
      } catch {
        toast.error(t('ambiance.saveFailed'), { id: 'ambiance-save' })
        return
      }
      flashSaved()
      await syncCloud(profile)
    },
    [flashSaved, t]
  )

  const setLocal = useCallback(
    <K extends keyof ProfileSettings>(profile: string, key: K, value: ProfileSettings[K]) => {
      setSettings((prev) => ({
        ...prev,
        [profile]: { ...(prev[profile] ?? DEFAULT_PROFILE_SETTINGS), [key]: value }
      }))
    },
    []
  )

  /** Change + save a field of the active profile. */
  const updateSetting = <K extends keyof ProfileSettings>(key: K, value: ProfileSettings[K]) => {
    setLocal(activeProfile, key, value)
    void persist(activeProfile, key, value)
  }

  /** Change a field locally only (YouTube URL is saved by its own Save button). */
  const editLocal = <K extends keyof ProfileSettings>(key: K, value: ProfileSettings[K]) =>
    setLocal(activeProfile, key, value)

  const flushWelcome = useCallback(() => {
    if (welcomeTimer.current) clearTimeout(welcomeTimer.current)
    welcomeTimer.current = null
    const pending = pendingWelcome.current
    pendingWelcome.current = null
    if (pending) void persist(pending.profile, 'welcomeText', pending.value)
  }, [persist])

  /** Welcome text is typed: update the preview now, save once typing pauses (not per key). */
  const setWelcomeText = (value: string) => {
    setLocal(activeProfile, 'welcomeText', value)
    if (pendingWelcome.current && pendingWelcome.current.profile !== activeProfile) flushWelcome()
    pendingWelcome.current = { profile: activeProfile, value }
    if (welcomeTimer.current) clearTimeout(welcomeTimer.current)
    welcomeTimer.current = setTimeout(flushWelcome, WELCOME_SAVE_DELAY_MS)
  }

  // Never lose the last keystrokes when leaving the page.
  const flushRef = useRef(flushWelcome)
  flushRef.current = flushWelcome
  useEffect(
    () => () => {
      flushRef.current()
      if (savedTimer.current) clearTimeout(savedTimer.current)
    },
    []
  )

  const loadAllProfiles = useCallback(async () => {
    const allSettings = await window.api.settings.getAll()
    setRestaurantName(allSettings.restaurant_name || '')

    let profileList: string[] = ['default']
    try {
      const stored = allSettings.display_profiles
      if (stored) {
        const parsed = JSON.parse(stored)
        if (Array.isArray(parsed) && parsed.length > 0) {
          profileList = parsed
          if (!profileList.includes('default')) profileList.unshift('default')
        }
      }
    } catch {
      /* ignore */
    }
    setProfiles(profileList)

    let mid = ''
    try {
      mid = await window.api.activation.getMachineId()
    } catch {
      /* ignore */
    }

    try {
      const tabletStatus = await window.api.tablet.status()
      setTabletRunning(tabletStatus.running)
      setTabletUrl(tabletStatus.url || '')
    } catch {
      /* ignore */
    }

    const settingsMap: Record<string, ProfileSettings> = {}
    for (const profile of profileList) {
      let images: string[] = []
      try {
        images = (await window.api.tablet.getDisplayImages(profile)) || []
      } catch {
        /* ignore */
      }
      settingsMap[profile] = readProfileSettings(allSettings, profile, images, buildTvUrl(mid, profile))
    }
    setSettings(settingsMap)
    setLoaded(true)
  }, [])

  useEffect(() => {
    window.api.tablet
      .getPairingCode()
      .then((r: any) => setPairingCode(r?.code || ''))
      .catch(() => {})
      .finally(() => setPairingLoaded(true))
    void loadAllProfiles()
  }, [loadAllProfiles])

  const allowFirewall = async () => {
    setFirewallState('working')
    try {
      const r = await window.api.tablet.allowFirewall()
      setFirewallState(r?.ok ? 'done' : 'failed')
    } catch {
      setFirewallState('failed')
    }
  }

  const addProfile = async (rawName: string): Promise<AddProfileResult> => {
    const name = rawName.trim()
    if (!name) return 'empty'
    // 'default' is the main display's key; a duplicate would share (and later purge) its rows.
    if (name.toLowerCase() === 'default' || profiles.includes(name)) return 'taken'
    try {
      // Persist the local profile list FIRST, before the (slow, base64-heavy) cloud create.
      // The 5-min reconcile job deletes any cloud profile row not in this local list; doing
      // the cloud insert first opened a window where reconcile could delete the brand-new
      // row (and its short code) as an "orphan". Local-first closes that race.
      const updatedProfiles = [...profiles, name]
      setProfiles(updatedProfiles)
      await window.api.settings.set('display_profiles', JSON.stringify(updatedProfiles))

      try {
        await window.api.cloud.createDisplayProfile(name)
      } catch {
        /* ignore */
      }

      let mid = ''
      try {
        mid = await window.api.activation.getMachineId()
      } catch {
        /* ignore */
      }
      setSettings((prev) => ({ ...prev, [name]: { ...DEFAULT_PROFILE_SETTINGS, tvUrl: buildTvUrl(mid, name) } }))
      setActiveProfile(name)
      return 'ok'
    } catch {
      return 'error'
    }
  }

  const deleteProfile = async (profileName: string) => {
    if (profileName === 'default') return
    const updatedProfiles = profiles.filter((p) => p !== profileName)
    setProfiles(updatedProfiles)
    await window.api.settings.set('display_profiles', JSON.stringify(updatedProfiles))

    // Delete the Supabase row so the picker page doesn't show it as an orphan
    try {
      await window.api.cloud?.deleteDisplayProfile?.(profileName)
    } catch {
      /* ignore */
    }

    const p = `display_${profileName}_`
    for (const key of PROFILE_KEYS_TO_PURGE) {
      await window.api.settings.set(`${p}${key}`, '')
    }

    setSettings((prev) => {
      const next = { ...prev }
      delete next[profileName]
      return next
    })
    if (activeProfile === profileName) setActiveProfile('default')
  }

  const current = settings[activeProfile] || DEFAULT_PROFILE_SETTINGS

  const uploadImages = async () => {
    const profile = activeProfile
    try {
      const paths = await window.api.tablet.uploadDisplayImages(profile)
      if (paths) {
        setLocal(profile, 'images', paths.slice(0, MAX_SLIDESHOW_IMAGES))
        // Push the new images to cloud immediately
        await syncCloud(profile)
      }
    } catch {
      toast.error(t('common.error'))
    }
  }

  const removeImage = async (imgPath: string) => {
    const profile = activeProfile
    try {
      const updated = await window.api.tablet.removeDisplayImage(imgPath, profile)
      setLocal(profile, 'images', updated || [])
      await syncCloud(profile)
    } catch {
      toast.error(t('common.error'))
    }
  }

  return {
    profiles,
    activeProfile,
    setActiveProfile,
    current,
    loaded,
    saved,
    restaurantName,
    tabletRunning,
    tabletUrl,
    pairingCode,
    pairingLoaded,
    firewallState,
    allowFirewall,
    updateSetting,
    editLocal,
    setWelcomeText,
    addProfile,
    deleteProfile,
    uploadImages,
    removeImage
  }
}

export type AmbianceState = ReturnType<typeof useAmbianceProfiles>
