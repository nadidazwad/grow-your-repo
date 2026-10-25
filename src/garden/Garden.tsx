import { lazy, Suspense, useEffect, useMemo, useState, useSyncExternalStore, type CSSProperties, type WheelEvent } from 'react'
import { createGrove, type FolderSpec, type GroveNode } from '../grove'
import { sound } from '../sound'
import type { Entry } from './entry.ts'
import { labelArea } from './labels.ts'
import { Nodes } from './Nodes.tsx'
import { usePlantSounds } from './sounds.ts'
import { useDrag } from './useDrag.ts'
import { useViewport } from './useViewport.ts'

// three.js is ~1 MB; the page paints first and the plant grows once it arrives.
const Scene = lazy(() => import('../scene/Scene.tsx'))

interface Props {
  /** The tree with everything placed: world px, y down. Read once: key the garden by repo so a new one grows afresh. */
  tree: FolderSpec<Entry>
  /** World y of the ground the plant stands on. */
  ground: number
}

/** A file tree drawn as a dithered plant, growing in from the left. Folders grow where they are; files open in a new tab. */
export function Garden({ tree, ground }: Props) {
  const viewport = useViewport()
  const { width, height, scale, dpr } = viewport
  const [grove] = useState(() =>
    createGrove(tree, {
      still: matchMedia('(prefers-reduced-motion: reduce)').matches,
      view: [width / scale, height / scale],
      ground,
    }),
  )
  useSyncExternalStore(grove.subscribe, () => grove.version)
  const [keepOut] = useState(() => grove.layout.nodes.map((node) => labelArea(node)))
  const view = useMemo(() => ({ width, height, scale, dpr }), [width, height, scale, dpr])
  const drag = useDrag(grove, scale)
  useEffect(() => grove.setView(width / scale, height / scale), [grove, width, height, scale])
  useEffect(() => sound.start(), [])
  usePlantSounds(grove, view)

  const scroll = (event: WheelEvent<HTMLDivElement>) => {
    if (event.ctrlKey) return
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? height : 1
    grove.pan((event.deltaX * unit) / scale, (event.deltaY * unit) / scale)
  }

  const open = (node: GroveNode<Entry>) => {
    if (node.data?.kind !== 'file') return
    sound.play('link')
    window.open(node.data.href, '_blank', 'noopener')
  }

  return (
    <div
      className="fixed inset-0 touch-none overflow-hidden select-none data-dragging:cursor-grabbing data-pannable:cursor-grab"
      data-pannable={grove.canPan ? '' : undefined}
      style={{ '--spacing': `${scale}px`, '--px': `${viewport.pixel}px` } as CSSProperties}
      {...drag}
      onWheel={scroll}
    >
      <div className="pointer-events-none absolute inset-0">
        <Suspense fallback={null}>
          <Scene grove={grove} keepOut={keepOut} scale={scale} dpr={dpr} />
        </Suspense>
      </div>
      <Nodes grove={grove} view={view} label={tree.name} onOpen={open} />
    </div>
  )
}
