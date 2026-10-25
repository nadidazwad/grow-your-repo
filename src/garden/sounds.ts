import { useEffect, useLayoutEffect, useRef } from 'react'
import { ROOT_ID, type Grove, type GroveNode, type Vec2 } from '../grove'
import { sound, type Cue, type PlayOptions } from '../sound'
import type { Entry } from './entry.ts'
import { toScreen, type View } from './view.ts'

type Play = (cue: Cue, options?: PlayOptions) => void

/**
 * The sounds the plant makes. They're heard from what the grove does, not from
 * what was clicked, so a link or the back button sounds just like a click. A
 * folder opening knocks on wood; each name that grows in along its branch rings
 * a note higher than the last, starting higher the deeper the folder; a branch
 * going back in knocks lower. `panAt` places a sound where its node is on screen.
 */
export function listenForSounds(grove: Grove<Entry>, play: Play, panAt: (at: Vec2) => number = () => 0) {
  // Folders are placed as they first open, so the nodes to listen to grow too.
  const nodes = new Map<string, GroveNode<Entry>>()
  const folders: GroveNode<Entry>[] = []
  const meet = () => {
    for (const node of grove.layout.nodes.slice(nodes.size)) {
      nodes.set(node.id, node)
      if (node.kind === 'folder') folders.push(node)
    }
  }
  meet()
  const shown = new Set(grove.layout.nodes.filter((node) => grove.isVisible(node.id)).map((node) => node.id))
  const open = new Set(folders.filter((node) => grove.isOpen(node.id)).map((node) => node.id))
  // How many of each folder's names are out, so the next one knows its note.
  const out = new Map<string, number>()
  for (const id of shown) out.set(nodes.get(id)!.parent, (out.get(nodes.get(id)!.parent) ?? 0) + 1)
  // Folders whose names have been going back in, until any of them grows again. A branch takes its
  // names over a few frames, and a folder open inside it takes its own first, but it's one closing: one knock.
  const retracting = new Set<string>()
  const related = (a: string, b: string) => a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`)

  return grove.subscribe(() => {
    meet()
    let opened: GroveNode<Entry> | undefined
    for (const folder of folders) {
      const now = grove.isOpen(folder.id)
      if (now && !open.has(folder.id)) {
        open.add(folder.id)
        opened ??= folder
      } else if (!now && open.has(folder.id)) open.delete(folder.id)
    }
    let went: GroveNode<Entry> | undefined
    for (const node of nodes.values()) {
      const now = grove.isVisible(node.id)
      if (now === shown.has(node.id)) continue
      const before = out.get(node.parent) ?? 0
      if (now) {
        shown.add(node.id)
        out.set(node.parent, before + 1)
        for (const id of retracting) if (related(id, node.parent)) retracting.delete(id)
        play('sprout', { step: depth(node.parent) + before, pan: panAt(node.at) })
      } else {
        shown.delete(node.id)
        out.set(node.parent, Math.max(0, before - 1))
        if (![...retracting].some((id) => related(id, node.parent))) went ??= node
        retracting.add(node.parent)
      }
    }
    // Opening one folder can close another; the opening is the one to hear.
    if (opened) play('open', { pan: panAt(opened.at) })
    else if (went) play('close', { pan: panAt(nodes.get(went.parent)?.at ?? went.at) })
  })
}

/** How deep a folder sits: the trunk's names start at the bottom note, a folder's one step up per level. */
const depth = (id: string) => (id === ROOT_ID ? 0 : id.split('/').length - 1)

/** The garden's plant sounds, placed left and right by where things are on screen. */
export function usePlantSounds(grove: Grove<Entry>, view: View) {
  const latest = useRef(view)
  useLayoutEffect(() => {
    latest.current = view
  }, [view])
  useEffect(
    () =>
      listenForSounds(grove, sound.play, (at) => {
        const { width } = latest.current
        const [x] = toScreen(grove, latest.current, at)
        return Math.max(-1, Math.min(1, (x / width) * 2 - 1)) * 0.6
      }),
    [grove],
  )
}
