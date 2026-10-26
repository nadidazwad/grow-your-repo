import { labelArea, type Entry } from '../garden'
import { curve, MOUTH, ROOT_ID, type Bounds, type EntrySpec, type FolderSpec, type LabelSide, type Polyline, type Vec2 } from '../grove'
import { githubUrl, type File, type Folder, type Repo } from '../repo'
import { Field } from './field.ts'
import { random } from './random.ts'
import { routesOut } from './routes.ts'
import { wide, type Name, type Shape } from './shapes.ts'
import { gestures, thin, walk } from './walk.ts'

/** A folder only this many over a batch shows them all rather than "+ 2 more". */
const SPARE = 3

/** Which batch of a folder's entries the one at `index` hangs in: past the first, each batch waits on the last one's tip. */
function batchOf(index: number, count: number, size: number) {
  let batch = 0
  for (let start = 0; count - start > size + SPARE && index >= start + size; start += size) batch++
  return batch
}
/** The name of the node holding the rest of a big folder. Git allows no entry by this name, so it can't clash. */
export const MORE = '..'

/** A label keeps this clear of branches it isn't on: their twigs reach about this far. */
const TWIG_REACH = 64
/** A label keeps this clear of its own branch, as the crowding check asks, with a little to spare. */
const BRANCH_ROOM = 24
/** How wide a berth a growing branch gives names: it starts steering round them this far off. */
const BERTH = 60
/** A branch keeps this clear of names, as the crowding check asks. */
const CROWDED = 23
/** Words keep this far apart. */
const WORD_GAP = 8
/** How many differently seeded branches to try for each folder; the best one grows. */
const ATTEMPTS = 4

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

/** Where an entry's icon and name sit. */
interface Words {
  icon: Bounds
  label: Bounds
}

/** What a placed branch leaves for the folders that grow out of it to keep clear of. */
interface Placement {
  parent: string | null
  path: Polyline
  /** Each entry's icon and label, by id. */
  words: Map<string, Words>
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
    const shown = children.length > shape.batch + SPARE ? children.slice(0, shape.batch) : children
    const items: Item[] = shown.map((child) => (child.kind === 'folder' ? { kind: 'folder', folder: child } : { kind: 'file', file: child }))
    // Where everything grows up one narrow column, folders sit toward the tip, so their branches climb on into open sky.
    if (shape.foldersLast) items.sort((a, b) => Number(a.kind === 'folder') - Number(b.kind === 'folder'))
    if (shown.length < children.length) items.push({ kind: 'more', rest: children.slice(shape.batch) })
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
    idOf: (path) => idOf(repo.root, path, shape.batch),
    pathOf: (id) => id.split('/').filter((part) => part && part !== MORE).join('/'),
  }
}

const childId = (parent: string, name: string) => (parent === ROOT_ID ? `/${name}` : `${parent}/${name}`)
const nameOfItem = (item: Item) => (item.kind === 'file' ? item.file.name : item.kind === 'folder' ? item.folder.name : MORE)

function idOf(root: Folder, path: string, size: number) {
  let id = ROOT_ID
  let folder: Folder | undefined = root
  for (const name of path.split('/').filter(Boolean)) {
    if (!folder) break
    const index = folder.children.findIndex((child) => child.name === name)
    if (index === -1) break
    const batches = batchOf(index, folder.children.length, size)
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
  words: Words
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
  let ownIcon: Bounds | null = null
  const wordBoxes: Bounds[] = [avoid]
  const pathPoints: Vec2[] = []
  for (const placement of chain) {
    pathPoints.push(...placement.path.points.filter((_, i) => i % 2 === 0))
    for (const [wordId, { icon, label }] of placement.words) {
      // The folder's own icon is where its branch starts: only names keep off it.
      wordBoxes.push(label)
      if (wordId === id) {
        ownName = label
        ownIcon = icon
      } else {
        wordBoxes.push(icon)
        names.addBox(label)
      }
    }
  }
  paths.addPoints(pathPoints)
  for (const box of wordBoxes) words.addBox(box)
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
  // Past its corridor, a branch that finds itself in a crowd follows the clearest way out to open sky;
  // up a phone's column only gently, or it runs straight up the clear lane by a wall.
  const pull = shape.fitWidth ? 0.004 : 0.012
  const out = at
    ? routesOut({
        area: { minX: Math.max(shape.walls[0] - 40, start[0] - 900), maxX: Math.min(shape.walls[1] + 40, start[0] + 1500), minY: start[1] - 1300, maxY: floor + 40 },
        words: wordBoxes,
        paths: pathPoints,
        walls: shape.walls,
        floor,
      })
    : () => 0

  // The walk asks about the same few spots over and over as it looks ahead, so remember them, a few px apart.
  const seen = new Map<number, number>()
  const room = (x: number, y: number) => {
    const at = Math.round(x / 4) * 65536 + Math.round(y / 4)
    let known = seen.get(at)
    if (known === undefined) {
      known = Math.round(words.distance([x, y], BERTH)) * 64 + Math.round(paths.distance([x, y], 44))
      seen.set(at, known)
    }
    return known
  }
  const cost = ([x, y]: Vec2, s: number) => {
    let c = 0
    const known = room(x, y)
    const near = Math.floor(known / 64)
    if (near < BERTH) c += 6 * ((BERTH - near) / BERTH) ** 2 * Math.min(1, s / 24)
    const branch = known % 64
    if (branch < 44) c += 2 * ((44 - branch) / 44) ** 2 * Math.min(1, s / 70)
    if (y > floor) c += ((y - floor) / 20) ** 2
    if (s > CORRIDOR) c += pull * out([x, y])
    const [left, right] = shape.walls
    if (x < left) c += ((left - x) / 20) ** 2
    if (x > right) c += ((x - right) / 20) ** 2
    return c
  }

  // Each label must stay clear of everything already on the plant, and each
  // folder's corridor out of the words, the branches and the ground. If no
  // seed can hang everything that way, as when a name is wider than a phone,
  // the words only keep off each other and out of the ground; and failing
  // even that, only out of the ground.
  let rules: 'all' | 'words' | 'ground' = 'all'
  const clear = (parts: Bounds[], label: Bounds) =>
    parts.every(
      (part) =>
        part.maxY <= shape.ground - 16 &&
        (rules === 'ground' || (words.nearest(part, WORD_GAP) >= WORD_GAP && (ownIcon === null || apart(part, ownIcon, WORD_GAP)))) &&
        (rules !== 'all' || (part.minX >= shape.left && part.maxX <= shape.right && paths.nearest(part, 36) >= 36)),
    ) &&
    (rules !== 'all' || paths.nearest(label, TWIG_REACH) >= TWIG_REACH)
  const open = (point: Vec2) =>
    point[1] <= floor &&
    (rules === 'ground' || words.distance(point, CORRIDOR_ROOM) >= CORRIDOR_ROOM) &&
    (rules !== 'all' || (point[0] >= shape.walls[0] && point[0] <= shape.walls[1] && paths.distance(point, 30) >= 30))

  const estimate = job.items.reduce((sum, item) => sum + 34 + 3 * nameOfItem(item).length, at ? 140 : 260)
  let best: { score: number; path: Vec2[]; drawn: Polyline; hung: Hung[] } | null = null
  // A few seeds, and more while none has come out clean: those set out more
  // boldly, and half of them sway the other way first.
  for (let attempt = 0; attempt < ATTEMPTS || (attempt < ATTEMPTS * 5 && (!best || best.score >= 100)); attempt++) {
    if (attempt === ATTEMPTS * 3 && !best) rules = 'words'
    if (attempt === ATTEMPTS * 4 && !best) rules = 'ground'
    const rng = random(`${id}#${attempt}`)
    const bold = attempt >= ATTEMPTS
    const setOff = heading + (rng() - 0.5) * (bold ? 1 : 0.2)
    const flip = bold && attempt % 2 === 1
    const steer = {
      start,
      // A folder's branch first runs out along the corridor kept clear for it.
      heading: setOff,
      want: at ? gestures(rng, setOff, 90, shape.sway(below), { flip }) : gestures(rng, setOff, shape.trunk.straight, shape.trunk.sway, { flip }),
      cost,
    }
    const hangRng = random(`${id}#${attempt}/hang`)
    // Walked generously once, then trimmed past the last entry; walked again further only if it ran out.
    for (let length = Math.max(estimate * 2, at ? 0 : shape.trunk.length); length < estimate * 8; length *= 2) {
      const { points, paid } = walk({ ...steer, length })
      const control = thin(points, 30)
      const drawn = curve(control)
      const hung = hang(job.items, drawn, { clear, open }, hangRng, at ? 56 : 150, !at, shape.spread)
      if (!hung) continue
      // Trim past the last entry, leaving the tip to run on a little.
      const last = hung[hung.length - 1]?.s ?? 0
      const reach = Math.max(last + 70 + hangRng() * 80, at ? 160 : shape.trunk.length)
      // A tip that would run under a name stops short of it.
      let trimmed: Vec2[] = []
      let final: Polyline | null = null
      for (const keep of [reach, Math.max(last + 40, (reach + last) / 2), last + 24]) {
        trimmed = thin(points.slice(0, Math.ceil(keep / 6) + 1), 30)
        final = curve(trimmed)
        if (!at || crowding(final) === 0) break
      }
      if (!final) continue
      const underground = final.points.some(([, y]) => y > shape.ground - 40) ? 1000 : 0
      const score = paid / points.length + final.length * 0.02 + underground + 100 * crowding(final)
      if (!best || score < best.score) best = { score, path: trimmed, drawn: final, hung }
      break
    }
  }
  // Nothing fits however it's tried: hang them along the branch anyway, a step apart, rather than not grow at all.
  if (!best) {
    const { points } = walk({ start, heading, want: () => heading, length: 80 * job.items.length + 200, cost })
    const path = thin(points, 30)
    const drawn = curve(path)
    const hung = job.items.map((item, i): Hung => {
      const s = 60 + 80 * i
      const { point, tangent } = frameAt(drawn, s)
      const side = i % 2 === 0 ? 1 : -1
      const spot: Vec2 = [point[0] + tangent[1] * side * 40, point[1] - tangent[0] * side * 40]
      const kind = item.kind === 'file' ? 'file' : 'folder'
      return { at: spot, label: 'below', s, side, words: { icon: iconOf(spot), label: labelArea({ name: nameOfItem(item), kind, at: spot, label: 'below' }, { icon: false }) } }
    })
    best = { score: Infinity, path, drawn, hung }
  }
  return { path: at ? best.path.slice(1) : best.path, drawn: best.drawn, hung: best.hung }
}

/** How far out from its folder a branch runs before it may turn: kept clear of words. */
const CORRIDOR = 110
/** How clear of words a corridor is kept: enough that the branch running down it never crowds them. */
const CORRIDOR_ROOM = 26

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
  { clear, open }: { clear: (parts: Bounds[], label: Bounds) => boolean; open: (point: Vec2) => boolean },
  rng: () => number,
  from: number,
  trunk: boolean,
  /** About how far along the branch its entries spread, all told. */
  room: number,
): Hung[] | null {
  const own = new Field()
  own.addPoints(drawn.points.filter((_, i) => i % 2 === 0))
  const placed = new Field()
  const corridors = new Field()
  const hung: Hung[] = []
  const spacing = Math.max(46, Math.min(130, room / items.length))
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
          for (let d = 0; d <= CORRIDOR; d += 12) points.push([mouth[0] + out[0] * d, mouth[1] + out[1] * d])
          // Its mouth sits near the branch it hangs from; past that, the corridor keeps off it.
          if (points.some((p, i) => placed.distance(p, CORRIDOR_ROOM) < CORRIDOR_ROOM || (i > 1 && own.distance(p, 18) < 18) || !open(p))) return false
          return (corridor = points), true
        }
        let blocked = false
        for (const label of LABELS) {
          const cost = (t - s) / WINDOW + LABEL_COST[label] + (side === lastSide ? repeat : 0) + (kind === 'folder' && side === -1 ? 0.4 : 0)
          if (blocked || cost >= score) continue
          const node = { name: nameOfItem(item), kind, at, label, data } as const
          const text = labelArea(node, { icon: false })
          const parts = [iconOf(at), text]
          const icon = { minX: at[0] - 14, maxX: at[0] + 14, minY: at[1] - 13, maxY: at[1] + 13 }
          if (parts.some((part) => placed.nearest(part, WORD_GAP) < WORD_GAP || corridors.nearest(part, CORRIDOR_ROOM) < CORRIDOR_ROOM)) continue
          if (own.nearest(text, BRANCH_ROOM) < BRANCH_ROOM || own.nearest(icon, 6) < 6) continue
          if (!clear(parts, text)) continue
          if (!corridorOpen()) {
            blocked = true
            continue
          }
          // The folder's own name mustn't sit in its corridor.
          // Its own name may sit by its mouth, as the crowding check allows, but not further along.
          if (corridor!.some((p) => Math.hypot(p[0] - at[0], p[1] - at[1]) >= 50 && gap(p, text) < CROWDED + 6)) continue
          first = Math.min(first, t)
          score = cost
          found = { at, label, s: t, side, corridor: corridor!, words: { icon: iconOf(at), label: text } }
        }
      }
    }
    if (!found) return null
    hung.push(found)
    placed.addBox(found.words.icon)
    placed.addBox(found.words.label)
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

/** The box a node's icon fills. */
const iconOf = ([x, y]: Vec2): Bounds => ({ minX: x - 18, maxX: x + 18, minY: y - 18, maxY: y + 18 })

/** Whether two boxes are at least `room` apart. */
const apart = (a: Bounds, b: Bounds, room: number) =>
  a.minX >= b.maxX + room || b.minX >= a.maxX + room || a.minY >= b.maxY + room || b.minY >= a.maxY + room

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
