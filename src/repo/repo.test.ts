import { describe, expect, it } from 'vitest'
import { fetchRepo, githubUrl, parseLink, RepoError, routeOf, linkOfRoute, type Failure } from '.'
import about from './fixtures/garden-repo.json'
import tree from './fixtures/garden-tree.json'

describe('parseLink', () => {
  it.each([
    ['facebook/react', { owner: 'facebook', repo: 'react', path: '' }],
    [' facebook/react/ ', { owner: 'facebook', repo: 'react', path: '' }],
    ['github.com/facebook/react', { owner: 'facebook', repo: 'react', path: '' }],
    ['https://www.github.com/facebook/react.git', { owner: 'facebook', repo: 'react', path: '' }],
    ['git@github.com:facebook/react.git', { owner: 'facebook', repo: 'react', path: '' }],
    ['https://github.com/facebook/react?tab=readme-ov-file#readme', { owner: 'facebook', repo: 'react', path: '' }],
    ['https://github.com/facebook/react/issues/123', { owner: 'facebook', repo: 'react', path: '' }],
    ['https://github.com/facebook/react/tree/main/packages/scheduler', { owner: 'facebook', repo: 'react', ref: 'main', path: 'packages/scheduler' }],
    ['github.com/facebook/react/blob/v18.2.0/README.md', { owner: 'facebook', repo: 'react', ref: 'v18.2.0', path: 'README.md' }],
    ['https://github.com/o/r/tree/main/a%20b/c', { owner: 'o', repo: 'r', ref: 'main', path: 'a b/c' }],
    ['facebook/react/packages/scheduler', { owner: 'facebook', repo: 'react', path: 'packages/scheduler' }],
    ['https://grow-your-repo.vercel.app/vercel/next.js/packages?ref=canary', { owner: 'vercel', repo: 'next.js', ref: 'canary', path: 'packages' }],
  ])('reads %s', (input, link) => {
    expect(parseLink(input)).toEqual(link)
  })

  it.each(['', 'react', 'gitlab.com/o/r', 'https://example.com/o/r', 'o/..', '-bad/r'])('turns down %j', (input) => {
    expect(parseLink(input)).toBeNull()
  })

  it('round-trips this site’s own address, keeping a ref only when it isn’t the default', () => {
    const link = { owner: 'o', repo: 'r', ref: 'feature/x', path: 'a b/c#d' }
    const route = routeOf(link, 'main')
    expect(route).toBe('/o/r/a%20b/c%23d?ref=feature%2Fx')
    const [pathname, search] = route.split('?')
    expect(linkOfRoute(pathname, `?${search}`)).toEqual(link)
    expect(routeOf({ ...link, ref: 'main' }, 'main')).toBe('/o/r/a%20b/c%23d')
  })

  it('points at folders and files on GitHub', () => {
    expect(githubUrl({ owner: 'o', repo: 'r', ref: 'main', path: 'src/a b.ts' }, 'blob')).toBe('https://github.com/o/r/blob/main/src/a%20b.ts')
    expect(githubUrl({ owner: 'o', repo: 'r', ref: 'release/1', path: 'src' })).toBe('https://github.com/o/r/tree/release/1/src')
  })
})

/** A stand-in for GitHub: answers each request from a list, and records what was asked. */
function github(...answers: (Response | Error)[]) {
  const asked: string[] = []
  const fetch = async (url: string | URL | Request) => {
    asked.push(String(url).replace('https://api.github.com', ''))
    const answer = answers.shift()!
    if (answer instanceof Error) throw answer
    return answer
  }
  return { fetch: fetch as typeof globalThis.fetch, asked }
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } })

async function failure(promise: Promise<unknown>): Promise<Failure> {
  try {
    await promise
  } catch (error) {
    if (error instanceof RepoError) return error.failure
    throw error
  }
  throw new Error('expected it to fail')
}

describe('fetchRepo', () => {
  it('fetches the default branch’s whole tree in two requests and nests it, folders first', async () => {
    const { fetch, asked } = github(json(about), json(tree))
    const repo = await fetchRepo({ owner: 'NadidAzwad', repo: 'Garden', path: '' }, { fetch })

    expect(asked).toEqual(['/repos/NadidAzwad/Garden', '/repos/nadidazwad/garden/git/trees/main?recursive=1'])
    expect(repo).toMatchObject({ owner: 'nadidazwad', name: 'garden', ref: 'main', truncated: false })
    expect(repo.root.count).toBe(tree.tree.length)

    const names = repo.root.children.map((child) => child.name)
    // Folders, then files; dotted names after the rest of their kind.
    expect(names.indexOf('src')).toBeLessThan(names.indexOf('.github'))
    expect(names.indexOf('.github')).toBeLessThan(names.indexOf('README.md'))
    expect(names.indexOf('README.md')).toBeLessThan(names.indexOf('.gitignore'))

    const src = repo.root.children.find((child) => child.name === 'src')!
    expect(src).toMatchObject({ kind: 'folder', path: 'src' })
    const count = tree.tree.filter((entry) => entry.path.startsWith('src/')).length
    expect(src.kind === 'folder' && src.count).toBe(count)
  })

  it('sorts numbered names in number order', async () => {
    const entries = ['10.md', '9.md', 'b.md', 'A.md'].map((path) => ({ path, type: 'blob' }))
    const { fetch } = github(json(about), json({ tree: entries, truncated: false }))
    const repo = await fetchRepo({ owner: 'o', repo: 'r', path: '' }, { fetch })
    expect(repo.root.children.map((child) => child.name)).toEqual(['9.md', '10.md', 'A.md', 'b.md'])
  })

  it('keeps what a truncated tree did send, folders it skipped included', async () => {
    const { fetch } = github(json(about), json({ tree: [{ path: 'deep/down/file.ts', type: 'blob' }], truncated: true }))
    const repo = await fetchRepo({ owner: 'o', repo: 'r', path: '' }, { fetch })
    expect(repo.truncated).toBe(true)
    expect(repo.root.count).toBe(3)
  })

  it('tells a ref with slashes apart from the path after it', async () => {
    const { fetch, asked } = github(json(about), json({ message: 'Not Found' }, 404), json(tree))
    const repo = await fetchRepo({ owner: 'o', repo: 'r', ref: 'feature', path: 'x/src/garden' }, { fetch })
    expect(asked[2]).toBe('/repos/nadidazwad/garden/git/trees/feature/x?recursive=1')
    expect(repo).toMatchObject({ ref: 'feature/x', path: 'src/garden' })
  })

  it('says a missing or private repo is missing', async () => {
    const { fetch } = github(json({ message: 'Not Found' }, 404))
    expect(await failure(fetchRepo({ owner: 'o', repo: 'gone', path: '' }, { fetch }))).toEqual({ reason: 'missing' })
  })

  it('says when an unknown branch is unknown, and when a repo is empty', async () => {
    const unknown = github(json(about), json({}, 404))
    expect(await failure(fetchRepo({ owner: 'o', repo: 'r', ref: 'nope', path: '' }, { fetch: unknown.fetch }))).toEqual({ reason: 'no-ref', ref: 'nope' })
    const empty = github(json(about), json({ message: 'Git Repository is empty.' }, 409))
    expect(await failure(fetchRepo({ owner: 'o', repo: 'r', path: '' }, { fetch: empty.fetch }))).toEqual({ reason: 'empty' })
  })

  it('says when the hourly allowance runs out, and when it comes back', async () => {
    const headers = { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1792939697' }
    for (const status of [403, 429]) {
      const { fetch } = github(json({ message: 'API rate limit exceeded' }, status, headers))
      expect(await failure(fetchRepo({ owner: 'o', repo: 'r', path: '' }, { fetch }))).toEqual({
        reason: 'rate-limited',
        resetsAt: new Date(1792939697 * 1000),
      })
    }
  })

  it('tells a dropped connection apart from GitHub failing', async () => {
    const offline = github(new TypeError('Failed to fetch'))
    expect(await failure(fetchRepo({ owner: 'o', repo: 'r', path: '' }, { fetch: offline.fetch }))).toEqual({ reason: 'offline' })
    const broken = github(json({}, 502))
    expect(await failure(fetchRepo({ owner: 'o', repo: 'r', path: '' }, { fetch: broken.fetch }))).toEqual({ reason: 'failed', status: 502 })
  })
})
