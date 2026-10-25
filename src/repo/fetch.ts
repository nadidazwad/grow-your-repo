import type { RepoLink } from './link.ts'
import { buildTree, type Folder, type TreeEntry } from './tree.ts'

export interface Repo {
  owner: string
  /** As GitHub spells it, whatever was pasted. */
  name: string
  /** The branch, tag or commit the tree is from. */
  ref: string
  defaultRef: string
  description: string | null
  root: Folder
  /** GitHub only sent part of the tree: it has too many files. */
  truncated: boolean
  /** Where in the repo the link pointed, once its ref was told apart from its path. */
  path: string
}

export type Failure =
  /** Missing, misspelled or private: GitHub answers all three the same. */
  | { reason: 'missing' }
  | { reason: 'no-ref'; ref: string }
  | { reason: 'empty' }
  /** This visitor's hourly allowance of GitHub requests is spent. */
  | { reason: 'rate-limited'; resetsAt: Date }
  | { reason: 'offline' }
  | { reason: 'failed'; status: number }

export class RepoError extends Error {
  readonly failure: Failure
  constructor(failure: Failure) {
    super(failure.reason)
    this.failure = failure
  }
}

const API = 'https://api.github.com'

/**
 * Fetches a public repo's whole file tree straight from GitHub, with no token:
 * the repo, for its default branch, then the tree in one go. Two of the 60
 * requests an hour GitHub allows each visitor; the browser revalidates repeats
 * for free. Throws a `RepoError` saying what went wrong.
 */
export async function fetchRepo(link: RepoLink, { fetch = globalThis.fetch, signal }: { fetch?: typeof globalThis.fetch; signal?: AbortSignal } = {}): Promise<Repo> {
  const get = async (path: string) => {
    let response: Response
    try {
      response = await fetch(`${API}${path}`, { signal, headers: { Accept: 'application/vnd.github+json' } })
    } catch (error) {
      if (signal?.aborted) throw error
      throw new RepoError({ reason: 'offline' })
    }
    const limited = limitOf(response)
    if (limited) throw new RepoError(limited)
    return response
  }

  const repoResponse = await get(`/repos/${encodeURIComponent(link.owner)}/${encodeURIComponent(link.repo)}`)
  if (repoResponse.status === 404) throw new RepoError({ reason: 'missing' })
  if (!repoResponse.ok) throw new RepoError({ reason: 'failed', status: repoResponse.status })
  const about = (await repoResponse.json()) as { name: string; owner: { login: string }; default_branch: string; description: string | null }

  // A pasted /tree/<ref>/<path> can't say where a ref with slashes in it ends, so try it longer a few times.
  const segments = link.path ? link.path.split('/') : []
  let ref = link.ref ?? about.default_branch
  let path = link.path
  for (let tries = 0; ; tries++) {
    const response = await get(`/repos/${about.owner.login}/${about.name}/git/trees/${ref.split('/').map(encodeURIComponent).join('/')}?recursive=1`)
    if (response.status === 409) throw new RepoError({ reason: 'empty' })
    if (response.status === 404 || response.status === 422) {
      if (link.ref && tries < 3 && segments.length > tries) {
        ref = `${ref}/${segments[tries]}`
        path = segments.slice(tries + 1).join('/')
        continue
      }
      throw new RepoError({ reason: 'no-ref', ref: link.ref ?? ref })
    }
    if (!response.ok) throw new RepoError({ reason: 'failed', status: response.status })
    const body = (await response.json()) as { tree: TreeEntry[]; truncated: boolean }
    return {
      owner: about.owner.login,
      name: about.name,
      ref,
      defaultRef: about.default_branch,
      description: about.description,
      root: buildTree(body.tree),
      truncated: body.truncated,
      path,
    }
  }
}

/** GitHub's primary limit says when the hour resets; its secondary one says how long to wait. */
function limitOf(response: Response): Failure | null {
  if (response.status !== 403 && response.status !== 429) return null
  const remaining = response.headers.get('x-ratelimit-remaining')
  const reset = Number(response.headers.get('x-ratelimit-reset'))
  if (remaining === '0' && reset) return { reason: 'rate-limited', resetsAt: new Date(reset * 1000) }
  const wait = Number(response.headers.get('retry-after'))
  if (wait) return { reason: 'rate-limited', resetsAt: new Date(Date.now() + wait * 1000) }
  return null
}
