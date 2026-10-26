import { lazy, Suspense, useCallback, useEffect, useMemo, useState, useSyncExternalStore, type CSSProperties, type ReactNode, type WheelEvent } from 'react'
import { createGrove, type Bounds, type FolderSpec, type Grove, type GroveBranch, type GroveNode } from '../grove'
import { sound } from '../sound'
import type { Entry } from './entry.ts'
import { labelArea } from './labels.ts'
import { Nodes } from './Nodes.tsx'
import { usePlantSounds } from './sounds.ts'
import { useDrag } from './useDrag.ts'
import { useViewport, type Frame } from './useViewport.ts'
import type { View } from './view.ts'

// three.js is ~1 MB; the page paints first and the plant grows once it arrives.
const Scene = lazy(() => import('../scene/Scene.tsx'))

interface Props {
  /** The tree with everything placed: world px, y down. Read once: key the garden by repo so a new one grows afresh. */
  tree: FolderSpec<Entry>
  /** World y of the ground the plant stands on. */
  ground: number
  /** The view it's drawn for: the screen scales to fit it. */
  frame: Frame
  /** The plant fits the width of the view, so the view only moves up and down. */
  fitWidth?: boolean
  /** World px the view can rise above the plant. */
  headroom?: number
  /** Opening a folder closes its open siblings, so they can grow into the same room. */
  exclusive?: boolean
  /** World areas where other words sit, such as the name on the ground: twigs stop short of them. */
  keepOut?: Bounds[]
  /** Whatever else lives in the plant's world, given the grove and how it's viewed: the name on the ground, the address bar. */
  children?: (grove: Grove<Entry>, view: View) => ReactNode
}

/** A file tree drawn as a dithered plant, growing in from the left. Folders grow where they are; files open in a new tab. */
export function Garden({ tree, ground, frame, fitWidth, headroom, exclusive = false, keepOut: words = [], children }: Props) {
  const viewport = useViewport(frame)
  const { width, height, scale, dpr } = viewport
  const [grove] = useState(() =>
    createGrove(tree, {
      still: matchMedia('(prefers-reduced-motion: reduce)').matches,
      view: [width / scale, height / scale],
      ground,
      fitWidth,
      headroom,
      exclusive,
    }),
  )
  useSyncExternalStore(grove.subscribe, () => grove.version)
  const [elsewhere] = useState(words)
  const keepOut = useCallback((branch: GroveBranch) => [...wordsNear(grove, branch), ...elsewhere], [grove, elsewhere])
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
      {children?.(grove, view)}
    </div>
  )
}

/** The names that can show while a branch does: its own, and those along the folders it grows out of. */
function wordsNear(grove: Grove<Entry>, branch: GroveBranch) {
  const chain = new Set<string>()
  for (let id: string | null = branch.id; id !== null; id = grove.layout.branches.get(id)?.parent ?? null) chain.add(id)
  return grove.layout.nodes.filter((node) => chain.has(node.parent)).map((node) => labelArea(node))
}
