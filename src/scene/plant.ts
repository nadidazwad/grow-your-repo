import {
  BufferGeometry,
  Float32BufferAttribute,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  PlaneGeometry,
} from 'three'
import type { Bounds, GroveBranch, Polyline } from '../grove'

// Everything here is in three's frame: x right, y up, z toward the camera.
type V2 = [number, number]
type RGB = readonly [number, number, number]

export interface Plant {
  /** Tubes for the branch, its limbs and twigs. */
  bark: BufferGeometry
  /** Leaves, buds and specks as instanced quads. */
  foliage: InstancedBufferGeometry
}

const BARK: RGB = [0.56, 0.4, 0.28]
const OLIVE_BARK: RGB = [0.52, 0.44, 0.26]
const DARK_BARK: RGB = [0.27, 0.17, 0.12]

const LEAF = {
  lime: [0.6, 0.97, 0.09],
  yellowLime: [0.8, 0.97, 0.24],
  yellow: [0.94, 0.97, 0.2],
  pale: [0.92, 0.97, 0.62],
  olive: [0.56, 0.6, 0.15],
  green: [0.3, 0.76, 0.1],
  deep: [0.17, 0.44, 0.11],
} satisfies Record<string, RGB>

// The odd single leaf along a twig is young growth: bright.
const TIP_LEAVES: [RGB, number][] = [
  [LEAF.lime, 0.26], [LEAF.yellowLime, 0.26], [LEAF.yellow, 0.22], [LEAF.olive, 0.12],
  [LEAF.pale, 0.08], [LEAF.green, 0.06],
]
const SPECKS: [RGB, number][] = [
  [[0.18, 0.45, 0.75], 0.3], [[0.53, 0.81, 0.92], 0.25], [[0.11, 0.25, 0.42], 0.2], [[0.05, 0.04, 0.04], 0.25],
]

/**
 * The plant for one folder's branch. `keepOut` lists world areas (y down)
 * where words sit, such as labels and the masthead: twigs stop short of them.
 */
export function growPlant(branch: GroveBranch, keepOut: Bounds[] = []): Plant {
  const rng = random(branch.id)
  const bark = new BarkBuilder()
  const leaves = new FoliageBuilder()
  const main = toThree(branch.path)
  const length = branch.path.length
  // Foliage finishes filling in as the tip eases to a stop.
  const extent = length - 4
  const isTrunk = branch.parent === null
  // Folder branches thin to a dotted line over their outer third; the trunk stays stout.
  // Where a branch leaves its folder it swells, as if pushing out of the opening.
  const taper = isTrunk ? 0.6 : 1.15
  // Bigger folders push out a fatter base, up to a few dozen entries: past that a crown would swamp the plant.
  const heft = Math.sqrt(Math.min(branch.load, 36))
  const flare = isTrunk ? 0 : 0.6 + 0.45 * heft
  // Every branch, the trunk included, draws down to a fine point over its last third.
  // Clamped: a stick's last step can overshoot its length by a hair, and pow() of a negative is NaN.
  const left = (s: number, of: number) => Math.max(0, 1 - s / of)
  const point = (s: number) => Math.min(1, left(s, length) / 0.35) ** 1.2
  const radius = (s: number) =>
    0.42 + (branch.width * Math.pow(left(s, length), taper) + flare * Math.exp(-s / 14)) * point(s)

  bark.tube(main, {
    radius: (_, s) => radius(s),
    reveal: (_, s) => s,
    color: barkColors(rng, main.points.length),
    sway: () => 0,
    sides: 10,
  })

  // Each sprout remembers where on the branch it starts, so its tip can age with it.
  const sprouts: { line: Line; reveal: (s: number) => number; from: number }[] = []

  for (const limb of branch.limbs) {
    // Keep the traced limb's start, heading and length; grow it with a natural curve.
    const traced = toThree(limb)
    const [start, end] = [traced.points[0], traced.points[traced.points.length - 1]]
    const line = twig(rng, start, normalize([end[0] - start[0], end[1] - start[1]]), limb.length)
    const stretch = fitStretch(limb.from + 15, limb.length, 1.6, extent)
    const reveal = (s: number) => limb.from + 15 + s * stretch
    bark.tube(line, {
      radius: (_, s) => 0.7 * Math.pow(left(s, limb.length), 1.2) + 0.4,
      reveal: (_, s) => reveal(s),
      color: barkColors(rng, line.points.length),
      sway: (_, s) => (0.45 * s) / limb.length,
      sides: 5,
    })
    sprouts.push({ line, reveal, from: limb.from })
  }

  const twigCount = Math.round(length / 110)
  for (let i = 0; i < twigCount; i++) {
    const s = length * (0.1 + 0.85 * rng())
    const frame = frameAt(main, s)
    const side = rng() < 0.55 ? 1 : -1
    const angle = (0.35 + 0.5 * rng()) * side
    const twigLength = (32 + 48 * rng()) * (1 - (0.3 * s) / length)
    const grown = twig(rng, frame.point, rotate(frame.tangent, angle), twigLength)
    const line = shortOf(grown, keepOut)
    const from = s + 18
    const stretch = fitStretch(from, line.length, 2, extent)
    const reveal = (t: number) => from + t * stretch
    // Colours are drawn for the whole twig, so cutting one short leaves the rest of the plant as it was.
    const color = barkColors(rng, grown.points.length)
    const drawn = line.points.length > 2
    if (drawn) {
      bark.tube(line, {
        radius: (_, t) => 0.3 * (1 - t / line.length) + 0.38,
        reveal: (_, t) => reveal(t),
        color,
        sway: (_, t) => (0.5 * t) / line.length,
        sides: 5,
      })
      sprouts.push({ line, reveal, from: s })
    }

    if (rng() < 0.2) {
      const at = line.length * (0.4 + 0.3 * rng())
      const fork = frameAt(line, at)
      const forked = twig(rng, fork.point, rotate(fork.tangent, (0.5 + 0.4 * rng()) * (rng() < 0.5 ? 1 : -1)), twigLength * 0.45)
      const sub = shortOf(forked, keepOut)
      const subFrom = reveal(at) + 10
      const subStretch = fitStretch(subFrom, sub.length, 2, extent)
      const subReveal = (t: number) => subFrom + t * subStretch
      const subColor = barkColors(rng, forked.points.length)
      if (drawn && sub.points.length > 2) {
        bark.tube(sub, {
          radius: (_, t) => 0.15 * (1 - t / sub.length) + 0.36,
          reveal: (_, t) => subReveal(t),
          color: subColor,
          sway: (_, t) => 0.3 + (0.4 * t) / sub.length,
          sides: 4,
        })
        sprouts.push({ line: sub, reveal: subReveal, from: s })
      }
    }
  }

  // Foliage grows in clumps sitting on top of the branch, biggest where the
  // branch leaves its folder and shrinking toward the tip. A folder that holds
  // more pushes out a bigger crown and fuller clumps. The trunk is the root
  // folder's branch: its crown is where it comes in from the left edge.
  if (branch.at) {
    const size = 13 + 4.5 * heft
    // Sits on the folder, its lower edge tucked behind the icon.
    clump(leaves, rng, [branch.at[0] + 2, -branch.at[1] + 15 + size * 0.6], size, {
      z: 8,
      reveal: () => Math.min(extent, 6 + rng() * 45),
    })
  } else {
    const frame = frameAt(main, 70)
    const size = 16 + 2.5 * heft
    clump(leaves, rng, along(frame, radius(70) * 0.3 + size * 0.35), size, {
      z: radius(70) + 0.5,
      reveal: () => Math.min(extent, 70 + rng() * 60),
    })
  }

  // Older growth has started to turn, more of it toward the tips: patches
  // flower sky blue, or near the base fade to a light amber with age. Openings
  // stay fresh, so nothing turns near them. Which way a patch turns comes from
  // its own stream, so the leaves themselves keep their places.
  const fresh = isTrunk ? 240 : 40 + 30 * heft
  const turning = (s: number) => (s > fresh && rng() < 0.15 + 0.35 * (s / length) ? 0.3 + 0.6 * rng() : 0)
  const tint = random(`${branch.id}/tint`)
  const patch = (s: number) => (tint() < 0.35 + 0.5 * (s / length) ? BLOSSOM : AGEING)

  // Clumps scale with the bark they sit on: the trunk carries the biggest.
  const fullest = isTrunk ? 25 : 8 + 4 * heft
  // Clumps dwindle to nothing well before the tip, so branch ends stay bare.
  const leafy = isTrunk ? 0.72 : 0.66
  for (let s = isTrunk ? 90 : 10; s < length * leafy; ) {
    const age = s / length
    // Uneven sizes and heights give the canopy a bumpy, bushy outline.
    const dwindle = Math.min(1, (leafy - age) / 0.2)
    const size = fullest * (1 - 0.8 * age ** 0.7) * (0.6 + 0.8 * rng()) * dwindle
    if (size < 2.5) break
    const frame = frameAt(main, s)
    const r = radius(s)
    const reveal = () => Math.min(extent, s + 10 + rng() * 80)
    const turn = turning(s)
    const ramp = turn > 0 ? patch(s) : undefined
    // In front of the bark, so each clump sits on the branch rather than behind it.
    clump(leaves, rng, along(frame, r * 0.45 + size * (0.25 + 0.35 * rng())), size, {
      z: r + 0.5,
      light: age * 0.15,
      turn,
      ramp,
      reveal,
    })
    // Now and then a smaller clump hangs underneath.
    if (rng() < 0.25) {
      clump(leaves, rng, along(frame, -(r * 0.5 + size * 0.3)), size * 0.55, {
        z: r + 0.5,
        light: age * 0.15 - 0.1,
        turn: turn * 1.2,
        ramp,
        reveal,
      })
    }
    s += size * (1.5 + 0.8 * rng())
  }

  for (let s = 8; s < length * 0.85; s += 9) {
    if (rng() > 0.3) continue
    const frame = frameAt(main, s)
    const side = rng() < 0.5 ? 1 : -1
    const r = radius(s)
    leaves.add({
      at: [frame.point[0] + frame.normal[0] * side * r * 0.9, frame.point[1] + frame.normal[1] * side * r * 0.9],
      z: r + 0.5,
      size: [2.2 + rng(), 2.2 + rng()],
      angle: rng() * Math.PI,
      color: s > fresh && rng() < 0.45 ? shade(0.3 + rng() * 0.6, patch(s)) : pick(rng, SPECKS),
      reveal: Math.min(extent, s + 6),
      phase: rng() * 6.28,
    })
  }

  for (const { line, reveal, from } of sprouts) {
    // Twigs carry the odd leaf along them and a bright bud at the end.
    for (let t = 6; t < line.length * 0.7; t += 7) {
      if (rng() > 0.18) continue
      const frame = frameAt(line, t)
      leaves.add({
        at: [frame.point[0] + (rng() - 0.5) * 3, frame.point[1] + (rng() - 0.5) * 3],
        z: 1 + rng() * 2,
        size: [2.4 + rng() * 1.6, 2.2 + rng() * 1.4],
        angle: rng() * Math.PI,
        color: rng() < 0.25 ? pick(rng, SPECKS) : pick(rng, TIP_LEAVES),
        reveal: Math.min(extent, reveal(t) + 8),
        phase: rng() * 6.28,
      })
    }
    // A single leaf near the end, never a tuft: the tip itself stays bare.
    if (rng() < 0.45) {
      const at = line.length * (0.6 + 0.2 * rng())
      const frame = frameAt(line, at)
      leaves.add({
        at: frame.point,
        z: 2,
        size: [2.6 + rng() * 0.8, 2.2 + rng() * 0.6],
        angle: rng() * Math.PI,
        color: from > fresh && rng() < 0.4 ? shade(0.4 + rng() * 0.5, patch(from)) : shade(0.6 + rng() * 0.35),
        reveal: Math.min(extent, reveal(at) + 8),
        phase: rng() * 6.28,
      })
    }
  }

  return { bark: bark.build(), foliage: leaves.build() }
}

interface Line {
  points: V2[]
  lengths: number[]
  length: number
}

/** A point beside the branch: positive offsets go up the screen. */
function along(frame: ReturnType<typeof frameAt>, offset: number): V2 {
  return [frame.point[0] + frame.normal[0] * offset, frame.point[1] + frame.normal[1] * offset]
}

/**
 * A rounded clump of leaves, lit from above: deep green and olive underneath,
 * lime through the middle, yellow and pale highlights on top. The core is
 * dense; the fringe thins to small leaves that only part-cover their cells, so
 * the edge dithers softly. `turn` (0–1) is how much of it has turned to
 * `ramp`: one side of the clump, cut at a random angle, so it reads as a patch.
 */
function clump(
  leaves: FoliageBuilder,
  rng: () => number,
  [cx, cy]: V2,
  size: number,
  {
    z,
    light = 0,
    turn = 0,
    ramp = BLOSSOM,
    reveal,
  }: { z: number; light?: number; turn?: number; ramp?: Ramp; reveal: () => number },
) {
  const count = Math.round(0.5 * size * size) + 3
  const cut = rng() * Math.PI * 2
  // Some patches are paler than others.
  const pallor = (rng() - 0.3) * 0.5
  for (let i = 0; i < count; i++) {
    const distance = Math.pow(rng(), 0.8)
    const angle = rng() * Math.PI * 2
    const dx = Math.cos(angle) * distance
    const dy = Math.sin(angle) * distance
    const fringe = distance > 0.78
    const leaf = fringe ? 2.4 + rng() * 1.2 : 3.8 + rng() * 2.4
    const height = (dy + 1) / 2
    const turned = turn > 0 && dx * Math.cos(cut) + dy * Math.sin(cut) + (rng() - 0.5) * 0.6 > 1 - 2 * turn
    leaves.add({
      at: [cx + dx * size * 1.15, cy + dy * size * 0.9],
      z: z + rng() * 4,
      size: [leaf, leaf * (0.6 + rng() * 0.4)],
      angle: rng() * Math.PI,
      color: turned
        ? shade(height + pallor + (rng() - 0.5) * 0.24, ramp)
        : shade(height + light + (rng() - 0.5) * 0.24),
      reveal: reveal(),
      phase: rng() * 6.28,
    })
  }
}

type Ramp = [number, RGB][]

const RAMP: Ramp = [
  [0, LEAF.deep],
  [0.25, LEAF.olive],
  [0.45, LEAF.green],
  [0.62, LEAF.lime],
  [0.8, LEAF.yellowLime],
  [0.94, LEAF.yellow],
  [1, LEAF.pale],
]

const BLOSSOM: Ramp = [
  [0, [0.11, 0.25, 0.42]], // navy
  [0.35, [0.18, 0.45, 0.75]], // deep sky
  [0.65, [0.31, 0.64, 0.88]], // cornflower
  [0.85, [0.53, 0.81, 0.92]], // sky
  [1, [0.71, 0.89, 0.97]], // pale sky
]

const AGEING: Ramp = [
  [0, [0.6, 0.42, 0.16]], // ochre
  [0.35, [0.82, 0.6, 0.24]], // amber
  [0.65, [0.93, 0.76, 0.38]], // light amber
  [0.85, [0.97, 0.86, 0.54]], // honey
  [1, [0.98, 0.93, 0.7]], // cream
]

/** Leaf colour by how much light it catches, 0 (shadow) to 1 (highlight). */
function shade(light: number, ramp = RAMP): RGB {
  const t = Math.min(1, Math.max(0, light))
  for (let i = 1; i < ramp.length; i++) {
    const [stop, color] = ramp[i]
    if (t <= stop) {
      const [previous, from] = ramp[i - 1]
      return mix(from, color, (t - previous) / (stop - previous))
    }
  }
  return ramp[ramp.length - 1][1]
}

interface TubeOptions {
  radius: (i: number, s: number) => number
  reveal: (i: number, s: number) => number
  color: (i: number) => RGB
  sway: (i: number, s: number) => number
  sides: number
}

class BarkBuilder {
  private positions: number[] = []
  private normals: number[] = []
  private centers: number[] = []
  private reveals: number[] = []
  private colors: number[] = []
  private sways: number[] = []
  private indices: number[] = []

  tube(line: Line, options: TubeOptions) {
    const { points, lengths } = line
    const { sides } = options
    const base = this.positions.length / 3
    const phase = points[0][0] * 0.13 + points[0][1] * 0.07
    points.forEach((point, i) => {
      const before = points[Math.max(0, i - 1)]
      const after = points[Math.min(points.length - 1, i + 1)]
      const [tx, ty] = normalize([after[0] - before[0], after[1] - before[1]])
      const s = lengths[i]
      const r = options.radius(i, s)
      const color = options.color(i)
      for (let j = 0; j < sides; j++) {
        const theta = (j / sides) * Math.PI * 2
        const nx = -ty * Math.cos(theta)
        const ny = tx * Math.cos(theta)
        const nz = Math.sin(theta)
        this.positions.push(point[0] + nx * r, point[1] + ny * r, nz * r)
        this.normals.push(nx, ny, nz)
        this.centers.push(point[0], point[1], 0)
        this.reveals.push(options.reveal(i, s))
        this.colors.push(...color)
        this.sways.push(options.sway(i, s), phase + s * 0.05)
      }
      if (i === 0) return
      const a = base + (i - 1) * sides
      const b = base + i * sides
      for (let j = 0; j < sides; j++) {
        const k = (j + 1) % sides
        this.indices.push(a + j, a + k, b + j, a + k, b + k, b + j)
      }
    })
  }

  build() {
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new Float32BufferAttribute(this.positions, 3))
    geometry.setAttribute('normal', new Float32BufferAttribute(this.normals, 3))
    geometry.setAttribute('aCenter', new Float32BufferAttribute(this.centers, 3))
    geometry.setAttribute('aReveal', new Float32BufferAttribute(this.reveals, 1))
    geometry.setAttribute('aColor', new Float32BufferAttribute(this.colors, 3))
    geometry.setAttribute('aSway', new Float32BufferAttribute(this.sways, 2))
    geometry.setIndex(this.indices)
    return geometry
  }
}

interface Leaf {
  at: V2
  z: number
  size: V2
  angle: number
  color: RGB
  reveal: number
  phase: number
}

class FoliageBuilder {
  private leaves: Leaf[] = []

  add(leaf: Leaf) {
    this.leaves.push(leaf)
  }

  build() {
    const quad = new PlaneGeometry(1, 1)
    const geometry = new InstancedBufferGeometry()
    geometry.index = quad.index
    geometry.setAttribute('position', quad.getAttribute('position'))
    geometry.setAttribute('uv', quad.getAttribute('uv'))
    const n = this.leaves.length
    const offset = new Float32Array(n * 3)
    const size = new Float32Array(n * 2)
    const angle = new Float32Array(n)
    const color = new Float32Array(n * 3)
    const reveal = new Float32Array(n)
    const phase = new Float32Array(n)
    this.leaves.forEach((leaf, i) => {
      offset.set([leaf.at[0], leaf.at[1], leaf.z], i * 3)
      size.set(leaf.size, i * 2)
      angle[i] = leaf.angle
      color.set(leaf.color, i * 3)
      reveal[i] = leaf.reveal
      phase[i] = leaf.phase
    })
    geometry.setAttribute('iOffset', new InstancedBufferAttribute(offset, 3))
    geometry.setAttribute('iSize', new InstancedBufferAttribute(size, 2))
    geometry.setAttribute('iAngle', new InstancedBufferAttribute(angle, 1))
    geometry.setAttribute('iColor', new InstancedBufferAttribute(color, 3))
    geometry.setAttribute('iReveal', new InstancedBufferAttribute(reveal, 1))
    geometry.setAttribute('iPhase', new InstancedBufferAttribute(phase, 1))
    geometry.instanceCount = n
    quad.dispose()
    return geometry
  }
}

/** Bark is mostly brown, with mossy stretches and the odd dark knot. */
function barkColors(rng: () => number, count: number) {
  const colors: RGB[] = []
  while (colors.length < count) {
    const roll = rng()
    const base = roll < 0.62 ? BARK : roll < 0.88 ? OLIVE_BARK : DARK_BARK
    const run = 1 + Math.floor(rng() * (base === DARK_BARK ? 2 : 6))
    for (let i = 0; i < run; i++) {
      const shade = 0.88 + rng() * 0.2
      colors.push([base[0] * shade, base[1] * shade, base[2] * shade])
    }
  }
  return (i: number) => colors[i]
}

/** World px a twig keeps clear of words. */
const ROOM = 8

/** A twig cut off just before it would first grow into an area it must keep out of. */
function shortOf(line: Line, keepOut: Bounds[]): Line {
  const blocked = ([x, y]: V2) =>
    keepOut.some((box) => x > box.minX - ROOM && x < box.maxX + ROOM && -y > box.minY - ROOM && -y < box.maxY + ROOM)
  const end = line.points.findIndex(blocked)
  if (end === -1) return line
  const kept = Math.max(1, end)
  return { points: line.points.slice(0, kept), lengths: line.lengths.slice(0, kept), length: line.lengths[kept - 1] }
}

/** Slow a sprout's growth so it finishes before its branch stops growing. */
function fitStretch(from: number, length: number, preferred: number, extent: number) {
  return Math.max(0.25, Math.min(preferred, (extent - from) / Math.max(length, 1)))
}

/**
 * A stick that curves like a real one: it bends one way, more toward the tip,
 * wobbles gently along its length, and its tip lifts toward the light.
 */
function twig(rng: () => number, start: V2, direction: V2, length: number): Line {
  const steps = Math.max(6, Math.round(length / 2.5))
  const step = length / steps
  const heading = Math.atan2(direction[1], direction[0])
  const bend = (0.3 + 0.5 * rng()) * (rng() < 0.5 ? 1 : -1)
  const wobble = 0.08 + 0.1 * rng()
  const waves = 1 + rng() * 1.5
  const phase = rng() * Math.PI * 2
  const lift = 0.15 + 0.2 * rng()
  const points: V2[] = [start]
  const lengths = [0]
  for (let i = 1; i <= steps; i++) {
    const t = i / steps
    const angle = heading + bend * t * t + wobble * Math.sin(phase + t * waves * Math.PI * 2)
    const [dx, dy] = normalize([Math.cos(angle), Math.sin(angle) + lift * t])
    const [x, y] = points[i - 1]
    points.push([x + dx * step, y + dy * step])
    lengths.push(i * step)
  }
  return { points, lengths, length }
}

function toThree(line: Polyline): Line {
  return { points: line.points.map(([x, y]) => [x, -y] as V2), lengths: line.lengths, length: line.length }
}

function frameAt(line: Line, s: number) {
  let i = 0
  while (i < line.lengths.length - 1 && line.lengths[i + 1] <= s) i++
  const before = line.points[Math.max(0, i - 1)]
  const after = line.points[Math.min(line.points.length - 1, i + 1)]
  const tangent = normalize([after[0] - before[0], after[1] - before[1]])
  // The normal points up the screen, so "side 1" is the top of the branch.
  let normal: V2 = [-tangent[1], tangent[0]]
  if (normal[1] < 0) normal = [-normal[0], -normal[1]]
  return { point: line.points[i], tangent, normal }
}

function mix(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}

function normalize([x, y]: V2): V2 {
  const length = Math.hypot(x, y) || 1
  return [x / length, y / length]
}

function rotate([x, y]: V2, angle: number): V2 {
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  return [x * c - y * s, x * s + y * c]
}

function pick<T>(rng: () => number, weighted: [T, number][]): T {
  let roll = rng() * weighted.reduce((sum, [, weight]) => sum + weight, 0)
  for (const [value, weight] of weighted) {
    roll -= weight
    if (roll <= 0) return value
  }
  return weighted[weighted.length - 1][0]
}

/** Seeded so each folder grows the same plant every visit. */
function random(seed: string) {
  let h = 1779033703 ^ seed.length
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  let a = h >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
