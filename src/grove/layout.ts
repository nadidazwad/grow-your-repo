export type Vec2 = readonly [number, number]
export type LabelSide = 'right' | 'left' | 'below'

export interface BranchSpec {
  /** Bark radius at the base, in world px. By default a folder's branch is as stout as what it holds. */
  width?: number
  /** Control points. A folder's branch starts at the folder's mouth, so list the points after it. */
  path: Vec2[]
  /** Side limbs with no files on them; each starts on the path. */
  limbs?: Vec2[][]
}

/** `T` is whatever the page needs to show an entry; the grove only carries it. */
export interface FileSpec<T = unknown> {
  name: string
  at: Vec2
  label: LabelSide
  data?: T
}

export interface FolderSpec<T = unknown> {
  name: string
  branch: BranchSpec
  children: EntrySpec<T>[]
  data?: T
}

/** A folder whose branch and contents are placed only when it first opens, so a huge tree costs only what's explored. */
export interface SeedSpec<T = unknown> {
  name: string
  at: Vec2
  label: LabelSide
  data?: T
  /** How many files and folders it holds, nested ones included. */
  load: number
  grow(): Pick<FolderSpec<T>, 'branch' | 'children'>
}

export type EntrySpec<T = unknown> = FileSpec<T> | (FolderSpec<T> & { at: Vec2; label: LabelSide }) | SeedSpec<T>

export interface Polyline {
  points: Vec2[]
  /** Arc length at each point. */
  lengths: number[]
  length: number
}

export interface Limb extends Polyline {
  /** Arc length on the branch where the limb starts. */
  from: number
}

export interface GroveBranch {
  /** The folder's id; the root folder's branch is the trunk. */
  id: string
  parent: string | null
  /** How many files and folders the branch carries, nested ones included. */
  load: number
  /** The folder icon's centre, where the branch comes out; null for the trunk. */
  at: Vec2 | null
  width: number
  path: Polyline
  limbs: Limb[]
  /** Where the camera settles when this folder is open; for the trunk, where it starts. */
  focus: Vec2
}

export interface GroveNode<T = unknown> {
  id: string
  name: string
  kind: 'folder' | 'file'
  /** Id of the folder whose branch this node hangs off. */
  parent: string
  at: Vec2
  label: LabelSide
  /** Growth of the parent branch at which the node appears. */
  revealAt: number
  data?: T
}

/** As much of the tree as is placed so far: seeds join it as they first open. */
export interface Layout<T = unknown> {
  rootId: string
  /** A folder's branch always comes after its parent's. */
  branches: ReadonlyMap<string, GroveBranch>
  /** A folder always comes before its children. */
  nodes: readonly GroveNode<T>[]
  bounds: { readonly minX: number; readonly minY: number; readonly maxX: number; readonly maxY: number }
}

export const ROOT_ID = '/'

const STEP = 2.5
/** A node shows once the growing tip is this far past it. */
const REVEAL_LAG = 25
/** Where a branch leaves its folder: the top edge of the open folder icon, right of centre. */
export const MOUTH: Vec2 = [12, -11]

/** Lays out what's placed of the tree; `place` grows a seed's branch and contents in, and says whether it did. */
export function layout<T>(spec: FolderSpec<T>): { layout: Layout<T>; place(id: string): boolean } {
  const branches = new Map<string, GroveBranch>()
  const nodes: GroveNode<T>[] = []
  const seeds = new Map<string, SeedSpec<T>>()
  const bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
  const grow = ([x, y]: Vec2) => {
    bounds.minX = Math.min(bounds.minX, x)
    bounds.maxX = Math.max(bounds.maxX, x)
    bounds.minY = Math.min(bounds.minY, y)
    bounds.maxY = Math.max(bounds.maxY, y)
  }

  const visit = (folder: FolderSpec<T>, id: string, parent: string | null, at: Vec2 | null) => {
    const control = at ? [[at[0] + MOUTH[0], at[1] + MOUTH[1]] as const, ...folder.branch.path] : folder.branch.path
    const path = curve(control)
    const limbs = (folder.branch.limbs ?? []).map((points) => ({
      ...curve(points),
      from: nearest(path, points[0]),
    }))
    const focus = at ? focusOf(at, folder.children, path) : path.points[0]
    const load = loadOf(folder)
    branches.set(id, {
      id,
      parent,
      load,
      at,
      width: folder.branch.width ?? 2.4 + 0.9 * Math.sqrt(load),
      path,
      limbs,
      focus,
    })
    path.points.forEach(grow)

    for (const child of folder.children) {
      const childId = id === ROOT_ID ? `/${child.name}` : `${id}/${child.name}`
      const isFolder = 'branch' in child || 'grow' in child
      nodes.push({
        id: childId,
        name: child.name,
        kind: isFolder ? 'folder' : 'file',
        parent: id,
        at: child.at,
        label: child.label,
        revealAt: Math.min(nearest(path, child.at) + REVEAL_LAG, path.length),
        data: child.data,
      })
      grow(child.at)
      if ('grow' in child) seeds.set(childId, child)
      else if ('branch' in child) visit(child, childId, id, child.at)
    }
  }

  visit(spec, ROOT_ID, null, null)
  return {
    layout: { rootId: ROOT_ID, branches, nodes, bounds },
    place(id) {
      const seed = seeds.get(id)
      if (!seed) return false
      seeds.delete(id)
      const node = nodes.find((node) => node.id === id)!
      visit({ ...seed, ...seed.grow() }, id, node.parent, seed.at)
      return true
    },
  }
}

function loadOf(folder: FolderSpec<unknown> | SeedSpec<unknown>): number {
  if ('load' in folder) return folder.load
  return folder.children.reduce((count, child) => count + 1 + ('branch' in child || 'grow' in child ? loadOf(child) : 0), 0)
}

/** Frames a folder's icon, its children with their labels, and its branch. */
function focusOf(at: Vec2, children: EntrySpec<unknown>[], path: Polyline): Vec2 {
  let minX = at[0] - 18
  let maxX = at[0] + 18
  let minY = at[1] - 16
  let maxY = at[1] + 16
  for (const child of children) {
    const [x, y] = child.at
    const labelWidth = child.name.length * 8.6 + 8
    if (child.label === 'right') {
      minX = Math.min(minX, x - 18)
      maxX = Math.max(maxX, x + 26 + labelWidth)
      minY = Math.min(minY, y - 16)
      maxY = Math.max(maxY, y + 16)
    } else if (child.label === 'left') {
      minX = Math.min(minX, x - 26 - labelWidth)
      maxX = Math.max(maxX, x + 18)
      minY = Math.min(minY, y - 16)
      maxY = Math.max(maxY, y + 16)
    } else {
      const half = Math.max(18, labelWidth / 2)
      minX = Math.min(minX, x - half)
      maxX = Math.max(maxX, x + half)
      minY = Math.min(minY, y - 16)
      maxY = Math.max(maxY, y + 40)
    }
  }
  // The stretch of branch behind the folder is already on screen; frame what grows ahead of it.
  const start = nearest(path, at)
  for (const [i, [x, y]] of path.points.entries()) {
    if (path.lengths[i] < start) continue
    minX = Math.min(minX, x)
    maxX = Math.max(maxX, x)
    minY = Math.min(minY, y)
    maxY = Math.max(maxY, y)
  }
  // A little above centre, the way the reference frames new growth.
  return [(minX + maxX) / 2, (minY + maxY) / 2 - 35]
}

/** The line a branch draws through its control points: Catmull-Rom, resampled to an even step. */
export function curve(control: readonly Vec2[]): Polyline {
  const dense: Vec2[] = []
  const at = (i: number): Vec2 => {
    if (i < 0) return mirror(control[0], control[1])
    if (i >= control.length) return mirror(control[control.length - 1], control[control.length - 2])
    return control[i]
  }
  for (let i = 0; i < control.length - 1; i++) {
    const p0 = at(i - 1)
    const p1 = at(i)
    const p2 = at(i + 1)
    const p3 = at(i + 2)
    for (let j = 0; j < 16; j++) {
      const t = j / 16
      const t2 = t * t
      const t3 = t2 * t
      const axis = (k: 0 | 1) =>
        0.5 *
        (2 * p1[k] +
          (p2[k] - p0[k]) * t +
          (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 +
          (3 * p1[k] - p0[k] - 3 * p2[k] + p3[k]) * t3)
      dense.push([axis(0), axis(1)])
    }
  }
  dense.push(control[control.length - 1])
  return resample(dense)
}

function mirror(end: Vec2, next: Vec2): Vec2 {
  return [2 * end[0] - next[0], 2 * end[1] - next[1]]
}

function resample(dense: Vec2[]): Polyline {
  const points: Vec2[] = [dense[0]]
  const lengths = [0]
  let travelled = 0
  let nextMark = STEP
  for (let i = 1; i < dense.length; i++) {
    const [ax, ay] = dense[i - 1]
    const [bx, by] = dense[i]
    const segment = Math.hypot(bx - ax, by - ay)
    while (segment > 0 && travelled + segment >= nextMark) {
      const t = (nextMark - travelled) / segment
      points.push([ax + (bx - ax) * t, ay + (by - ay) * t])
      lengths.push(nextMark)
      nextMark += STEP
    }
    travelled += segment
  }
  const last = dense[dense.length - 1]
  if (travelled - lengths[lengths.length - 1] > STEP * 0.25) {
    points.push(last)
    lengths.push(travelled)
  }
  return { points, lengths, length: lengths[lengths.length - 1] }
}

function nearest(path: Polyline, [x, y]: Vec2): number {
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
