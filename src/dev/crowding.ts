import { labelArea, type Entry } from '../garden'
import type { Bounds, GroveBranch, GroveNode, Vec2 } from '../grove'

/** Labels with less breathing room than this from a branch (leaves included) or a twig get flagged. */
const ROOM = { branch: 22, limb: 10 }

export function distance([px, py]: Vec2, box: Bounds) {
  const dx = Math.max(box.minX - px, 0, px - box.maxX)
  const dy = Math.max(box.minY - py, 0, py - box.maxY)
  return Math.hypot(dx, dy)
}

/** The branches that run too close to a node's label. */
export function crowdedBy(node: GroveNode<Entry>, branches: GroveBranch[]): GroveBranch[] {
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

/** What a visitor would see wrong among what's open: labels on each other, or under branches. */
export function problems(nodes: GroveNode<Entry>[], branches: GroveBranch[]) {
  const found: { ids: string[]; text: string }[] = []
  const areas = nodes.map((node) => labelArea(node))
  nodes.forEach((node, i) => {
    for (let j = i + 1; j < nodes.length; j++) {
      if (overlaps(areas[i], areas[j])) found.push({ ids: [node.id, nodes[j].id], text: `${node.id} and ${nodes[j].id} overlap` })
    }
    const near = crowdedBy(node, branches)
    if (near.length) found.push({ ids: [node.id], text: `${node.id} is crowded by ${near.map((branch) => branch.id).join(', ')}` })
  })
  return found
}

const overlaps = (a: Bounds, b: Bounds) => a.minX < b.maxX && a.maxX > b.minX && a.minY < b.maxY && a.maxY > b.minY
