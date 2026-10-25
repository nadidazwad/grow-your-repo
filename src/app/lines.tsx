import type { ReactNode } from 'react'
import type { Failure, Repo } from '../repo'

// The line of words standing above the name on the ground, for each moment: grey, with what matters in ink.

const Ink = ({ children }: { children: ReactNode }) => <span className="text-ink">{children}</span>

const AT = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })

export function Welcome({ examples, onPick }: { examples: string[]; onPick: (name: string) => void }) {
  return (
    <>
      Paste a public GitHub repo and watch its files grow. Try{' '}
      {examples.map((example, i) => (
        <span key={example}>
          <button
            type="button"
            onClick={() => onPick(example)}
            className="line-draw inline cursor-pointer text-ink outline-none hover:text-accent hover:line-drawn focus-visible:text-accent focus-visible:line-drawn"
          >
            {example}
          </button>
          {i < examples.length - 2 ? ', ' : i === examples.length - 2 ? ' or ' : '.'}
        </span>
      ))}
    </>
  )
}

export function Asking({ name }: { name: string }) {
  return (
    <>
      Asking GitHub for <Ink>{name}</Ink>…
    </>
  )
}

export function Failed({ name, failure }: { name: string; failure: Failure }) {
  switch (failure.reason) {
    case 'missing':
      return (
        <>
          GitHub has no public repo called <Ink>{name}</Ink>. It may be private, or spelled another way.
        </>
      )
    case 'no-ref':
      return (
        <>
          <Ink>{name}</Ink> has no branch or tag called <Ink>{failure.ref}</Ink>.
        </>
      )
    case 'empty':
      return (
        <>
          <Ink>{name}</Ink> is empty, so there’s nothing to grow yet.
        </>
      )
    case 'rate-limited':
      return (
        <>
          GitHub lets each visitor ask 60 times an hour, and this hour’s are used up. Try again at <Ink>{AT.format(failure.resetsAt)}</Ink>.
        </>
      )
    case 'offline':
      return <>Couldn’t reach GitHub. Check your connection, then press Enter to try again.</>
    case 'failed':
      return <>GitHub didn’t answer{failure.status ? ` (${failure.status})` : ''}. Press Enter to try again in a moment.</>
  }
}

export function About({ repo }: { repo: Repo }) {
  return (
    <>
      {repo.description || 'Open a folder to grow it. A file opens on GitHub.'}
      {repo.truncated && <> GitHub sent only part of this tree: it’s too big to send whole.</>}
    </>
  )
}

export function Unread() {
  return (
    <>
      That isn’t a GitHub repo. Type <Ink>owner/repo</Ink>, or paste its link.
    </>
  )
}
