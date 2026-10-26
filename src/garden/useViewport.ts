import { useEffect, useState } from 'react'
import { pixelGrid } from '../grove'

/** The view a garden is drawn for, in world px: the screen scales to fit it, within limits. */
export interface Frame {
  width: number
  height: number
  minScale: number
  maxScale: number
}

export interface Viewport {
  width: number
  height: number
  dpr: number
  /** CSS px per world px. */
  scale: number
  /** One icon pixel / dither cell, in CSS px. */
  pixel: number
}

/** The plant fills the viewport, scaled to fit the frame it's drawn for. */
export function useViewport(frame: Frame) {
  const [viewport, setViewport] = useState(() => measure(frame))
  useEffect(() => {
    const update = () => setViewport(measure(frame))
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [frame])
  return viewport
}

/** True on a screen too narrow for the plant to spread sideways: Tailwind's `sm` and below. */
export function useNarrow() {
  const [narrow, setNarrow] = useState(() => matchMedia(NARROW).matches)
  useEffect(() => {
    const query = matchMedia(NARROW)
    const update = () => setNarrow(query.matches)
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])
  return narrow
}

const NARROW = '(max-width: 639px)'

function measure(frame: Frame): Viewport {
  const width = window.innerWidth
  const height = window.innerHeight
  const dpr = Math.min(window.devicePixelRatio || 1, 3)
  const scale = Math.min(frame.maxScale, Math.max(frame.minScale, Math.min(width / frame.width, height / frame.height)))
  return { width, height, dpr, scale, pixel: pixelGrid(scale, dpr).css }
}
