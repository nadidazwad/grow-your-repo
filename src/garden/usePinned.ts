import { useLayoutEffect, useRef } from 'react'
import type { Grove, Vec2 } from '../grove'
import { toScreen, type View } from './view.ts'

/** Pins an element's top-left corner to a world point, moving it in the same frame as the plant. */
export function usePinned<E extends HTMLElement>(grove: Grove<unknown>, view: View, [x, y]: Vec2) {
  const ref = useRef<E>(null)
  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return
    const place = () => {
      const [left, top] = toScreen(grove, view, [x, y])
      element.style.transform = `translate3d(${left}px, ${top}px, 0)`
    }
    place()
    return grove.onFrame(place)
  }, [grove, view, x, y])
  return ref
}
