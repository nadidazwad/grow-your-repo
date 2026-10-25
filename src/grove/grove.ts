import { layout, ROOT_ID, type FolderSpec, type GroveNode, type Layout, type Vec2 } from './layout.ts'

const INTRO_DELAY = 0.35
/** Retracting is quick: the branch snaps back into its folder. */
const RETRACT_SPEED = 2400
/** The camera eases toward where it's headed; fitted to the reference recording. */
const CAMERA_RATE = 3.4
/** How quickly a flung view slows down, per second. */
const FRICTION = 5
/** How much of the trunk's base sits off the left edge of the view. */
const TRUNK_TUCK = 48
/** Breathing room kept around the plant when it spills past the view. */
const MARGIN = 60

/** Growing is quick off the mark and slows gently into the tip. */
const growTime = (distance: number) => Math.min(1.6, 0.6 + distance / 1000)
const easeOut = (x: number) => 1 - (1 - x) ** 3

export interface Grove<T = unknown> {
  readonly layout: Layout<T>
  /** Bumps whenever a node shows or hides, a folder icon opens or closes, panning turns on or off, or the location moves. */
  readonly version: number
  /** The open file, or else the folder opened last; `/` when nothing is. Node ids are paths, so this is one too. */
  readonly location: string
  /** Centre of the view, in world px. */
  readonly camera: Vec2
  /** Nodes currently showing. */
  readonly count: number
  /** True once the plant spills past the view; until then it all stays in view and the view stays put. */
  readonly canPan: boolean
  /** Skip easing: growth and pans land at once. */
  readonly still: boolean
  growth(branchId: string): number
  isVisible(nodeId: string): boolean
  /** True while a folder's branch is out, including while it retracts. */
  isOpen(folderId: string): boolean
  /** True from the moment a folder opens until it's closed: where it's headed, not what's drawn. */
  isExpanded(folderId: string): boolean
  /** Opens a folder (and the folders it's in), or a file; either way it becomes the location. */
  open(id: string): void
  /** Closes a folder and everything open inside it, or puts a file down. The location steps back out if it was inside. */
  close(id: string): void
  toggle(folderId: string): void
  /**
   * Shows a path, as a link or the back button asks: opens the folders on the way, closes the
   * rest, and opens the file if it is one. Folders grow in turn, each once its own folder shows.
   * An unknown path goes to the nearest folder that exists. `whole` opens every folder inside a
   * folder too, and frames as much of all that as fits, the folder itself kept in view.
   */
  go(path: string, options?: { whole?: boolean }): void
  pan(dx: number, dy: number): void
  /** Let go of a drag: the view glides on at this velocity (world px/s) and slows to a stop. */
  fling(vx: number, vy: number): void
  /** The visible area in world px. The trunk enters from its left edge. */
  setView(width: number, height: number): void
  step(dt: number): void
  /** Called when `version` changes. */
  subscribe(listener: () => void): () => void
  /** Called after every step, for anything that follows the camera. */
  onFrame(listener: () => void): () => void
}

export interface Bounds {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

interface Options {
  /** Skip easing: growth and pans land at once. */
  still?: boolean
  /** The visible area in world px to open on, so the first frame is already framed. */
  view?: Vec2
  /**
   * World y of the ground the plant stands on. The opening view rests its
   * bottom edge on it, and the view never sinks below it.
   */
  ground?: number
  /** The plant fits the width of the view, so the view only moves up and down. */
  fitWidth?: boolean
  /** World px the view can rise above the plant, clear of anything pinned to the top of the screen. */
  headroom?: number
  /**
   * Opening a folder closes any open sibling, so siblings can grow into the
   * same room. The newly opened branch waits until the old one is back in.
   */
  exclusive?: boolean
}

export function createGrove<T>(
  spec: FolderSpec<T>,
  { still = false, view: openingView = [864, 545], ground, fitWidth = false, headroom = MARGIN, exclusive = false }: Options = {},
): Grove<T> {
  const world = layout(spec)
  const nodes = new Map<string, GroveNode<T>>(world.nodes.map((node) => [node.id, node]))
  // Children before parents, so a retracting branch sees its children's final growth.
  const deepestFirst = [...world.branches.values()].reverse()
  const childFolders = new Map<string, GroveNode<T>[]>()
  for (const node of world.nodes) {
    if (node.kind !== 'folder') continue
    childFolders.set(node.parent, [...(childFolders.get(node.parent) ?? []), node])
  }

  const growth = new Map<string, number>([...world.branches.keys()].map((id) => [id, 0]))
  const tweens = new Map<string, { from: number; start: number; duration: number }>()
  const expanded = new Set<string>([ROOT_ID])
  const visible = new Set<string>()
  const openIcons = new Set<string>()
  const listeners = new Set<() => void>()
  const frameListeners = new Set<() => void>()
  let camera: Vec2 = [0, 0]
  let target: Vec2 = [0, 0]
  let view = openingView
  let glide: Vec2 = [0, 0]
  let focused = ROOT_ID
  // Whether the focused folder was opened with everything inside it.
  let wholly = false
  let location = ROOT_ID
  let moved = false
  let bounds: Bounds = { minX: 0, maxX: 0, minY: 0, maxY: 0 }
  let spill = { x: false, y: false }
  let canPan = false
  let clock = 0
  let version = 0

  // The camera never shows where the trunk starts: the plant always enters from the left edge.
  const leftmost = () => world.branches.get(ROOT_ID)!.focus[0] + TRUNK_TUCK + view[0] / 2

  /** Folders inside a folder, at any depth. */
  const foldersIn = (id: string) => [...world.branches.keys()].filter((branch) => branch.startsWith(`${id}/`))

  /** The middle of everything a folder holds, opened all the way down. */
  const middleOf = (id: string): Vec2 => {
    let [minX, minY, maxX, maxY] = [Infinity, Infinity, -Infinity, -Infinity]
    for (const branch of [id, ...foldersIn(id)]) {
      for (const [x, y] of world.branches.get(branch)!.path.points) {
        ;[minX, minY, maxX, maxY] = [Math.min(minX, x), Math.min(minY, y), Math.max(maxX, x), Math.max(maxY, y)]
      }
    }
    for (const node of world.nodes) {
      if (!node.id.startsWith(`${id}/`)) continue
      const [x, y] = node.at
      ;[minX, minY, maxX, maxY] = [Math.min(minX, x), Math.min(minY, y), Math.max(maxX, x), Math.max(maxY, y)]
    }
    return [(minX + maxX) / 2, (minY + maxY) / 2]
  }

  const focusOn = (id: string): Vec2 => {
    if (id === ROOT_ID) return [leftmost(), ground === undefined ? 0 : ground - view[1] / 2]
    const [x, y] = wholly ? middleOf(id) : world.branches.get(id)!.focus
    // Keep the opened folder itself in view, however the view is shaped.
    const [fx, fy] = nodes.get(id)!.at
    const reachX = view[0] / 2 - 48
    const reachY = view[1] / 2 - 40
    return [
      Math.max(leftmost(), Math.min(fx + reachX, Math.max(fx - reachX, x))),
      Math.min(fy + reachY, Math.max(fy - reachY, y)),
    ]
  }

  // Where growth is headed: an open folder's branch grows to its tip, a closed one back to nothing.
  const intended = (id: string) => (expanded.has(id) ? world.branches.get(id)!.path.length : 0)

  /** What the plant will cover once growth settles, labels included. */
  const measure = (): Bounds => {
    const box = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity }
    const add = (x: number, y: number) => {
      box.minX = Math.min(box.minX, x)
      box.maxX = Math.max(box.maxX, x)
      box.minY = Math.min(box.minY, y)
      box.maxY = Math.max(box.maxY, y)
    }
    for (const branch of world.branches.values()) {
      const g = intended(branch.id)
      // A closed folder's branch isn't there at all, not even its first point.
      if (g === 0) continue
      const { points, lengths } = branch.path
      for (let i = 0; i < points.length && lengths[i] <= g; i++) add(points[i][0], points[i][1])
    }
    // Everything down to the ground stays in reach.
    if (ground !== undefined) box.maxY = Math.max(box.maxY, ground - MARGIN)
    for (const node of world.nodes) {
      if (intended(node.parent) < node.revealAt) continue
      const [x, y] = node.at
      const label = node.name.length * 9
      if (node.label === 'right') {
        add(x - 20, y - 20)
        add(x + 28 + label, y + 20)
      } else if (node.label === 'left') {
        add(x - 28 - label, y - 20)
        add(x + 20, y + 20)
      } else {
        add(x - Math.max(20, label / 2), y - 20)
        add(x + Math.max(20, label / 2), y + 44)
      }
    }
    return box
  }

  /**
   * Where the camera may sit, per axis. If the plant spills past the view, the
   * view can roam over it but not off it; if it fits, the view keeps all of it
   * in sight. Either way the trunk enters from the left edge, and the view
   * stays above the ground.
   */
  const cameraRange = () => {
    const [halfW, halfH] = [view[0] / 2, view[1] / 2]
    const right = bounds.maxX + MARGIN - halfW
    const top = bounds.minY - headroom + halfH
    const bottom = bounds.maxY + MARGIN - halfH
    const [low, high] = top <= bottom ? [top, bottom] : [bottom, top]
    const floor = ground === undefined ? Infinity : ground - halfH
    return {
      x: [leftmost(), fitWidth ? leftmost() : Math.max(leftmost(), right)] as const,
      y: [Math.min(low, floor), Math.min(high, floor)] as const,
      spills: { x: !fitWidth && right > leftmost() + 1, y: top < bottom - 1 },
    }
  }

  const clamp = (value: number, [low, high]: readonly [number, number]) => Math.min(high, Math.max(low, value))

  const panTo = (x: number, y: number): Vec2 => {
    const range = cameraRange()
    return [spill.x ? clamp(x, range.x) : camera[0], spill.y ? clamp(y, range.y) : camera[1]]
  }

  // Re-frame whenever what's open or the view changes.
  const reframe = () => {
    bounds = measure()
    const range = cameraRange()
    spill = range.spills
    const [x, y] = focusOn(focused)
    target = [clamp(x, range.x), clamp(y, range.y)]
  }

  reframe()
  camera = target

  const moveTo = (id: string) => {
    if (id === location) return
    location = id
    moved = true
  }

  const open = (id: string) => {
    const node = nodes.get(id)
    if (!node) return
    moveTo(id)
    if (node.kind === 'folder' && !expanded.has(id)) {
      for (let at: GroveNode<T> | undefined = node; at; at = nodes.get(at.parent)) {
        if (exclusive) closeSiblings(at)
        expanded.add(at.id)
      }
      focused = id
      wholly = false
      reframe()
      glide = [0, 0]
    }
    refresh()
  }

  const close = (id: string) => {
    const node = nodes.get(id)
    if (!node) return
    if (location === id || location.startsWith(`${id}/`)) moveTo(node.parent)
    if (node.kind === 'folder' && expanded.has(id)) {
      for (const folder of expanded) {
        if (folder === id || folder.startsWith(`${id}/`)) expanded.delete(folder)
      }
      focused = node.parent
      wholly = false
      reframe()
      glide = [0, 0]
    }
    refresh()
  }

  const closeSiblings = (node: GroveNode<T>) => {
    for (const sibling of childFolders.get(node.parent) ?? []) {
      if (sibling === node) continue
      for (const folder of expanded) {
        if (folder === sibling.id || folder.startsWith(`${sibling.id}/`)) expanded.delete(folder)
      }
    }
  }

  // An exclusive sibling still on its way back in.
  const siblingOut = (id: string) =>
    (childFolders.get(nodes.get(id)!.parent) ?? []).some(
      (sibling) => sibling.id !== id && !expanded.has(sibling.id) && (growth.get(sibling.id) ?? 0) > 0,
    )

  // A closing branch can't retract past a child folder whose branch is still out.
  const floorOf = (id: string) => {
    let floor = 0
    for (const child of childFolders.get(id) ?? []) {
      if ((growth.get(child.id) ?? 0) > 0) floor = Math.max(floor, child.revealAt)
    }
    return floor
  }

  const refresh = () => {
    let changed = moved
    moved = false
    for (const node of world.nodes) {
      const show = (growth.get(node.parent) ?? 0) >= node.revealAt
      if (show !== visible.has(node.id)) {
        if (show) visible.add(node.id)
        else visible.delete(node.id)
        changed = true
      }
      if (node.kind === 'folder') {
        const looksOpen = expanded.has(node.id) || (growth.get(node.id) ?? 0) > 0
        if (looksOpen !== openIcons.has(node.id)) {
          if (looksOpen) openIcons.add(node.id)
          else openIcons.delete(node.id)
          changed = true
        }
      }
    }
    if ((spill.x || spill.y) !== canPan) {
      canPan = spill.x || spill.y
      changed = true
    }
    if (changed) {
      version++
      listeners.forEach((listener) => listener())
    }
  }

  return {
    layout: world,
    still,
    get version() {
      return version
    },
    get camera() {
      return camera
    },
    get count() {
      return visible.size
    },
    get canPan() {
      return canPan
    },
    growth: (id) => growth.get(id) ?? 0,
    isVisible: (id) => visible.has(id),
    isOpen: (id) => openIcons.has(id),
    isExpanded: (id) => expanded.has(id),

    get location() {
      return location
    },

    open,
    close,

    toggle(id) {
      if (expanded.has(id)) close(id)
      else open(id)
    },

    go(path, { whole = false } = {}) {
      let id = path.length > 1 ? path.replace(/\/+$/, '') : ROOT_ID
      if (!id.startsWith('/')) id = `/${id}`
      while (id !== ROOT_ID && !nodes.has(id)) id = id.slice(0, id.lastIndexOf('/')) || ROOT_ID
      const node = nodes.get(id)
      const folder = !node ? ROOT_ID : node.kind === 'folder' ? id : node.parent
      const onTheWay = new Set([ROOT_ID])
      for (let at = nodes.get(folder); at; at = nodes.get(at.parent)) onTheWay.add(at.id)
      wholly = whole && node?.kind === 'folder'
      if (wholly) for (const inside of foldersIn(folder)) onTheWay.add(inside)
      for (const folder of expanded) if (!onTheWay.has(folder)) expanded.delete(folder)
      for (const folder of onTheWay) expanded.add(folder)
      focused = folder
      moveTo(id)
      reframe()
      glide = [0, 0]
      refresh()
    },

    pan(dx, dy) {
      glide = [0, 0]
      if (!canPan) return
      camera = target = panTo(camera[0] + dx, camera[1] + dy)
    },

    fling(vx, vy) {
      glide = still || !canPan ? [0, 0] : [vx, vy]
    },

    setView(width, height) {
      view = [width, height]
      reframe()
      if (clock === 0) camera = target
      refresh()
    },

    step(dt) {
      clock += dt
      for (const branch of deepestFirst) {
        const end = branch.path.length
        let g = growth.get(branch.id)!
        if (expanded.has(branch.id)) {
          if (branch.id === ROOT_ID && clock < INTRO_DELAY && !still) continue
          // A deep link opens folders that haven't grown in yet; each waits for its own folder to show.
          if (branch.id !== ROOT_ID && !visible.has(branch.id)) continue
          if (exclusive && branch.id !== ROOT_ID && siblingOut(branch.id)) continue
          if (still) g = end
          else if (g < end) {
            let tween = tweens.get(branch.id)
            if (!tween) {
              tween = { from: g, start: clock - dt, duration: growTime(end - g) }
              tweens.set(branch.id, tween)
            }
            g = tween.from + (end - tween.from) * easeOut(Math.min(1, (clock - tween.start) / tween.duration))
          }
        } else {
          tweens.delete(branch.id)
          if (g > 0) {
            const floor = floorOf(branch.id)
            g = still ? floor : Math.max(floor, g - RETRACT_SPEED * dt)
          }
        }
        growth.set(branch.id, g)
      }

      if (glide[0] || glide[1]) {
        const free: Vec2 = [camera[0] + glide[0] * dt, camera[1] + glide[1] * dt]
        camera = target = panTo(free[0], free[1])
        // Hitting an edge stops the glide along that axis.
        const slow = Math.exp(-FRICTION * dt)
        glide = [camera[0] === free[0] ? glide[0] * slow : 0, camera[1] === free[1] ? glide[1] * slow : 0]
        if (Math.hypot(glide[0], glide[1]) < 6) glide = [0, 0]
      } else {
        const follow = still ? 1 : 1 - Math.exp(-CAMERA_RATE * dt)
        camera = [camera[0] + (target[0] - camera[0]) * follow, camera[1] + (target[1] - camera[1]) * follow]
      }

      refresh()
      frameListeners.forEach((listener) => listener())
    },

    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },

    onFrame(listener) {
      frameListeners.add(listener)
      return () => frameListeners.delete(listener)
    },
  }
}
