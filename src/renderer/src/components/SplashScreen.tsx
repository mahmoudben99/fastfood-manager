import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../store/appStore'

interface SplashScreenProps {
  onComplete: () => void
}

const FOOD_EMOJIS = ['🍔', '🍕', '🍟', '🌭', '🥤', '🍗', '🌮', '🥗', '🍱', '🧆', '🥙', '🍜']

/**
 * NOTE: currently unreferenced. The splash the user actually sees is `public/splash.html`,
 * loaded into its own BrowserWindow by src/main/splash.ts. Kept because it still compiles and
 * renders; delete it if the in-renderer splash is never coming back.
 */
export function SplashScreen({ onComplete }: SplashScreenProps) {
  const { t } = useTranslation()
  // Read the fields the store actually exposes. This used to destructure a `settings` object
  // that AppState has never had, so the name always fell back and the logo never rendered.
  const storeName = useAppStore((s) => s.restaurantName)
  const [stage, setStage] = useState(0) // 0: emoji scatter, 1: logo/name, 2: welcome text, 3: fade out
  const [logoSrc, setLogoSrc] = useState<string | null>(null)
  // Positions are picked once: re-rolling Math.random() on every stage change made the emoji jump.
  const [spots] = useState(() =>
    FOOD_EMOJIS.map(() => ({ x: 20 + Math.random() * 60, y: 20 + Math.random() * 60 }))
  )

  const restaurantName = storeName || 'Fast Food Manager'

  useEffect(() => {
    // The logo is stored in the database (survives restore / new PC); a saved file path may not exist here.
    window.api.settings
      .getLogoDataUrl()
      .then((dataUrl) => setLogoSrc(dataUrl || null))
      .catch((error: unknown) => console.warn('[Splash] Logo unavailable:', error))
  }, [])

  useEffect(() => {
    const timers = [
      setTimeout(() => setStage(1), 800),   // Show logo after emoji scatter
      setTimeout(() => setStage(2), 2000),  // Show welcome text
      setTimeout(() => setStage(3), 3500),  // Start fade out
      setTimeout(() => onComplete(), 4200)   // Complete
    ]
    return () => timers.forEach(clearTimeout)
  }, [onComplete])

  if (stage === 3) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ember overflow-hidden">
      {/* v4: static warm glow instead of blurred animated blobs (blur is too heavy for weak PCs) */}
      <div className="absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_40%,color-mix(in_srgb,var(--accent)_35%,transparent),transparent_70%)]" />

      {/* Floating food emojis - scatter animation (random spots, so physical left/top is fine) */}
      {FOOD_EMOJIS.map((emoji, i) => (
        <div
          key={i}
          aria-hidden
          className="absolute text-4xl splash-scatter opacity-0"
          style={{
            left: `${spots[i].x}%`,
            top: `${spots[i].y}%`,
            animationDelay: `${i * 0.08}s`,
            animationDuration: '0.6s'
          }}
        >
          {emoji}
        </div>
      ))}

      {/* Main content window - 3:2 ratio with rounded corners */}
      <div className="relative z-10 flex h-[400px] w-[600px] max-w-[92vw] flex-col items-center justify-center rounded-3xl border border-on-primary/20 bg-primary-press/40 p-8 text-on-primary shadow-e4">

        {/* Logo or Restaurant Name */}
        {stage >= 1 && (
          <div className="splash-pop-in mb-6">
            {logoSrc ? (
              <img src={logoSrc} alt="Logo" className="h-32 w-32 object-contain" />
            ) : (
              <div className="text-6xl font-black tracking-tight rtl:tracking-normal">
                <bdi>{restaurantName}</bdi>
              </div>
            )}
          </div>
        )}

        {/* App Name */}
        {stage >= 1 && (
          <div className="splash-slide-up-fade mb-8">
            <h1 className="text-3xl font-bold tracking-wide rtl:tracking-normal">
              <bdi>Fast Food Manager</bdi>
            </h1>
          </div>
        )}

        {/* Welcome Text */}
        {stage >= 2 && (
          <div className="splash-fade-in-up text-center">
            <p className="text-2xl font-semibold opacity-90">{t('ui.splash.welcome')}</p>
            <p className="mt-1 text-3xl font-bold">
              <bdi>{restaurantName}</bdi>
            </p>
          </div>
        )}

        {/* Loading dots */}
        {stage < 3 && (
          <div className="absolute inset-x-0 bottom-8 flex justify-center gap-2" aria-hidden>
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-2 w-2 rounded-full bg-on-primary animate-pulse-soft"
                style={{ animationDelay: `${i * 0.2}s` }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Splash-local keyframes, prefixed so they never override the kit's animate-* utilities. */}
      <style>{`
        @keyframes splash-scatter {
          0% { opacity: 0; transform: scale(0) rotate(0deg); }
          50% { opacity: 1; transform: scale(1.2) rotate(180deg); }
          100% { opacity: 0.3; transform: scale(0.8) rotate(360deg); }
        }
        @keyframes splash-pop-in {
          0% { opacity: 0; transform: scale(0.3); }
          50% { transform: scale(1.1); }
          100% { opacity: 1; transform: scale(1); }
        }
        @keyframes splash-slide-up-fade {
          0% { opacity: 0; transform: translateY(30px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes splash-fade-in-up {
          0% { opacity: 0; transform: translateY(20px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        .splash-scatter { animation: splash-scatter forwards; }
        .splash-pop-in { animation: splash-pop-in 0.6s ease-out forwards; }
        .splash-slide-up-fade { animation: splash-slide-up-fade 0.6s ease-out 0.3s forwards; opacity: 0; }
        .splash-fade-in-up { animation: splash-fade-in-up 0.8s ease-out 0.5s forwards; opacity: 0; }
      `}</style>
    </div>
  )
}
