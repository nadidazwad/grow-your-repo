import { labelArea, type Entry } from '../garden'
import type { Bounds, Grove, GroveBranch, GroveNode, Vec2 } from '../grove'

/** Labels with less breathing room than this from a branch (leaves included) or a twig get flagged. */
const ROOM = { branch: 22, limb: 10 }

export function distance([px, py]: Vec2, box: Bounds) {
  const dx = Math.max(box.minX - px, 0, px - box.maxX)
  const dy = Math.max(box.minY - py, 0, py - box.maxY)
  return Math.hypot(dx, dy)
}

/** The branches that run too close to a node's label. */
export function crowdedBy(node: GroveNode<Entry>, branches: readonly GroveBranch[]): GroveBranch[] {
  const box = labelArea(node, { icon: false })
  // Every icon hangs off its parent's branch, and a folder's own branch leaves from its corner.
  const expected = (branch: GroveBranch, p: Vec2) =>
    (branch.id === node.parent || branch.id === node.id) && Math.hypot(p[0] - node.at[0], p[1] - node.at[1]) < 50
  return branches.filter(
    (branch) =>
      branch.path.points.some((p) => !expected(branch, p) && distance(p, box) < ROOM.branch) ||
      branch.limbs.some((limb) => limb.points.some((p) => distance(p, box) < ROOM.limb)),
  )
}

/** What a visitor would see wrong among what's open: icons or names on each other, or names under branches. */
export function problems(nodes: readonly GroveNode<Entry>[], branches: readonly GroveBranch[]) {
  const found: { ids: string[]; text: string }[] = []
  // What's drawn: the icon and the name. A name hung under its icon leaves the corners beside the icon empty.
  const parts = nodes.map((node) => {
    const [x, y] = node.at
    return [{ minX: x - 18, maxX: x + 18, minY: y - 18, maxY: y + 18 }, labelArea(node, { icon: false })]
  })
  nodes.forEach((node, i) => {
    for (let j = i + 1; j < nodes.length; j++) {
      if (parts[i].some((a) => parts[j].some((b) => overlaps(a, b)))) found.push({ ids: [node.id, nodes[j].id], text: `${node.id} and ${nodes[j].id} overlap` })
    }
    const near = crowdedBy(node, branches)
    if (near.length) found.push({ ids: [node.id], text: `${node.id} is crowded by ${near.map((branch) => branch.id).join(', ')}` })
  })
  return found
}

const overlaps = (a: Bounds, b: Bounds) => a.minX < b.maxX && a.maxX > b.minX && a.minY < b.maxY && a.maxY > b.minY

/**
 * What's on screen once a grove settles: the names showing, and each branch as
 * far as it has grown. Growth lands at once only in a `still` grove.
 */
export function showing<T>(grove: Grove<T>) {
  const growth = () => [...grove.layout.branches.keys()].map((id) => grove.growth(id)).join()
  for (let i = 0, last = ''; i < 500 && growth() !== last; i++) {
    last = growth()
    grove.step(1 / 60)
  }
  const nodes = grove.layout.nodes.filter((node) => grove.isVisible(node.id))
  const branches = [...grove.layout.branches.values()].flatMap((branch): GroveBranch[] => {
    const grown = grove.growth(branch.id)
    if (grown <= 0) return []
    const end = branch.path.lengths.findIndex((length) => length > grown)
    if (end === -1) return [branch]
    const path = { points: branch.path.points.slice(0, end), lengths: branch.path.lengths.slice(0, end), length: grown }
    return [{ ...branch, path, limbs: branch.limbs.filter((limb) => limb.from <= grown) }]
  })
  return { nodes, branches }
}
