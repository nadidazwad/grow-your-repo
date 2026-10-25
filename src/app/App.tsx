import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { Garden, useViewport, type Entry, type View } from '../garden'
import type { Grove } from '../grove'
import { wide, type Placed } from '../place'
import { linkOfRoute, parseLink, routeOf, type Repo, type RepoLink } from '../repo'
import { sameRepo, useAddress } from './address.ts'
import { Masthead } from './Masthead.tsx'
import * as Lines from './lines.tsx'
import { useRepo } from './useRepo.ts'

const EXAMPLES = ['facebook/react', 'vercel/next.js', 'nadidazwad/garden']

/** The page: an empty field standing on the ground until a repo is in, then the repo growing out of it. */
export default function App() {
  const [link, setLink] = useState<RepoLink | null>(() => linkOfRoute(location.pathname, location.search))
  // What was typed when it couldn't be read as a repo.
  const [unread, setUnread] = useState(false)
  const growing = useRepo(link)
  const { width, height, scale, dpr, pixel } = useViewport()

  // Back or Forward onto another repo, or back to the landing; within a repo, the plant follows by itself.
  useEffect(() => {
    const pop = () => {
      const next = linkOfRoute(location.pathname, location.search)
      setLink((now) => (sameRepo(now, next) ? now : next))
    }
    window.addEventListener('popstate', pop)
    return () => window.removeEventListener('popstate', pop)
  }, [])

  useEffect(() => {
    if (!link) document.title = 'grow your repo'
    else if (growing?.status !== 'ready') document.title = `${link.owner}/${link.repo}`
  }, [link, growing?.status])

  const grow = (text: string) => {
    const next = parseLink(text)
    setUnread(!next)
    if (!next) return
    history.pushState(null, '', routeOf(next))
    setLink(next)
  }

  const say = (lines: ReactNode) => (unread ? <Lines.Unread /> : lines)

  if (growing?.status === 'ready') {
    const { repo, placed } = growing
    return (
      <main className="fixed inset-0 overflow-hidden overscroll-none bg-page">
        <Garden key={`${repo.owner}/${repo.name}@${repo.ref}`} tree={placed.tree} ground={placed.shape.ground} exclusive keepOut={[placed.name.line]}>
          {(grove, view) => <Grown grove={grove} view={view} repo={repo} placed={placed} line={say(<Lines.About repo={repo} />)} onGrow={grow} />}
        </Garden>
      </main>
    )
  }

  const name = link ? `${link.owner}/${link.repo}` : ''
  const line = !growing ? (
    <Lines.Welcome examples={EXAMPLES} onPick={grow} />
  ) : growing.status === 'loading' ? (
    <Lines.Asking name={name} />
  ) : (
    <Lines.Failed name={name} failure={growing.failure} />
  )
  return (
    <main className="fixed inset-0 overflow-hidden overscroll-none bg-page" style={{ '--spacing': `${scale}px`, '--px': `${pixel}px` } as CSSProperties}>
      <Masthead key={name} name={name} line={say(line)} onGrow={grow} shape={wide} view={{ width, height, scale, dpr }} />
    </main>
  )
}

/** A grown repo: the address follows the plant, and the name stands on the ground. */
function Grown({ grove, view, repo, placed, line, onGrow }: { grove: Grove<Entry>; view: View; repo: Repo; placed: Placed; line: ReactNode; onGrow: (text: string) => void }) {
  useAddress(grove, placed, repo)
  return <Masthead name={placed.name.text} line={line} onGrow={onGrow} shape={placed.shape} view={view} grove={grove} />
}
