import { useEffect, useState } from 'react'
import { fetchRepo, RepoError, type Failure, type Repo, type RepoLink } from '../repo'

export type Growing =
  | { status: 'loading'; link: RepoLink }
  | { status: 'ready'; link: RepoLink; repo: Repo }
  | { status: 'failed'; link: RepoLink; failure: Failure }

// Each repo is asked for once a visit: GitHub allows a visitor only 60 requests an hour.
const asked = new Map<string, Promise<Repo>>()
// A link with a ref can only be told apart from its path by asking, so its path is part of what's asked.
const keyOf = (link: RepoLink) => (link.ref === undefined ? `${link.owner}/${link.repo}` : `${link.owner}/${link.repo}@${link.ref}/${link.path}`).toLowerCase()

/** Fetches the linked repo: loading until it's in or has failed; null without a link. */
export function useRepo(link: RepoLink | null): Growing | null {
  const [settled, setSettled] = useState<Growing | null>(null)

  useEffect(() => {
    if (!link) return
    const key = keyOf(link)
    let current = true
    let request = asked.get(key)
    if (!request) {
      request = fetchRepo(link)
      asked.set(key, request)
      // A failure is worth asking again about later: the rate limit lifts, a typo gets fixed.
      request.catch(() => asked.delete(key))
    }
    request.then(
      (fetched) => {
        if (!current) return
        const repo = link.ref === undefined ? { ...fetched, path: link.path } : fetched
        setSettled({ status: 'ready', link, repo })
      },
      (error: unknown) => {
        if (!current) return
        setSettled({ status: 'failed', link, failure: error instanceof RepoError ? error.failure : { reason: 'failed', status: 0 } })
      },
    )
    return () => {
      current = false
    }
  }, [link])

  if (!link) return null
  return settled?.link === link ? settled : { status: 'loading', link }
}
