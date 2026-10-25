/** A repo on GitHub and somewhere in it, as pasted or as this site's own address. */
export interface RepoLink {
  owner: string
  repo: string
  /** The branch, tag or commit; the repo's default branch when missing. */
  ref?: string
  /** A folder or file in the repo, without slashes at either end; empty for the root. */
  path: string
}

const OWNER = /^[a-z0-9](?:[a-z0-9-]{0,38})$/i
const REPO = /^[\w.-]{1,100}$/
const HOSTS = new Set(['github.com', 'www.github.com'])
/** This site's own links carry the same owner/repo/path, so pasting one works too. */
const OWN_HOSTS = new Set(['grow-your-repo.vercel.app'])

/**
 * Reads the ways people paste a repo: `owner/repo`, `github.com/owner/repo`,
 * with `https://`, `.git`, a `/tree/<ref>/<path>` or `/blob/<ref>/<path>`, an
 * SSH remote, or this site's own address. Null for anything else.
 */
export function parseLink(input: string): RepoLink | null {
  let text = input.trim()
  if (!text) return null
  const ssh = /^git@github\.com:(.+)$/i.exec(text)
  if (ssh) text = `github.com/${ssh[1]}`

  let own = false
  const url = /^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : /^[\w.-]+\.[a-z]{2,}(?::\d+)?\//i.test(text) ? `https://${text}` : null
  let segments: string[]
  let ref: string | undefined
  if (url) {
    let parsed: URL
    try {
      parsed = new URL(url)
    } catch {
      return null
    }
    const host = parsed.hostname.toLowerCase()
    own = OWN_HOSTS.has(host)
    if (!HOSTS.has(host) && !own) return null
    segments = split(parsed.pathname)
    ref = own ? parsed.searchParams.get('ref') ?? undefined : undefined
  } else {
    segments = split(text.replace(/[?#].*$/, ''))
  }

  const [owner, rawRepo, kind, ...rest] = segments.map(decode)
  if (owner === undefined || rawRepo === undefined) return null
  const repo = rawRepo.replace(/\.git$/i, '')
  if (!OWNER.test(owner) || !REPO.test(repo) || repo === '.' || repo === '..') return null

  // On GitHub, what follows the repo is a page of it; only tree and blob pages point into its files.
  if (url && !own) {
    if ((kind === 'tree' || kind === 'blob') && rest.length > 0) return { owner, repo, ref: rest[0], path: rest.slice(1).join('/') }
    return { owner, repo, path: '' }
  }
  return { owner, repo, ...(ref ? { ref } : {}), path: [kind, ...rest].filter((part) => part !== undefined).join('/') }
}

/** This site's address for a link: `/owner/repo/path`, with `?ref=` only when it isn't the default branch. */
export function routeOf({ owner, repo, ref, path }: RepoLink, defaultRef?: string) {
  const query = ref && ref !== defaultRef ? `?ref=${encodeURIComponent(ref)}` : ''
  return `/${[owner, repo, ...split(path)].map(encodeURIComponent).join('/')}${query}`
}

/** The link this site's own address holds, if it holds one. */
export function linkOfRoute(pathname: string, search = '') {
  return parseLink(`https://${[...OWN_HOSTS][0]}${pathname}${search}`)
}

/** Where a folder or file is on GitHub. */
export function githubUrl({ owner, repo, ref, path }: RepoLink & { ref: string }, kind: 'tree' | 'blob' = 'tree') {
  const segments = [...ref.split('/'), ...split(path)].map(encodeURIComponent)
  return `https://github.com/${owner}/${repo}/${kind}/${segments.join('/')}`
}

const split = (path: string) => path.split('/').filter(Boolean)

function decode(segment: string) {
  try {
    return decodeURIComponent(segment)
  } catch {
    return segment
  }
}
