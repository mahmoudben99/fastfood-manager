import { useState, useEffect } from 'react'
import { useAppStore } from '../store/appStore'

interface SplashScreenProps {
  onComplete: () => void
}

export function SplashScreen({ onComplete }: SplashScreenProps) {
  const { settings } = useAppStore()
  const [currentImage, setCurrentImage] = useState(0)
  const [isVisible, setIsVisible] = useState(true)

  // Splash images (user should place these in public/splash/)
  const splashImages = [
    'splash-1.png',
    'splash-2.png',
    'splash-3.png'
  ]

  const restaurantName = settings.restaurant_name || 'Fast Food Manager'
  const displayDuration = 2500 // 2.5 seconds per image

  useEffect(() => {
    // Show each image for displayDuration
    if (currentImage < splashImages.length) {
      const timer = setTimeout(() => {
        setCurrentImage(currentImage + 1)
      }, displayDuration)

      return () => clearTimeout(timer)
    } else {
      // All images shown, fade out and complete
      const fadeTimer = setTimeout(() => {
        setIsVisible(false)
        setTimeout(onComplete, 500) // Wait for fade out animation
      }, 500)

      return () => clearTimeout(fadeTimer)
    }
  }, [currentImage, onComplete])

  if (!isVisible) return null

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-gradient-to-br from-orange-500 to-orange-600 transition-opacity duration-500 ${
        currentImage >= splashImages.length ? 'opacity-0' : 'opacity-100'
      }`}
    >
      <div className="text-center">
        {/* Welcome text */}
        <div className="mb-8 animate-fade-in">
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-2 drop-shadow-lg">
            Welcome to
          </h1>
          <h2 className="text-5xl md:text-6xl font-bold text-white drop-shadow-lg">
            {restaurantName}
          </h2>
        </div>

        {/* Splash image */}
        {currentImage < splashImages.length && (
          <div className="relative w-96 h-64 mx-auto mb-8 overflow-hidden rounded-2xl shadow-2xl animate-scale-in">
            <img
              src={`app-image://splash/${splashImages[currentImage]}`}
              alt={`Splash ${currentImage + 1}`}
              className="w-full h-full object-cover"
              onError={(e) => {
                // Fallback to placeholder if image not found
                e.currentTarget.style.display = 'none'
              }}
            />
            {/* Fallback placeholder */}
            <div className="absolute inset-0 flex items-center justify-center bg-orange-400 bg-opacity-20 backdrop-blur-sm">
              <div className="text-white text-6xl">🍔</div>
            </div>
          </div>
        )}

        {/* Loading indicator */}
        <div className="flex justify-center gap-2">
          {splashImages.map((_, index) => (
            <div
              key={index}
              className={`w-2 h-2 rounded-full transition-all duration-300 ${
                index === currentImage
                  ? 'bg-white w-8'
                  : index < currentImage
                  ? 'bg-white bg-opacity-50'
                  : 'bg-white bg-opacity-30'
              }`}
            />
          ))}
        </div>
      </div>

      <style>{`
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(-20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes scale-in {
          from { opacity: 0; transform: scale(0.8); }
          to { opacity: 1; transform: scale(1); }
        }
        .animate-fade-in {
          animation: fade-in 0.8s ease-out;
        }
        .animate-scale-in {
          animation: scale-in 0.6s ease-out;
        }
      `}</style>
    </div>
  )
}
