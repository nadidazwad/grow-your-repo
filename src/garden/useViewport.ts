import { useEffect, useState } from 'react'
import { pixelGrid } from '../grove'

/** The view the garden is drawn for, in world px: the screen scales to fit it, within limits. */
const FRAME = { width: 1280, height: 800, minScale: 0.6, maxScale: 1.3 }

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
export function useViewport() {
  const [viewport, setViewport] = useState(measure)
  useEffect(() => {
    const update = () => setViewport(measure())
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])
  return viewport
}

function measure(): Viewport {
  const width = window.innerWidth
  const height = window.innerHeight
  const dpr = Math.min(window.devicePixelRatio || 1, 3)
  const scale = Math.min(FRAME.maxScale, Math.max(FRAME.minScale, Math.min(width / FRAME.width, height / FRAME.height)))
  return { width, height, dpr, scale, pixel: pixelGrid(scale, dpr).css }
}
