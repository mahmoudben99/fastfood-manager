import { useEffect, useRef, useState } from 'react'

function motionAllowed(): boolean {
  if (document.documentElement.classList.contains('perf')) return false
  try {
    return !window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return true
  }
}

/**
 * Animated number for totals/KPIs: eases from the previous value to `target` in `durationMs`.
 * One rAF loop per change; jumps straight to the value in Performance mode / reduced motion.
 * Format the returned value at render time. `enabled=false` returns `target` with no work.
 */
export function useCountUp(target: number, durationMs = 350, enabled = true): number {
  const [value, setValue] = useState(target)
  const fromRef = useRef(target)
  const frame = useRef<number | null>(null)

  useEffect(() => {
    if (frame.current !== null) cancelAnimationFrame(frame.current)
    if (!enabled) {
      fromRef.current = target
      return
    }
    const from = fromRef.current
    if (!motionAllowed() || from === target || !Number.isFinite(target)) {
      fromRef.current = target
      setValue(target)
      return
    }
    const start = performance.now()
    const tick = (now: number): void => {
      const t = Math.min(1, (now - start) / durationMs)
      const eased = 1 - Math.pow(1 - t, 3)
      const next = from + (target - from) * eased
      fromRef.current = next
      setValue(t >= 1 ? target : next)
      if (t < 1) frame.current = requestAnimationFrame(tick)
      else frame.current = null
    }
    frame.current = requestAnimationFrame(tick)
    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current)
    }
  }, [target, durationMs, enabled])

  return enabled ? value : target
}
