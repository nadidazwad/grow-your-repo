import { useEffect } from 'react'
import type { Entry } from '../garden'
import { ROOT_ID, type Grove } from '../grove'
import type { Placed } from '../place'
import { linkOfRoute, routeOf, type Repo, type RepoLink } from '../repo'

/** The address bar and its history, as far as the page needs them. */
export interface Address {
  /** The path and query, as in `/facebook/react/packages?ref=main`. */
  readonly route: string
  push(route: string, title: string): void
  replace(route: string, title: string): void
  /** Called when the visitor moves through history. */
  onPop(listener: () => void): () => void
}

export const sameRepo = (a: RepoLink | null, b: RepoLink | null) =>
  !!a && !!b && a.owner.toLowerCase() === b.owner.toLowerCase() && a.repo.toLowerCase() === b.repo.toLowerCase() && (a.ref ?? '') === (b.ref ?? '')

/**
 * Keeps the address bar and the plant in step: the address is the repo and
 * the path to wherever the visitor is in it, so it deep-links. It starts by
 * growing to the path the repo was linked at. Opening or closing a folder adds
 * a step to history, and Back and Forward walk the plant back and forth. A step
 * to another repo is the page's to handle.
 */
export function syncAddress(grove: Grove<Entry>, placed: Placed, repo: Repo, address: Address) {
  const routeAt = (id: string) => routeOf({ owner: repo.owner, repo: repo.name, ref: repo.ref, path: placed.pathOf(id) }, repo.defaultRef)
  const titleAt = (id: string) => {
    const path = placed.pathOf(id)
    return path ? `${path} · ${repo.owner}/${repo.name}` : `${repo.owner}/${repo.name}`
  }

  let shown = placed.idOf(repo.path)
  if (shown !== ROOT_ID) grove.go(shown)
  shown = grove.location
  address.replace(routeAt(shown), titleAt(shown))

  const unsubscribe = grove.subscribe(() => {
    if (grove.location === shown) return
    shown = grove.location
    address.push(routeAt(shown), titleAt(shown))
  })

  const offPop = address.onPop(() => {
    const [pathname, search = ''] = address.route.split(/(?=\?)/)
    const link = linkOfRoute(pathname, search)
    if (!link || !sameRepo({ ...link, ref: link.ref ?? repo.defaultRef }, { owner: repo.owner, repo: repo.name, ref: repo.ref, path: '' })) return
    shown = placed.idOf(link.path)
    grove.go(shown)
    shown = grove.location
  })

  return () => {
    unsubscribe()
    offPop()
  }
}

/** The browser's own address bar. */
export function windowAddress(): Address {
  return {
    get route() {
      return `${location.pathname}${location.search}`
    },
    push(route, title) {
      if (route !== `${location.pathname}${location.search}`) history.pushState(null, '', route)
      document.title = title
    },
    replace(route, title) {
      history.replaceState(null, '', route)
      document.title = title
    },
    onPop(listener) {
      window.addEventListener('popstate', listener)
      return () => window.removeEventListener('popstate', listener)
    },
  }
}

export function useAddress(grove: Grove<Entry>, placed: Placed, repo: Repo) {
  useEffect(() => syncAddress(grove, placed, repo, windowAddress()), [grove, placed, repo])
}
