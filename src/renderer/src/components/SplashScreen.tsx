import { useState, useEffect } from 'react'
import { useAppStore } from '../store/appStore'

interface SplashScreenProps {
  onComplete: () => void
}

export function SplashScreen({ onComplete }: SplashScreenProps) {
  const { settings } = useAppStore()
  const [stage, setStage] = useState(0) // 0: emoji scatter, 1: logo/name, 2: welcome text, 3: fade out

  const restaurantName = settings.restaurant_name || 'My Restaurant'
  const logoPath = settings.logo_path

  const foodEmojis = ['🍔', '🍕', '🍟', '🌭', '🥤', '🍗', '🌮', '🥗', '🍱', '🧆', '🥙', '🍜']

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gradient-to-br from-orange-600 via-orange-500 to-amber-500 overflow-hidden">
      {/* Animated background elements */}
      <div className="absolute inset-0 opacity-20">
        <div className="absolute top-10 left-10 w-32 h-32 bg-white rounded-full blur-3xl animate-blob" />
        <div className="absolute top-20 right-20 w-40 h-40 bg-yellow-200 rounded-full blur-3xl animate-blob animation-delay-2000" />
        <div className="absolute bottom-20 left-1/3 w-36 h-36 bg-orange-300 rounded-full blur-3xl animate-blob animation-delay-4000" />
      </div>

      {/* Floating food emojis - scatter animation */}
      {stage >= 0 && foodEmojis.map((emoji, i) => (
        <div
          key={i}
          className="absolute text-4xl animate-scatter opacity-0"
          style={{
            left: `${20 + Math.random() * 60}%`,
            top: `${20 + Math.random() * 60}%`,
            animationDelay: `${i * 0.08}s`,
            animationDuration: '0.6s'
          }}
        >
          {emoji}
        </div>
      ))}

      {/* Main content window - 3:2 ratio with rounded corners */}
      <div className="relative w-[600px] h-[400px] bg-white/10 backdrop-blur-md rounded-3xl shadow-2xl border-2 border-white/20 flex flex-col items-center justify-center p-8 z-10">

        {/* Logo or Restaurant Name */}
        {stage >= 1 && (
          <div className="animate-pop-in mb-6">
            {logoPath ? (
              <img
                src={`app-image://${logoPath}`}
                alt="Logo"
                className="w-32 h-32 object-contain drop-shadow-2xl"
              />
            ) : (
              <div className="text-6xl font-black text-white drop-shadow-2xl tracking-tight">
                {restaurantName}
              </div>
            )}
          </div>
        )}

        {/* App Name */}
        {stage >= 1 && (
          <div className="animate-slide-up-fade mb-8">
            <h1 className="text-3xl font-bold text-white drop-shadow-lg tracking-wide">
              Fast Food Manager
            </h1>
          </div>
        )}

        {/* Welcome Text */}
        {stage >= 2 && (
          <div className="animate-fade-in-up text-center">
            <p className="text-2xl font-semibold text-white/90 drop-shadow-md">
              Welcome to
            </p>
            <p className="text-3xl font-bold text-white drop-shadow-lg mt-1">
              {restaurantName}
            </p>
          </div>
        )}

        {/* Loading dots */}
        {stage < 3 && (
          <div className="absolute bottom-8 flex gap-2">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="w-2 h-2 bg-white rounded-full animate-pulse"
                style={{ animationDelay: `${i * 0.2}s` }}
              />
            ))}
          </div>
        )}
      </div>

      <style>{`
        @keyframes scatter {
          0% {
            opacity: 0;
            transform: scale(0) rotate(0deg);
          }
          50% {
            opacity: 1;
            transform: scale(1.2) rotate(180deg);
          }
          100% {
            opacity: 0.3;
            transform: scale(0.8) rotate(360deg);
          }
        }

        @keyframes pop-in {
          0% {
            opacity: 0;
            transform: scale(0.3);
          }
          50% {
            transform: scale(1.1);
          }
          100% {
            opacity: 1;
            transform: scale(1);
          }
        }

        @keyframes slide-up-fade {
          0% {
            opacity: 0;
            transform: translateY(30px);
          }
          100% {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes fade-in-up {
          0% {
            opacity: 0;
            transform: translateY(20px);
          }
          100% {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes blob {
          0%, 100% {
            transform: translate(0, 0) scale(1);
          }
          33% {
            transform: translate(30px, -50px) scale(1.1);
          }
          66% {
            transform: translate(-20px, 20px) scale(0.9);
          }
        }

        .animate-scatter {
          animation: scatter forwards;
        }

        .animate-pop-in {
          animation: pop-in 0.6s ease-out forwards;
        }

        .animate-slide-up-fade {
          animation: slide-up-fade 0.6s ease-out 0.3s forwards;
          opacity: 0;
        }

        .animate-fade-in-up {
          animation: fade-in-up 0.8s ease-out 0.5s forwards;
          opacity: 0;
        }

        .animate-blob {
          animation: blob 7s infinite;
        }

        .animation-delay-2000 {
          animation-delay: 2s;
        }

        .animation-delay-4000 {
          animation-delay: 4s;
        }
      `}</style>
    </div>
  )
}
