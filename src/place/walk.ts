import type { Vec2 } from '../grove'

/** World px per step of the walk. */
const STEP = 6
/** The most a branch turns in one step: it never bends tighter than about a 75 px radius. */
const TURN = 0.08
/** How far ahead the walk looks for trouble, in steps of `LOOK` px. */
const AHEAD = 6
const LOOK = 18

export interface Walk {
  start: Vec2
  /** Heading at the start, in radians with y down: −π/2 is straight up. */
  heading: number
  /** The heading it wants `s` px along. It turns toward it no faster than a branch bends. */
  want: Gestures
  length: number
  /** What it costs to be at a point `s` px along: 0 when it's in the clear. */
  cost(point: Vec2, s: number): number
  /** Walls it turns back from when it comes within `margin` of one, on to its next gesture, rather than run up along it. */
  bounce?: { walls: readonly [number, number]; margin: number }
}

/**
 * Grows a branch step by step, the way a stem finds light: it leaves at its
 * own heading, turns toward the one it wants as fast as a branch bends, and
 * steers around whatever `cost` says is in the way, looking a little ahead.
 * Returns the points it passed, `STEP` px apart, and how much it paid.
 */
export function walk({ start, heading, want, length, cost, bounce }: Walk) {
  const points: Vec2[] = [start]
  let [x, y] = start
  let angle = heading
  let paid = 0
  // How far ahead of the branch its gestures run, having skipped those that headed into a wall.
  let skipped = 0
  for (let s = STEP; s <= length; s += STEP) {
    let wanted = want(s + skipped)
    if (bounce) {
      const [left, right] = bounce.walls
      const into = Math.cos(wanted) < 0 ? x - left : right - x
      if (into < bounce.margin && s + skipped >= want.from) {
        skipped = Math.max(skipped, want.next(s + skipped) - s)
        wanted = want(s + skipped)
      }
    }
    let best = angle
    let bestCost = Infinity
    for (let k = -2; k <= 2; k++) {
      const a = angle + (k / 2) * TURN
      let c = 2.5 * (a - wanted) ** 2
      for (let i = 1; i <= AHEAD; i++) {
        const ahead: Vec2 = [x + Math.cos(a) * LOOK * i, y + Math.sin(a) * LOOK * i]
        c += cost(ahead, s + LOOK * i) * (1.4 - i / AHEAD)
      }
      if (c < bestCost) {
        bestCost = c
        best = a
      }
    }
    angle = best
    x += Math.cos(angle) * STEP
    y += Math.sin(angle) * STEP
    points.push([x, y])
    paid += cost([x, y], s)
  }
  return { points, paid }
}

/** A stretch of a branch: which way it heads, and for how long, each picked from a range. */
export interface Gesture {
  heading: [number, number]
  length: [number, number]
}

/** The heading a branch wants `s` px along, from its gestures. */
export interface Gestures {
  (s: number): number
  /** Where it first starts to sway. */
  from: number
  /** Where the gesture after the one `s` px along starts. */
  next(s: number): number
}

/** A single heading held all the way. */
export const steady = (heading: number): Gestures => Object.assign(() => heading, { from: Infinity, next: () => Infinity })

/**
 * The headings a branch wants along its length, drawn the way the hand-placed
 * ones go: it runs out of its folder for a stretch, then alternates between
 * two gestures, such as climbing and running on, starting with whichever turns
 * it away from the way it set out, or with the other if `flip`.
 */
export function gestures(rng: () => number, out: number, from: number, pair: [Gesture, Gesture], { flip = false } = {}): Gestures {
  const turns: { at: number; heading: number }[] = [{ at: 0, heading: out }]
  const middle = ({ heading: [low, high] }: Gesture) => (low + high) / 2
  let next = Math.abs(middle(pair[0]) - out) >= Math.abs(middle(pair[1]) - out) !== flip ? 0 : 1
  for (let at = from; at < 6000; next = 1 - next) {
    const { heading, length } = pair[next]
    turns.push({ at, heading: heading[0] + (heading[1] - heading[0]) * rng() })
    at += length[0] + (length[1] - length[0]) * rng()
  }
  const index = (s: number) => {
    let i = 0
    while (i < turns.length - 1 && turns[i + 1].at <= s) i++
    return i
  }
  return Object.assign((s: number) => turns[index(s)].heading, {
    from,
    next: (s: number) => turns[Math.min(index(s) + 1, turns.length - 1)].at,
  })
}

/** Every `every` px of a walk, ending on its last point: control points for the grove's curve. */
export function thin(points: readonly Vec2[], every: number): Vec2[] {
  const step = Math.max(1, Math.round(every / STEP))
  const kept = points.filter((_, i) => i % step === 0)
  if (kept[kept.length - 1] !== points[points.length - 1]) kept.push(points[points.length - 1])
  return kept
}
