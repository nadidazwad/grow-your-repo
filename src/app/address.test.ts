import { describe, expect, it } from 'vitest'
import { savedRepo } from '../dev/trees'
import { createGrove } from '../grove'
import { placeRepo } from '../place'
import { syncAddress, type Address } from './address.ts'

/** An address bar with its own history, standing in for the browser's. */
function memoryAddress(start: string) {
  const stack = [start]
  let at = 0
  const listeners = new Set<() => void>()
  const address: Address & { back(): void; forward(): void; history: string[] } = {
    get route() {
      return stack[at]
    },
    get history() {
      return stack.slice(0, at + 1)
    },
    push(route) {
      if (route === stack[at]) return
      stack.splice(at + 1, Infinity, route)
      at++
    },
    replace(route) {
      stack[at] = route
    },
    onPop(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    back() {
      at--
      listeners.forEach((listener) => listener())
    },
    forward() {
      at++
      listeners.forEach((listener) => listener())
    },
  }
  return address
}

function grown(path: string) {
  const repo = { ...savedRepo('nadidazwad/garden'), path }
  const placed = placeRepo(repo)
  const grove = createGrove(placed.tree, { exclusive: true })
  return { repo, placed, grove }
}

describe('syncAddress', () => {
  it('grows to the path a repo was linked at, and tidies the address', () => {
    const { repo, placed, grove } = grown('src/garden/')
    const address = memoryAddress('/NadidAzwad/Garden/src/garden/?ref=main')
    syncAddress(grove, placed, repo, address)
    expect(grove.location).toBe('/src/garden')
    expect(grove.isExpanded('/src')).toBe(true)
    expect(address.route).toBe('/nadidazwad/garden/src/garden')
  })

  it('adds a step for each folder, and Back and Forward walk the plant through them', () => {
    const { repo, placed, grove } = grown('')
    const address = memoryAddress('/nadidazwad/garden')
    syncAddress(grove, placed, repo, address)
    grove.open('/src')
    grove.open('/src/garden')
    expect(address.history).toEqual(['/nadidazwad/garden', '/nadidazwad/garden/src', '/nadidazwad/garden/src/garden'])

    address.back()
    expect(grove.location).toBe('/src')
    expect(grove.isExpanded('/src/garden')).toBe(false)
    address.back()
    expect(grove.isExpanded('/src')).toBe(false)
    address.forward()
    expect(grove.isExpanded('/src')).toBe(true)
    // Walking history doesn't add to it.
    expect(address.history).toEqual(['/nadidazwad/garden', '/nadidazwad/garden/src'])
  })

  it('leaves a step to another repo to the page', () => {
    const { repo, placed, grove } = grown('src')
    const address = memoryAddress('/vitejs/vite')
    address.push('/nadidazwad/garden/src', '')
    syncAddress(grove, placed, repo, address)
    address.back()
    expect(grove.location).toBe('/src')
  })
})
