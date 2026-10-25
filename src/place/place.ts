import { labelArea, type Entry } from '../garden'
import { curve, MOUTH, ROOT_ID, type Bounds, type EntrySpec, type FolderSpec, type LabelSide, type Polyline, type Vec2 } from '../grove'
import { githubUrl, type File, type Folder, type Repo } from '../repo'
import { Field } from './field.ts'
import { random } from './random.ts'
import { gestures, thin, walk } from './walk.ts'

/** Entries one branch carries; the rest wait on a node at its tip that grows them a branch of their own. */
export const BATCH = 15
/** A folder only this many over a batch shows them all rather than "+ 2 more". */
const SPARE = 3
/** The name of the node holding the rest of a big folder. Git allows no entry by this name, so it can't clash. */
export const MORE = '..'

/** A label keeps this clear of branches it isn't on: their twigs reach about this far. */
const TWIG_REACH = 64
/** A label keeps this clear of its own branch, as the crowding check asks, with a little to spare. */
const BRANCH_ROOM = 24
/** A branch keeps this clear of names, as the crowding check asks. */
const CROWDED = 23
/** Words keep this far apart. */
const WORD_GAP = 8
/** How many differently seeded branches to try for each folder; the best one grows. */
const ATTEMPTS = 4

/** A layout for one shape of screen: where the ground is, which way the plant grows, and what it keeps out of. */
export interface Shape {
  ground: number
  /** Nothing goes left of this: the view never does. */
  left: number
  right: number
  trunk: { start: Vec2; heading: number; prefer: number; length: number }
  /** The heading branches settle into, radians with y down. */
  prefer: number
  /** Where the repo's name stands on the ground, and the line of words above it. */
  name(text: string): Name
}

export interface Name {
  /** Type size, in world px. */
  size: number
  /** World y the letters stand on; descenders reach down to the ground. */
  baseline: number
  /** From the top of the line above the name to the ground: names stay out of it. */
  box: Bounds
  /** The line of words above the name: twigs stay out of it too. */
  line: Bounds
}

/** PP Mondwest's advance, in ems a character, with a little to spare: wide letters run over the average. */
const MONDWEST = 0.5
/** Where the name starts, in from the left edge of the opening view. */
const NAME_LEFT = -404

const GROUND = 400

/** A desktop: the opening view spans x −432 to 848 and stands on the ground; the plant spreads right and up. */
export const wide: Shape = {
  ground: GROUND,
  left: -420,
  right: Infinity,
  trunk: { start: [-480, 30], heading: -0.3, prefer: 0, length: 780 },
  prefer: -0.5,
  name(text) {
    // As big as fits the opening view, up to a size that still leaves the sky to the plant.
    const size = Math.min(150, 1180 / (MONDWEST * Math.max(text.length, 10)))
    const baseline = GROUND - 0.26 * size
    const top = baseline - 0.66 * size
    const line = { minX: NAME_LEFT, maxX: NAME_LEFT + 460, minY: top - 62, maxY: top - 14 }
    return { size, baseline, line, box: { minX: NAME_LEFT, maxX: Math.max(line.maxX, NAME_LEFT + MONDWEST * size * text.length), minY: line.minY, maxY: GROUND } }
  },
}

export interface Placed {
  /** The tree to grow: the trunk and the top level placed, each folder placed when it first opens. */
  tree: FolderSpec<Entry>
  shape: Shape
  name: Name & { text: string }
  /** The grove id for a path in the repo, as far down as it exists. Entries past a folder's first batch sit further in. */
  idOf(path: string): string
  /** The path in the repo a grove id stands for. */
  pathOf(id: string): string
}

/** What a placed branch leaves for the folders that grow out of it to keep clear of. */
interface Placement {
  parent: string | null
  path: Polyline
  /** Each entry's icon and label, by id. */
  words: Map<string, { icon: Bounds; label: Bounds }>
}

type Item = { kind: 'file'; file: File } | { kind: 'folder'; folder: Folder } | { kind: 'more'; rest: (Folder | File)[] }

/**
 * Places a repo's tree as a plant: a trunk entering from the left with the top
 * level along it, and for each folder, once it first opens, a branch out of it
 * carrying what's inside. Only one chain of folders is ever open, so a branch
 * only keeps clear of the folders it grows out of and the names along them.
 * Seeded by path, so the same repo always grows the same plant.
 */
export function placeRepo(repo: Repo, shape: Shape = wide): Placed {
  const placements = new Map<string, Placement>()
  const text = `${repo.owner}/${repo.name}`
  const name = { text, ...shape.name(text) }

  const itemsOf = (children: (Folder | File)[]): Item[] => {
    const shown = children.length > BATCH + SPARE ? children.slice(0, BATCH) : children
    const items: Item[] = shown.map((child) => (child.kind === 'folder' ? { kind: 'folder', folder: child } : { kind: 'file', file: child }))
    if (shown.length < children.length) items.push({ kind: 'more', rest: children.slice(BATCH) })
    return items
  }

  const href = (path: string, kind: 'tree' | 'blob') => githubUrl({ owner: repo.owner, repo: repo.name, ref: repo.ref, path }, kind)

  const specOf = (item: Item, id: string, at: Vec2, label: LabelSide): EntrySpec<Entry> => {
    if (item.kind === 'file') {
      const { file } = item
      return { name: file.name, at, label, data: { kind: 'file', href: href(file.path, file.submodule ? 'tree' : 'blob') } }
    }
    const children = item.kind === 'folder' ? item.folder.children : item.rest
    const load = item.kind === 'folder' ? item.folder.count : children.reduce((sum, child) => sum + 1 + (child.kind === 'folder' ? child.count : 0), 0)
    return {
      name: item.kind === 'folder' ? item.folder.name : MORE,
      at,
      label,
      load,
      data: item.kind === 'folder' ? { kind: 'folder' } : { kind: 'folder', title: `+ ${item.rest.length.toLocaleString('en')} more` },
      grow: () => grow(id, itemsOf(children), at, load),
    }
  }

  const grow = (id: string, items: Item[], at: Vec2 | null, load: number) => {
    const parent = at ? id.slice(0, id.lastIndexOf('/')) || ROOT_ID : null
    const chain: Placement[] = []
    for (let p = parent; p !== null; p = placements.get(p)!.parent) chain.push(placements.get(p)!)
    const placed = placeBranch({ id, items, at, chain, shape, avoid: name.box })
    placements.set(id, { parent, path: placed.drawn, words: new Map(placed.hung.map((h, i) => [childId(id, nameOfItem(items[i])), h.words])) })
    return {
      branch: { path: placed.path, width: at ? Math.min(2.4 + 0.9 * Math.sqrt(load), 7) : 8.5 },
      children: placed.hung.map((h, i) => specOf(items[i], childId(id, nameOfItem(items[i])), h.at, h.label)),
    }
  }

  const root = grow(ROOT_ID, itemsOf(repo.root.children), null, repo.root.count)
  return {
    tree: { name: text, ...root },
    shape,
    name,
    idOf: (path) => idOf(repo.root, path),
    pathOf: (id) => id.split('/').filter((part) => part && part !== MORE).join('/'),
  }
}

const childId = (parent: string, name: string) => (parent === ROOT_ID ? `/${name}` : `${parent}/${name}`)
const nameOfItem = (item: Item) => (item.kind === 'file' ? item.file.name : item.kind === 'folder' ? item.folder.name : MORE)

function idOf(root: Folder, path: string) {
  let id = ROOT_ID
  let folder: Folder | undefined = root
  for (const name of path.split('/').filter(Boolean)) {
    if (!folder) break
    const index = folder.children.findIndex((child) => child.name === name)
    if (index === -1) break
    const batches = folder.children.length > BATCH + SPARE ? Math.floor(index / BATCH) : 0
    for (let i = 0; i < batches; i++) id = childId(id, MORE)
    id = childId(id, name)
    const child: Folder | File = folder.children[index]
    folder = child.kind === 'folder' ? child : undefined
  }
  return id
}

interface Hung {
  at: Vec2
  label: LabelSide
  s: number
  side: 1 | -1
  words: { icon: Bounds; label: Bounds }
}

interface BranchJob {
  id: string
  items: Item[]
  /** The folder's icon; null for the trunk. */
  at: Vec2 | null
  /** The placed branches it grows out of, nearest first. */
  chain: Placement[]
  shape: Shape
  /** Where the repo's name stands. */
  avoid: Bounds
}

/** Tries a few seeded branches for a folder and keeps the one that carries everything most neatly. */
function placeBranch(job: BranchJob) {
  const { id, at, chain, shape, avoid } = job
  const words = new Field()
  const paths = new Field()
  // Names alone, for the crowding check; the folder's own may sit near where its branch leaves it.
  const names = new Field()
  let ownName: Bounds | null = null
  for (const placement of chain) {
    paths.addPoints(placement.path.points.filter((_, i) => i % 2 === 0))
    for (const [wordId, { icon, label }] of placement.words) {
      // The folder's own icon is where its branch starts.
      if (wordId !== id) words.addBox(icon)
      words.addBox(label)
      if (wordId === id) ownName = label
      else names.addBox(label)
    }
  }
  words.addBox(avoid)
  /** How many of a branch's points run under a name, counted as the crowding check counts them. */
  const crowding = (path: Polyline) =>
    path.points.filter(
      (p) => names.distance(p, CROWDED) < CROWDED || (ownName !== null && at !== null && Math.hypot(p[0] - at[0], p[1] - at[1]) >= 50 && gap(p, ownName) < CROWDED),
    ).length

  // Which way the folder faces: out from the side of the branch it hangs on, and on along it.
  let heading = shape.trunk.heading
  let below = false
  if (at && chain[0]) {
    const { point, tangent } = frameAt(chain[0].path, nearest(chain[0].path, at))
    const normal: Vec2 = [tangent[1], -tangent[0]]
    const side = Math.sign((at[0] - point[0]) * normal[0] + (at[1] - point[1]) * normal[1]) || 1
    below = side < 0 && normal[1] < 0
    const out = outward(tangent, side, id.endsWith(`/${MORE}`))
    heading = Math.atan2(out[1], out[0])
  }
  const start: Vec2 = at ? [at[0] + MOUTH[0], at[1] + MOUTH[1]] : shape.trunk.start
  const floor = shape.ground - (at ? 70 : 150)

  // The walk asks about the same few spots over and over as it looks ahead, so remember them, a few px apart.
  const seen = new Map<number, number>()
  const room = (x: number, y: number) => {
    const at = Math.round(x / 4) * 65536 + Math.round(y / 4)
    let known = seen.get(at)
    if (known === undefined) {
      known = Math.min(words.distance([x, y], 36), 36) * 64 + Math.min(paths.distance([x, y], 44), 44)
      seen.set(at, known)
    }
    return known
  }
  const cost = ([x, y]: Vec2, s: number) => {
    let c = 0
    const known = room(x, y)
    const near = Math.floor(known / 64)
    if (near < 36) c += 3 * ((36 - near) / 36) ** 2 * Math.min(1, s / 24)
    const branch = known % 64
    if (branch < 44) c += 2 * ((44 - branch) / 44) ** 2 * Math.min(1, s / 70)
    if (y > floor) c += ((y - floor) / 20) ** 2
    if (x < shape.left) c += ((shape.left - x) / 20) ** 2
    if (x > shape.right) c += ((x - shape.right) / 20) ** 2
    return c
  }

  // Each label must stay clear of everything already on the plant...
  const clear = (box: Bounds, label: Bounds) =>
    box.maxY <= shape.ground - 16 &&
    box.minX >= shape.left &&
    box.maxX <= shape.right &&
    words.nearest(box, WORD_GAP) >= WORD_GAP &&
    paths.nearest(label, TWIG_REACH) >= TWIG_REACH &&
    paths.nearest(box, 36) >= 36
  // ...and each folder's corridor out of its words, its branches, and the ground.
  const open = (point: Vec2) =>
    point[1] <= floor && point[0] >= shape.left && point[0] <= shape.right && words.distance(point, 20) >= 20 && paths.distance(point, 30) >= 30

  const estimate = job.items.reduce((sum, item) => sum + 34 + 3 * nameOfItem(item).length, at ? 140 : 260)
  let best: { score: number; path: Vec2[]; drawn: Polyline; hung: Hung[] } | null = null
  // A few seeds, and more while none has come out clean.
  for (let attempt = 0; attempt < ATTEMPTS || (attempt < ATTEMPTS * 3 && best && best.score >= 100); attempt++) {
    const rng = random(`${id}#${attempt}`)
    const out = heading + (rng() - 0.5) * 0.2
    const steer = {
      start,
      // A folder's branch first runs out along the corridor kept clear for it.
      heading: out,
      want: at
        ? gestures(rng, below ? { out, run: [0.05, 0.35], climb: [-0.35, -0.05], from: 90 } : { out, run: [-0.3, 0.12], climb: [-1.15, -0.7], from: 90 })
        : gestures(rng, { out, run: [0.12, 0.4], climb: [-0.42, -0.18], from: 40 }),
      cost,
    }
    const hangRng = random(`${id}#${attempt}/hang`)
    // Walked generously once, then trimmed past the last entry; walked again further only if it ran out.
    for (let length = Math.max(estimate * 2, at ? 0 : shape.trunk.length); length < estimate * 8; length *= 2) {
      const { points, paid } = walk({ ...steer, length })
      const control = thin(points, 30)
      const drawn = curve(control)
      const hung = hang(job.items, drawn, { clear, open }, hangRng, at ? 56 : 150, !at)
      if (!hung) continue
      // Trim past the last entry, leaving the tip to run on a little.
      const last = hung[hung.length - 1]?.s ?? 0
      const keep = Math.max(last + 70 + hangRng() * 80, at ? 160 : shape.trunk.length)
      const trimmed = thin(points.slice(0, Math.ceil(keep / 6) + 1), 30)
      const final = curve(trimmed)
      const underground = final.points.some(([, y]) => y > shape.ground - 40) ? 1000 : 0
      const score = paid / points.length + final.length * 0.02 + underground + 100 * crowding(final)
      if (!best || score < best.score) best = { score, path: trimmed, drawn: final, hung }
      break
    }
  }
  if (!best) throw new Error(`Couldn't place ${id}`)
  return { path: at ? best.path.slice(1) : best.path, drawn: best.drawn, hung: best.hung }
}

/** How far out from its folder a branch runs before it may turn: kept clear of words. */
const CORRIDOR = 110

/** Which way a folder's branch leaves it: out from the side of the branch it hangs on, and on along it. */
function outward(tangent: Vec2, side: number, more: boolean): Vec2 {
  // The rest of a big folder carries on where its branch left off.
  const push = more ? 0.4 : 1
  const x = tangent[1] * side * push + tangent[0] * 0.8
  const y = -tangent[0] * side * push + tangent[1] * 0.8
  const length = Math.hypot(x, y)
  return [x / length, y / length]
}

/**
 * Hangs the entries along a branch in order, alternating sides, spaced out
 * more the fewer there are: never on another's words, nor on the branch, nor on
 * anything `clear` rules out. Each folder keeps a corridor clear out of its
 * mouth, so its own branch has a way out. Null if the branch is too short.
 */
function hang(
  items: Item[],
  drawn: Polyline,
  { clear, open }: { clear: (box: Bounds, label: Bounds) => boolean; open: (point: Vec2) => boolean },
  rng: () => number,
  from: number,
  trunk: boolean,
): Hung[] | null {
  const own = new Field()
  own.addPoints(drawn.points.filter((_, i) => i % 2 === 0))
  const placed = new Field()
  const corridors = new Field()
  const hung: Hung[] = []
  const spacing = Math.max(46, Math.min(130, 1100 / items.length))
  let s = from
  let lastSide: 1 | -1 = -1
  for (const item of items) {
    const kind = item.kind === 'file' ? 'file' : 'folder'
    const data: Entry = item.kind === 'file' ? { kind: 'file', href: '' } : { kind: 'folder', title: item.kind === 'more' ? `+ ${item.rest.length.toLocaleString('en')} more` : undefined }
    // On the trunk, folders only face up, away from the ground.
    const sides: (1 | -1)[] = trunk && kind === 'folder' ? [1] : [1, -1]
    const offsets = { [1]: 34 + rng() * 26, [-1]: 30 + rng() * 24 }
    // Mostly the other side from the last one, but not like clockwork.
    const repeat = rng() < 0.3 ? 0 : 0.3
    let found: (Hung & { corridor: Vec2[] }) | null = null
    let score = Infinity
    let first = Infinity
    for (let t = s; t < drawn.length - 20 && t <= first + WINDOW; t += 7) {
      const { point, tangent } = frameAt(drawn, t)
      const up: Vec2 = [tangent[1], -tangent[0]]
      for (const side of sides) {
        const at: Vec2 = [point[0] + up[0] * side * offsets[side], point[1] + up[1] * side * offsets[side]]
        // Worked out only once a spot otherwise fits: it's the dearest check.
        let corridor: Vec2[] | null = null
        const corridorOpen = () => {
          if (corridor) return true
          if (kind !== 'folder') return (corridor = []), true
          const out = outward(tangent, side, item.kind === 'more')
          const mouth: Vec2 = [at[0] + MOUTH[0], at[1] + MOUTH[1]]
          const points: Vec2[] = []
          for (let d = 24; d <= CORRIDOR; d += 12) points.push([mouth[0] + out[0] * d, mouth[1] + out[1] * d])
          if (points.some((p) => placed.distance(p, 22) < 22 || own.distance(p, 18) < 18 || !open(p))) return false
          return (corridor = points), true
        }
        let blocked = false
        for (const label of LABELS) {
          const cost = (t - s) / WINDOW + LABEL_COST[label] + (side === lastSide ? repeat : 0) + (kind === 'folder' && side === -1 ? 0.4 : 0)
          if (blocked || cost >= score) continue
          const node = { name: nameOfItem(item), kind, at, label, data } as const
          const box = labelArea(node)
          const text = labelArea(node, { icon: false })
          const icon = { minX: at[0] - 14, maxX: at[0] + 14, minY: at[1] - 13, maxY: at[1] + 13 }
          if (placed.nearest(box, WORD_GAP) < WORD_GAP || corridors.nearest(box, 22) < 22) continue
          if (own.nearest(text, BRANCH_ROOM) < BRANCH_ROOM || own.nearest(icon, 6) < 6) continue
          if (!clear(box, text)) continue
          if (!corridorOpen()) {
            blocked = true
            continue
          }
          // The folder's own name mustn't sit in its corridor.
          if (corridor!.some((p) => Math.max(text.minX - p[0], 0, p[0] - text.maxX) ** 2 + Math.max(text.minY - p[1], 0, p[1] - text.maxY) ** 2 < 20 ** 2)) continue
          first = Math.min(first, t)
          score = cost
          found = { at, label, s: t, side, corridor: corridor!, words: { icon: { minX: at[0] - 18, maxX: at[0] + 18, minY: at[1] - 18, maxY: at[1] + 18 }, label: text } }
        }
      }
    }
    if (!found) return null
    hung.push(found)
    placed.addBox(labelArea({ name: nameOfItem(item), kind, at: found.at, label: found.label, data }))
    corridors.addPoints(found.corridor)
    lastSide = found.side
    s = found.s + spacing * (0.5 + 0.7 * rng())
  }
  return hung
}

/** How far past the first spot that fits an entry looks for a better one, in px along the branch. */
const WINDOW = 42
/** Names read to the right of their icons where they can, as in the reference; under or to the left only when that won't fit. */
const LABELS: LabelSide[] = ['right', 'below', 'left']
const LABEL_COST: Record<LabelSide, number> = { right: 0, below: 0.35, left: 0.7 }

/** How far a point is from a box; 0 inside it. */
const gap = ([x, y]: Vec2, box: Bounds) => Math.hypot(Math.max(box.minX - x, 0, x - box.maxX), Math.max(box.minY - y, 0, y - box.maxY))

function frameAt(path: Polyline, s: number) {
  const { points, lengths } = path
  let i = 0
  while (i < lengths.length - 1 && lengths[i + 1] <= s) i++
  const before = points[Math.max(0, i - 2)]
  const after = points[Math.min(points.length - 1, i + 2)]
  const dx = after[0] - before[0]
  const dy = after[1] - before[1]
  const length = Math.hypot(dx, dy) || 1
  return { point: points[i], tangent: [dx / length, dy / length] as Vec2 }
}

function nearest(path: Polyline, [x, y]: Vec2) {
  let best = 0
  let bestDistance = Infinity
  path.points.forEach(([px, py], i) => {
    const distance = (px - x) ** 2 + (py - y) ** 2
    if (distance < bestDistance) {
      bestDistance = distance
      best = path.lengths[i]
    }
  })
  return best
}
