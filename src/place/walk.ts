import type { Vec2 } from '../grove'

/** World px per step of the walk. */
const STEP = 6
/** The most a branch turns in one step: it never bends tighter than about a 75 px radius. */
const TURN = 0.08
/** How far ahead the walk looks for trouble, in steps of `LOOK` px. */
const AHEAD = 5
const LOOK = 15

export interface Walk {
  start: Vec2
  /** Heading at the start, in radians with y down: −π/2 is straight up. */
  heading: number
  /** The heading it wants `s` px along. It turns toward it no faster than a branch bends. */
  want(s: number): number
  length: number
  /** What it costs to be at a point `s` px along: 0 when it's in the clear. */
  cost(point: Vec2, s: number): number
}

/**
 * Grows a branch step by step, the way a stem finds light: it leaves at its
 * own heading, turns toward the one it wants as fast as a branch bends, and
 * steers around whatever `cost` says is in the way, looking a little ahead.
 * Returns the points it passed, `STEP` px apart, and how much it paid.
 */
export function walk({ start, heading, want, length, cost }: Walk) {
  const points: Vec2[] = [start]
  let [x, y] = start
  let angle = heading
  let paid = 0
  for (let s = STEP; s <= length; s += STEP) {
    const wanted = want(s)
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

/**
 * The headings a branch wants along its length, drawn the way the hand-placed
 * ones go: it runs out of its folder, then alternates between climbing and
 * running on, each for a stretch, rising overall.
 */
export function gestures(rng: () => number, { out, run, climb, from }: { out: number; run: [number, number]; climb: [number, number]; from: number }) {
  const turns: { at: number; heading: number }[] = [{ at: 0, heading: out }]
  let at = from
  // After a steep start it levels off first; after a shallow one it climbs.
  let climbing = out > (run[1] + climb[0]) / 2
  while (at < 6000) {
    const [low, high] = climbing ? climb : run
    turns.push({ at, heading: low + (high - low) * rng() })
    at += climbing ? 70 + rng() * 110 : 110 + rng() * 170
    climbing = !climbing
  }
  return (s: number) => {
    let i = 0
    while (i < turns.length - 1 && turns[i + 1].at <= s) i++
    return turns[i].heading
  }
}

/** Every `every` px of a walk, ending on its last point: control points for the grove's curve. */
export function thin(points: readonly Vec2[], every: number): Vec2[] {
  const step = Math.max(1, Math.round(every / STEP))
  const kept = points.filter((_, i) => i % step === 0)
  if (kept[kept.length - 1] !== points[points.length - 1]) kept.push(points[points.length - 1])
  return kept
}
