import { Garden } from '../garden'
import { placeRepo } from '../place'
import { savedNames, savedRepo, type SavedName } from './trees'

/** Dev only: a saved repo grown as the real plant, without asking GitHub. `?repo=facebook/react&open=packages/scheduler`. */
export default function Grown() {
  const params = new URLSearchParams(location.search)
  const name = (savedNames.find((saved) => saved === params.get('repo')) ?? 'nadidazwad/garden') as SavedName
  const placed = placeRepo(savedRepo(name))
  const open = params.get('open')
  return (
    <main className="fixed inset-0 overflow-hidden overscroll-none bg-page">
      <Garden tree={placed.tree} ground={placed.shape.ground} exclusive open={open ? placed.idOf(open) : undefined} />
    </main>
  )
}
