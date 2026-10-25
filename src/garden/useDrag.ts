import { useRef, type MouseEvent, type PointerEvent } from 'react'
import type { Grove } from '../grove'
import { sound } from '../sound'

// A press only becomes a drag once it has moved this far, so clicks still land. A fingertip wobbles more than a mouse.
const THRESHOLD = { mouse: 4, touch: 10 }
// Velocity older than this when the pointer lifts means it had stopped: no glide.
const STALE_MS = 80
// World px/s a throw needs before it's heard.
const FLUNG = 1200

/** Drag the view from anywhere, folders and files included, and let go to glide. */
export function useDrag(grove: Grove, scale: number) {
  const press = useRef<{
    id: number
    x: number
    y: number
    slop: number
    dragging: boolean
    vx: number
    vy: number
    at: number
  } | null>(null)
  const dragged = useRef(false)

  const onPointerDown = (event: PointerEvent<HTMLElement>) => {
    if (event.button !== 0) return
    press.current = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      slop: event.pointerType === 'touch' ? THRESHOLD.touch : THRESHOLD.mouse,
      dragging: false,
      vx: 0,
      vy: 0,
      at: event.timeStamp,
    }
    dragged.current = false
  }

  const onPointerMove = (event: PointerEvent<HTMLElement>) => {
    const p = press.current
    if (!p || p.id !== event.pointerId) return
    const dx = event.clientX - p.x
    const dy = event.clientY - p.y
    if (!p.dragging) {
      // Until the plant outgrows the view there is nowhere to drag to.
      if (!grove.canPan || Math.hypot(dx, dy) < p.slop) return
      // Capturing reroutes the eventual click to the garden, so the folder under the press doesn't open.
      event.currentTarget.setPointerCapture(event.pointerId)
      event.currentTarget.dataset.dragging = ''
      p.dragging = true
      dragged.current = true
    }
    grove.pan(-dx / scale, -dy / scale)
    const dt = Math.max(1, event.timeStamp - p.at)
    // Smoothed, in world px per second.
    p.vx = p.vx * 0.6 + ((-dx / scale) * 1000 / dt) * 0.4
    p.vy = p.vy * 0.6 + ((-dy / scale) * 1000 / dt) * 0.4
    p.x = event.clientX
    p.y = event.clientY
    p.at = event.timeStamp
  }

  const onPointerUp = (event: PointerEvent<HTMLElement>) => {
    const p = press.current
    if (!p || p.id !== event.pointerId) return
    press.current = null
    delete event.currentTarget.dataset.dragging
    if (p.dragging && event.timeStamp - p.at < STALE_MS) {
      grove.fling(p.vx, p.vy)
      // A real throw is heard as air, louder the harder it went, on the side the plant moved toward.
      const speed = Math.hypot(p.vx, p.vy)
      if (grove.canPan && speed > FLUNG) sound.play('fling', { gain: Math.min(1, speed / 4000), pan: (-p.vx / speed) * 0.5 })
    }
  }

  // Belt and braces for browsers that still deliver the click to the button.
  const onClickCapture = (event: MouseEvent<HTMLElement>) => {
    if (!dragged.current) return
    dragged.current = false
    event.stopPropagation()
    event.preventDefault()
  }

  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp, onClickCapture }
}
