import { useEffect } from 'react'
import { Garden, type Entry } from '../garden'
import type { Grove } from '../grove'
import { placeRepo, tall, wide } from '../place'
import { savedNames, savedRepo, type SavedName } from './trees'

/** Dev only: a saved repo grown as the real plant, without asking GitHub. `?repo=facebook/react&open=packages/scheduler`. */
export default function Grown() {
  const params = new URLSearchParams(location.search)
  const name = (savedNames.find((saved) => saved === params.get('repo')) ?? 'nadidazwad/garden') as SavedName
  const shape = params.get('shape') === 'tall' ? tall : wide
  const placed = placeRepo(savedRepo(name), shape)
  const open = params.get('open')
  return (
    <main className="fixed inset-0 overflow-hidden overscroll-none bg-page">
      <Garden tree={placed.tree} ground={shape.ground} frame={shape.frame} fitWidth={shape.fitWidth} headroom={shape.headroom} exclusive foldAway={shape.foldAway}>
        {(grove) => <Opener grove={grove} id={open ? placed.idOf(open) : null} />}
      </Garden>
    </main>
  )
}

/** Opens a path once the plant is up, as a link would. */
function Opener({ grove, id }: { grove: Grove<Entry>; id: string | null }) {
  useEffect(() => {
    if (id) grove.go(id)
  }, [grove, id])
  return null
}
