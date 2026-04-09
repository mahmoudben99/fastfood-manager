import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Monitor, Plus, Copy, Check, X, Upload, Image } from 'lucide-react'
import { useAppStore } from '../../store/appStore'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Card } from '../../components/ui/Card'

const GRADIENT_PRESETS = [
  { name: 'Midnight', colors: ['#0f0c29', '#302b63', '#24243e'] },
  { name: 'Ocean', colors: ['#000428', '#004e92', '#000428'] },
  { name: 'Sunset', colors: ['#1a0a00', '#b33000', '#ff6a00'] },
  { name: 'Forest', colors: ['#0a1a0a', '#1b4332', '#2d6a4f'] },
  { name: 'Royal Purple', colors: ['#1a0033', '#4a0080', '#7b2ff7'] },
  { name: 'Cherry', colors: ['#1a0000', '#6b0020', '#c0003a'] },
  { name: 'Coffee', colors: ['#1a0f00', '#3e2723', '#6d4c41'] },
  { name: 'Arctic', colors: ['#0a1628', '#1a3a5c', '#2e6b8a'] },
  { name: 'Ember', colors: ['#1a0500', '#8b2500', '#d44500'] },
  { name: 'Teal Night', colors: ['#001a1a', '#004d4d', '#008080'] },
  { name: 'Gold', colors: ['#1a1400', '#4a3800', '#8b6914'] },
  { name: 'Rose', colors: ['#1a0010', '#4a0028', '#8b1460'] },
  { name: 'Storm', colors: ['#0d0d0d', '#2c2c2c', '#4a4a4a'] },
  { name: 'Warm Night', colors: ['#1a0a00', '#3d1c00', '#6b3a1f'] },
  { name: 'Pure Dark', colors: ['#000000', '#0a0a0a', '#111111'] },
  { name: 'Sunrise', colors: ['#fff1eb', '#ace0f9', '#ffd6a5'] },
  { name: 'Cotton Candy', colors: ['#fce4ec', '#e8eaf6', '#f3e5f5'] },
  { name: 'Fresh Mint', colors: ['#e8f5e9', '#b2dfdb', '#c8e6c9'] },
  { name: 'Peach Cream', colors: ['#fff3e0', '#ffe0b2', '#ffccbc'] },
  { name: 'Sky Blue', colors: ['#e3f2fd', '#bbdefb', '#b3e5fc'] }
]

const FONT_OPTIONS = ['Playfair Display', 'Inter', 'DM Serif Display', 'Cormorant Garamond', 'Montserrat', 'Raleway']

const TEXT_COLOR_OPTIONS = [
  { color: '#ffffff', label: 'White' },
  { color: '#f0f0f0', label: 'Off-white' },
  { color: '#fff8e7', label: 'Warm white' },
  { color: '#d4d4d4', label: 'Light gray' },
  { color: '#ffd700', label: 'Gold' },
  { color: '#fffdd0', label: 'Cream' },
  { color: '#e0f7fa', label: 'Ice blue' },
  { color: '#fce4ec', label: 'Light pink' },
  { color: '#1a1a1a', label: 'Dark' },
  { color: '#2d2d2d', label: 'Charcoal' },
  { color: '#4a3728', label: 'Brown' }
]

const ACCENT_COLOR_OPTIONS = [
  { color: '#f97316', label: 'Orange' },
  { color: '#3b82f6', label: 'Blue' },
  { color: '#22c55e', label: 'Green' },
  { color: '#ef4444', label: 'Red' },
  { color: '#a855f7', label: 'Purple' },
  { color: '#ec4899', label: 'Pink' },
  { color: '#eab308', label: 'Gold' },
  { color: '#14b8a6', label: 'Teal' },
  { color: '#06b6d4', label: 'Cyan' },
  { color: '#ffffff', label: 'White' }
]

const PANEL_OPTIONS = [
  { key: 'welcome', label: 'Welcome (Logo + Name)' },
  { key: 'social', label: 'Social Media & Contact' },
  { key: 'promos', label: 'Promotions & Packs' },
  { key: 'slideshow', label: 'Image Slideshow' },
  { key: 'orders', label: 'Orders Being Prepared' },
  { key: 'menu', label: 'Menu Items' }
]

const GOOGLE_FONTS_URL =
  'https://fonts.googleapis.com/css2?family=' +
  FONT_OPTIONS.map((f) => f.replace(/ /g, '+')).join('&family=') +
  '&display=swap'

interface ProfileSettings {
  gradientPreset: number
  fontFamily: string
  textColor: string
  accentColor: string
  textScale: 'small' | 'medium' | 'large'
  logoScale: number
  showName: boolean
  showMenu: boolean
  panelToggles: Record<string, boolean>
  welcomeMode: 'animated' | 'static'
  welcomeText: string
  youtubeUrl: string
  images: string[]
  tvUrl: string
}

const DEFAULT_PROFILE_SETTINGS: ProfileSettings = {
  gradientPreset: 0,
  fontFamily: 'Playfair Display',
  textColor: '#ffffff',
  accentColor: '#f97316',
  textScale: 'medium',
  logoScale: 1,
  showName: true,
  showMenu: false,
  panelToggles: { welcome: true, social: true, promos: true, slideshow: true, orders: true, menu: true },
  welcomeMode: 'animated',
  welcomeText: '',
  youtubeUrl: 'https://www.youtube.com/watch?v=53nwh1aHCU8&list=RD53nwh1aHCU8&start_radio=1',
  images: [],
  tvUrl: ''
}

export function AmbianceScreen() {
  const { t } = useTranslation()
  const { loadSettings } = useAppStore()

  const [profiles, setProfiles] = useState<string[]>(['default'])
  const [activeProfile, setActiveProfile] = useState('default')
  const [settings, setSettings] = useState<Record<string, ProfileSettings>>({})
  const [saved, setSaved] = useState(false)
  const [copiedCode, setCopiedCode] = useState<string | null>(null)
  const [newProfileModal, setNewProfileModal] = useState(false)
  const [newProfileName, setNewProfileName] = useState('')
  const [creatingProfile, setCreatingProfile] = useState(false)
  const [restaurantName, setRestaurantName] = useState('')
  const [tabletRunning, setTabletRunning] = useState(false)
  const [tabletUrl, setTabletUrl] = useState('')

  const flashSaved = () => {
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  // Build the settings key prefix for a profile
  const prefix = (profile: string) => (profile === 'default' ? 'display_' : `display_${profile}_`)

  useEffect(() => {
    loadAllProfiles()
  }, [])

  const loadAllProfiles = async () => {
    const allSettings = await window.api.settings.getAll()
    setRestaurantName(allSettings.restaurant_name || '')

    // Load profile list
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

    // Load machine ID for direct URLs
    let mid = ''
    try {
      mid = await window.api.activation.getMachineId()
    } catch {
      /* ignore */
    }

    // Load tablet status
    try {
      const tabletStatus = await window.api.tablet.status()
      setTabletRunning(tabletStatus.running)
      setTabletUrl(tabletStatus.url || '')
    } catch {
      /* ignore */
    }

    // Load settings for each profile
    const settingsMap: Record<string, ProfileSettings> = {}
    for (const profile of profileList) {
      const p = profile === 'default' ? 'display_' : `display_${profile}_`
      let images: string[] = []
      try {
        images = (await window.api.tablet.getDisplayImages()) || []
      } catch {
        /* ignore */
      }

      settingsMap[profile] = {
        gradientPreset: parseInt(allSettings[`${p}gradient_preset`] || '0'),
        fontFamily: allSettings[`${p}font_family`] || 'Playfair Display',
        textColor: allSettings[`${p}text_color`] || '#ffffff',
        accentColor: allSettings[`${p}accent_color`] || '#f97316',
        textScale: (allSettings[`${p}text_scale`] as 'small' | 'medium' | 'large') || 'medium',
        logoScale: parseFloat(allSettings[`${p}logo_scale`] || '1'),
        showName: allSettings[`${p}show_name`] !== 'false',
        showMenu: allSettings[`${p}show_menu`] === 'true',
        panelToggles: {
          welcome: allSettings[`${p}panel_welcome`] !== 'false',
          social: allSettings[`${p}panel_social`] !== 'false',
          promos: allSettings[`${p}panel_promos`] !== 'false',
          slideshow: allSettings[`${p}panel_slideshow`] !== 'false',
          orders: allSettings[`${p}panel_orders`] !== 'false',
          menu: allSettings[`${p}panel_menu`] !== 'false'
        },
        welcomeMode: (allSettings[`${p}welcome_mode`] as 'animated' | 'static') || 'animated',
        welcomeText: allSettings[`${p}welcome_text`] || '',
        youtubeUrl:
          allSettings[`${p}youtube_url`] ||
          'https://www.youtube.com/watch?v=53nwh1aHCU8&list=RD53nwh1aHCU8&start_radio=1',
        images: profile === 'default' ? images : [],
        tvUrl: mid ? (profile === 'default' ? `fastfood-manager.vercel.app/tv/${mid}` : `fastfood-manager.vercel.app/tv/${mid}?profile=${profile}`) : ''
      }
    }
    setSettings(settingsMap)
  }

  const current = settings[activeProfile] || DEFAULT_PROFILE_SETTINGS
  const currentGradient = GRADIENT_PRESETS[current.gradientPreset] || GRADIENT_PRESETS[0]

  const updateSetting = async <K extends keyof ProfileSettings>(key: K, value: ProfileSettings[K]) => {
    const updated = { ...current, [key]: value }
    setSettings((prev) => ({ ...prev, [activeProfile]: updated }))

    const p = prefix(activeProfile)

    // Map keys to setting keys
    const keyMap: Record<string, string> = {
      gradientPreset: `${p}gradient_preset`,
      fontFamily: `${p}font_family`,
      textColor: `${p}text_color`,
      accentColor: `${p}accent_color`,
      textScale: `${p}text_scale`,
      logoScale: `${p}logo_scale`,
      showName: `${p}show_name`,
      showMenu: `${p}show_menu`,
      welcomeMode: `${p}welcome_mode`,
      welcomeText: `${p}welcome_text`,
      youtubeUrl: `${p}youtube_url`
    }

    const settingKey = keyMap[key as string]
    if (settingKey) {
      const stringValue =
        typeof value === 'boolean' ? (value ? 'true' : 'false') : String(value)
      await window.api.settings.set(settingKey, stringValue)
    }

    // Handle panel toggles specially
    if (key === 'panelToggles') {
      const toggles = value as Record<string, boolean>
      for (const [panelKey, panelValue] of Object.entries(toggles)) {
        await window.api.settings.set(`${p}panel_${panelKey}`, panelValue ? 'true' : 'false')
      }
    }

    flashSaved()

    // Sync to cloud after every change
    if (window.api.cloud?.syncDisplay) {
      try {
        await window.api.cloud.syncDisplay(activeProfile)
      } catch { /* ignore */ }
    }
  }

  const handleAddProfile = async () => {
    if (!newProfileName.trim()) return
    setCreatingProfile(true)
    try {
      // Still create profile in cloud for sync
      try {
        await window.api.cloud.createDisplayProfile(newProfileName.trim())
      } catch {
        /* ignore */
      }

      const name = newProfileName.trim()
      const updatedProfiles = [...profiles, name]
      setProfiles(updatedProfiles)
      await window.api.settings.set('display_profiles', JSON.stringify(updatedProfiles))

      // Build TV URL for this profile
      let mid = ''
      try { mid = await window.api.activation.getMachineId() } catch { /* ignore */ }
      const tvUrl = mid ? `fastfood-manager.vercel.app/tv/${mid}?profile=${name}` : ''

      // Initialize default settings for this profile
      const newSettings: ProfileSettings = { ...DEFAULT_PROFILE_SETTINGS, tvUrl }
      setSettings((prev) => ({ ...prev, [name]: newSettings }))

      setActiveProfile(name)
      setNewProfileName('')
      setNewProfileModal(false)
    } catch {
      /* ignore */
    }
    setCreatingProfile(false)
  }

  const handleDeleteProfile = async (profileName: string) => {
    if (profileName === 'default') return
    const updatedProfiles = profiles.filter((p) => p !== profileName)
    setProfiles(updatedProfiles)
    await window.api.settings.set('display_profiles', JSON.stringify(updatedProfiles))

    // Remove settings for this profile
    const p = `display_${profileName}_`
    const keysToRemove = [
      'gradient_preset', 'font_family', 'text_color', 'accent_color',
      'text_scale', 'logo_scale', 'show_name', 'show_menu',
      'panel_welcome', 'panel_social', 'panel_promos', 'panel_slideshow',
      'panel_orders', 'panel_menu', 'welcome_mode', 'welcome_text',
      'youtube_url'
    ]
    for (const key of keysToRemove) {
      await window.api.settings.set(`${p}${key}`, '')
    }

    setSettings((prev) => {
      const next = { ...prev }
      delete next[profileName]
      return next
    })

    if (activeProfile === profileName) {
      setActiveProfile('default')
    }
  }

  const getDisplayLabel = (profile: string) => (profile === 'default' ? 'Main Display' : profile)

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text)
    setCopiedCode(label)
    setTimeout(() => setCopiedCode(null), 2000)
  }

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      <link href={GOOGLE_FONTS_URL} rel="stylesheet" />
      <style>{`
        @keyframes ambiance-gradient {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }
      `}</style>

      {/* Saved toast */}
      {saved && (
        <div className="fixed top-4 right-4 z-50 bg-green-500 text-white px-4 py-2 rounded-lg shadow-lg text-sm font-medium animate-pulse">
          <Check className="h-4 w-4 inline mr-1" />
          Saved
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Monitor className="h-7 w-7 text-orange-500" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{t('nav.ambianceScreen', { defaultValue: 'Ambiance Screen' })}</h1>
            <p className="text-sm text-gray-500">Manage branded TV displays for your restaurant</p>
          </div>
        </div>
        <Button onClick={() => setNewProfileModal(true)}>
          <Plus className="h-4 w-4" />
          Add Display
        </Button>
      </div>

      {/* Profile Tabs */}
      <div className="flex items-center gap-1 mb-6 border-b border-gray-200 overflow-x-auto">
        {profiles.map((profile) => (
          <div key={profile} className="flex items-center">
            <button
              onClick={() => setActiveProfile(profile)}
              className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                activeProfile === profile
                  ? 'border-orange-500 text-orange-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {getDisplayLabel(profile)}
            </button>
            {profile !== 'default' && (
              <button
                onClick={() => handleDeleteProfile(profile)}
                className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                title="Delete profile"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Two-column layout */}
      <div className="flex gap-6">
        {/* LEFT COLUMN - Settings (60%) */}
        <div className="w-[60%] space-y-5">
          {/* Link Section */}
          <Card>
            <div className="space-y-3">
              <h3 className="font-semibold text-sm text-gray-700">Display Link</h3>
              {current.tvUrl ? (
                <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-mono text-gray-800 flex-1 bg-white rounded px-3 py-2 border border-gray-200">
                      {current.tvUrl}
                    </span>
                    <button
                      onClick={() =>
                        copyToClipboard(
                          `https://${current.tvUrl}`,
                          'cloud'
                        )
                      }
                      className="flex-shrink-0 text-orange-500 hover:text-orange-600 p-2"
                      title="Copy link"
                    >
                      {copiedCode === 'cloud' ? (
                        <Check className="h-4 w-4" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">Works from any device with internet</p>
                </div>
              ) : (
                <p className="text-sm text-gray-400">TV display URL not available. Restart the app if this persists.</p>
              )}

              {tabletRunning && activeProfile === 'default' && (
                <div className="bg-green-50 rounded-lg p-3 border border-green-200">
                  <p className="text-xs font-medium text-green-700 mb-1">Local Network URL</p>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-mono text-green-800 flex-1">
                      {tabletUrl.replace(/\/$/, '')}/display
                    </span>
                    <button
                      onClick={() =>
                        copyToClipboard(tabletUrl.replace(/\/$/, '') + '/display', 'local')
                      }
                      className="flex-shrink-0 text-green-600 hover:text-green-700 p-2"
                    >
                      {copiedCode === 'local' ? (
                        <Check className="h-4 w-4" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </Card>

          {/* Background */}
          <Card>
            <div className="space-y-3">
              <h3 className="font-semibold text-sm text-gray-700">Background</h3>
              <div className="grid grid-cols-5 gap-2">
                {GRADIENT_PRESETS.map((preset, idx) => (
                  <button
                    key={idx}
                    title={preset.name}
                    onClick={() => updateSetting('gradientPreset', idx)}
                    className={`h-10 rounded-lg transition-all ${
                      current.gradientPreset === idx
                        ? 'ring-2 ring-white ring-offset-2 ring-offset-gray-100 scale-105'
                        : 'hover:scale-105'
                    }`}
                    style={{
                      background: `linear-gradient(135deg, ${preset.colors[0]}, ${preset.colors[1]}, ${preset.colors[2]})`,
                      animation: 'ambiance-gradient 4s ease infinite',
                      backgroundSize: '200% 200%'
                    }}
                  />
                ))}
              </div>
              <p className="text-xs text-gray-400">
                Selected: {currentGradient.name}
              </p>
            </div>
          </Card>

          {/* Font */}
          <Card>
            <div className="space-y-3">
              <h3 className="font-semibold text-sm text-gray-700">Font</h3>
              <div className="grid grid-cols-3 gap-2">
                {FONT_OPTIONS.map((font) => (
                  <button
                    key={font}
                    onClick={() => updateSetting('fontFamily', font)}
                    className={`px-3 py-2 text-sm rounded-lg border-2 transition-all truncate ${
                      current.fontFamily === font
                        ? 'border-orange-500 bg-orange-50 text-orange-700 ring-1 ring-orange-300'
                        : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                    }`}
                    style={{ fontFamily: font }}
                  >
                    {font}
                  </button>
                ))}
              </div>
            </div>
          </Card>

          {/* Text Color */}
          <Card>
            <div className="space-y-3">
              <h3 className="font-semibold text-sm text-gray-700">Text Color</h3>
              <div className="flex flex-wrap gap-2">
                {TEXT_COLOR_OPTIONS.map(({ color, label }) => (
                  <button
                    key={color}
                    title={label}
                    onClick={() => updateSetting('textColor', color)}
                    className={`w-9 h-9 rounded-full border-2 transition-all ${
                      current.textColor === color
                        ? 'scale-110 ring-2 ring-offset-1 ring-gray-400 border-gray-600'
                        : 'border-gray-300 hover:scale-105'
                    }`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>
          </Card>

          {/* Accent Color */}
          <Card>
            <div className="space-y-3">
              <h3 className="font-semibold text-sm text-gray-700">Accent Color</h3>
              <div className="flex flex-wrap gap-2">
                {ACCENT_COLOR_OPTIONS.map(({ color, label }) => (
                  <button
                    key={color}
                    title={label}
                    onClick={() => updateSetting('accentColor', color)}
                    className={`w-9 h-9 rounded-full border-2 transition-all ${
                      current.accentColor === color
                        ? 'scale-110 ring-2 ring-offset-1 ring-gray-400 border-gray-800'
                        : 'border-gray-300 hover:scale-105'
                    }`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>
          </Card>

          {/* Text Size */}
          <Card>
            <div className="space-y-3">
              <h3 className="font-semibold text-sm text-gray-700">Text Size</h3>
              <div className="flex gap-2">
                {([
                  { value: 'small' as const, label: 'Small', scale: '0.8x' },
                  { value: 'medium' as const, label: 'Medium', scale: '1.0x' },
                  { value: 'large' as const, label: 'Large', scale: '1.3x' }
                ]).map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => updateSetting('textScale', opt.value)}
                    className={`flex-1 py-2 px-3 text-sm rounded-lg border-2 transition-all font-medium ${
                      current.textScale === opt.value
                        ? 'border-orange-500 bg-orange-50 text-orange-700 ring-1 ring-orange-300'
                        : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    {opt.label} <span className="text-xs text-gray-400">({opt.scale})</span>
                  </button>
                ))}
              </div>
            </div>
          </Card>

          {/* Logo Size */}
          <Card>
            <div className="space-y-3">
              <h3 className="font-semibold text-sm text-gray-700">Logo Size</h3>
              <div className="flex gap-2">
                {[
                  { label: '1x', value: 1 },
                  { label: '2x', value: 2 },
                  { label: '3x', value: 3 }
                ].map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => updateSetting('logoScale', opt.value)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium ${
                      current.logoScale === opt.value
                        ? 'bg-orange-500 text-white'
                        : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </Card>

          {/* Show Restaurant Name */}
          <Card>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-sm text-gray-700">Show Restaurant Name</h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  Display the restaurant name on the welcome screen (logo still shows)
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={current.showName}
                  onChange={(e) => updateSetting('showName', e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-orange-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-500" />
              </label>
            </div>
          </Card>

          {/* Active Panels */}
          <Card>
            <div className="space-y-3">
              <div>
                <h3 className="font-semibold text-sm text-gray-700">Active Panels</h3>
                <p className="text-xs text-gray-400 mt-0.5">Choose which panels show on the TV. Disabled panels are skipped.</p>
              </div>
              <div className="space-y-2">
                {PANEL_OPTIONS.map((panel) => (
                  <label key={panel.key} className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={current.panelToggles[panel.key] ?? true}
                      onChange={(e) => {
                        const updated = { ...current.panelToggles, [panel.key]: e.target.checked }
                        updateSetting('panelToggles', updated)
                      }}
                      className="w-4 h-4 rounded border-gray-300 text-orange-500 focus:ring-orange-500"
                    />
                    <span className="text-sm text-gray-700">{panel.label}</span>
                  </label>
                ))}
              </div>
            </div>
          </Card>

          {/* Welcome Message */}
          <Card>
            <div className="space-y-3">
              <h3 className="font-semibold text-sm text-gray-700">Welcome Message</h3>
              <div className="flex gap-2">
                <button
                  onClick={() => updateSetting('welcomeMode', 'animated')}
                  className={`px-3 py-1.5 text-sm rounded-lg font-medium ${
                    current.welcomeMode === 'animated'
                      ? 'bg-orange-100 text-orange-700'
                      : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  Animated (3 languages)
                </button>
                <button
                  onClick={() => updateSetting('welcomeMode', 'static')}
                  className={`px-3 py-1.5 text-sm rounded-lg font-medium ${
                    current.welcomeMode === 'static'
                      ? 'bg-orange-100 text-orange-700'
                      : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  Custom Text
                </button>
              </div>
              <Input
                placeholder="Custom welcome text..."
                value={current.welcomeText}
                onChange={(e) => updateSetting('welcomeText', e.target.value)}
              />
              <p className="text-xs text-gray-400">
                If &quot;Animated&quot; is selected, welcome cycles through English, French, and Arabic automatically
              </p>
            </div>
          </Card>

          {/* YouTube Music */}
          <Card>
            <div className="space-y-3">
              <h3 className="font-semibold text-sm text-gray-700">Background Music (YouTube)</h3>
              <p className="text-xs text-gray-400">
                Paste a YouTube video or playlist URL. Audio plays in the background on the display.
              </p>
              <div className="flex gap-2">
                <Input
                  className="flex-1"
                  placeholder="https://www.youtube.com/watch?v=... or playlist URL"
                  value={current.youtubeUrl}
                  onChange={(e) => {
                    // Update local state immediately without saving
                    setSettings((prev) => ({
                      ...prev,
                      [activeProfile]: { ...current, youtubeUrl: e.target.value }
                    }))
                  }}
                />
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => updateSetting('youtubeUrl', current.youtubeUrl)}
                >
                  Save
                </Button>
                {current.youtubeUrl && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => updateSetting('youtubeUrl', '')}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          </Card>

          {/* Slideshow Images */}
          <Card>
            <div className="space-y-3">
              <h3 className="font-semibold text-sm text-gray-700">
                <Image className="h-4 w-4 inline mr-1" />
                Slideshow Images
              </h3>
              <p className="text-xs text-gray-400">Upload food photos, restaurant images, etc. Max 10 images.</p>
              <Button
                variant="secondary"
                size="sm"
                disabled={current.images.length >= 10}
                onClick={async () => {
                  const paths = await window.api.tablet.uploadDisplayImages()
                  if (paths) {
                    setSettings((prev) => ({
                      ...prev,
                      [activeProfile]: { ...current, images: paths }
                    }))
                  }
                }}
              >
                <Upload className="h-4 w-4" />
                Upload Images {current.images.length > 0 && `(${current.images.length}/10)`}
              </Button>
              {current.images.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-3">
                  {current.images.map((imgPath, idx) => (
                    <div key={idx} className="relative group">
                      <div className="w-20 h-20 rounded-lg border border-gray-200 overflow-hidden bg-gray-100">
                        <img
                          src={'file:///' + imgPath.replace(/\\/g, '/')}
                          alt=""
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            ;(e.target as HTMLImageElement).style.display = 'none'
                          }}
                        />
                      </div>
                      <button
                        onClick={async () => {
                          const updated = await window.api.tablet.removeDisplayImage(imgPath)
                          setSettings((prev) => ({
                            ...prev,
                            [activeProfile]: { ...current, images: updated || [] }
                          }))
                        }}
                        className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* RIGHT COLUMN - Live Preview (40%) */}
        <div className="w-[40%]">
          <div className="sticky top-4">
            <h4 className="text-sm font-medium text-gray-500 mb-2 uppercase tracking-wide">
              Live Preview
            </h4>
            <div
              className="rounded-xl overflow-hidden shadow-2xl border border-gray-700"
              style={{
                aspectRatio: '16/9',
                background: `linear-gradient(135deg, ${currentGradient.colors[0]}, ${currentGradient.colors[1]}, ${currentGradient.colors[2]})`,
                backgroundSize: '200% 200%',
                animation: 'ambiance-gradient 6s ease infinite',
                position: 'relative'
              }}
            >
              <div
                className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center"
                style={{
                  transform: `scale(${
                    current.textScale === 'small'
                      ? 0.8
                      : current.textScale === 'large'
                        ? 1.3
                        : 1.0
                  })`,
                  transformOrigin: 'center center'
                }}
              >
                {/* Restaurant name */}
                {current.showName && (
                  <div
                    className="text-2xl font-bold mb-2 drop-shadow-lg"
                    style={{ fontFamily: current.fontFamily, color: current.textColor }}
                  >
                    {restaurantName || 'Restaurant Name'}
                  </div>
                )}
                {/* Welcome text */}
                <div
                  className="text-base font-medium drop-shadow-md"
                  style={{ fontFamily: current.fontFamily, color: current.accentColor }}
                >
                  {current.welcomeMode === 'static' && current.welcomeText
                    ? current.welcomeText
                    : 'Welcome'}
                </div>
                {/* Menu indicator */}
                {current.showMenu && (
                  <div
                    className="mt-3 text-xs px-3 py-1 rounded-full border"
                    style={{
                      color: current.textColor,
                      borderColor: current.textColor + '33',
                      backgroundColor: current.textColor + '0a'
                    }}
                  >
                    Menu Panel Active
                  </div>
                )}
                {/* Thumbnail strip */}
                {current.images.length > 0 && (
                  <div className="flex gap-1 mt-4">
                    {current.images.slice(0, 4).map((imgPath, idx) => (
                      <div key={idx} className="w-10 h-10 rounded overflow-hidden opacity-70">
                        <img
                          src={'file:///' + imgPath.replace(/\\/g, '/')}
                          alt=""
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            ;(e.target as HTMLImageElement).style.display = 'none'
                          }}
                        />
                      </div>
                    ))}
                    {current.images.length > 4 && (
                      <div
                        className="w-10 h-10 rounded bg-black/30 flex items-center justify-center text-xs"
                        style={{ color: current.textColor }}
                      >
                        +{current.images.length - 4}
                      </div>
                    )}
                  </div>
                )}
              </div>
              {/* Subtle shimmer overlay */}
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  background:
                    'linear-gradient(135deg, transparent 40%, rgba(255,255,255,0.03) 50%, transparent 60%)',
                  backgroundSize: '200% 200%',
                  animation: 'ambiance-gradient 3s ease infinite'
                }}
              />
            </div>
            <p className="text-xs text-gray-400 mt-2 text-center">
              Preview updates as you change settings
            </p>

            {/* Profile info below preview */}
            <div className="mt-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
              <p className="text-xs text-gray-500">
                Profile: <span className="font-medium text-gray-700">{getDisplayLabel(activeProfile)}</span>
              </p>
              {current.tvUrl && (
                <p className="text-xs text-gray-400 mt-1 truncate" title={current.tvUrl}>
                  URL: <span className="font-mono">{current.tvUrl}</span>
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Add Display Profile Modal */}
      {newProfileModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Add Display Profile</h3>
              <button
                onClick={() => {
                  setNewProfileModal(false)
                  setNewProfileName('')
                }}
                className="p-1 text-gray-400 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="text-sm text-gray-500 mb-4">
              Create a separate TV display with its own settings and short code.
            </p>
            <Input
              placeholder='Profile name (e.g. "Terrace TV")'
              value={newProfileName}
              onChange={(e) => setNewProfileName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAddProfile()
              }}
            />
            <div className="flex justify-end gap-2 mt-4">
              <Button
                variant="secondary"
                onClick={() => {
                  setNewProfileModal(false)
                  setNewProfileName('')
                }}
              >
                Cancel
              </Button>
              <Button
                disabled={!newProfileName.trim() || creatingProfile}
                onClick={handleAddProfile}
              >
                {creatingProfile ? 'Creating...' : 'Create'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
