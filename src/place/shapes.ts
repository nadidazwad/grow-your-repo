import type { Bounds, Vec2 } from '../grove'
import type { Gesture } from './walk.ts'

/** A layout for one shape of screen: the view it's drawn for, where the ground is, which way the plant grows, and where the name stands. */
export interface Shape {
  /** The view it's drawn for, in world px: the screen scales to fit it, within limits. */
  frame: { width: number; height: number; minScale: number; maxScale: number }
  /** The plant fits the width of the view, so the view only moves up and down. */
  fitWidth: boolean
  /** Entries one branch carries; the rest wait on a node at its tip that grows them a branch of their own. */
  batch: number
  /** About how far along a branch its entries spread out, all told: fewer entries sit further apart. */
  spread: number
  /** A branch carries its files first and its folders toward its tip. */
  foldersLast: boolean
  /**
   * Opening a folder draws the branch it hangs on back to it, so what hangs
   * further along folds away and the folder's own branch climbs on into the
   * room it leaves: placed for the grove's `foldAway`.
   */
  foldAway: boolean
  /** World px the view can rise above the plant. */
  headroom?: number
  ground: number
  /** Words stay between these: the view never goes further left, nor on a phone further right. */
  left: number
  right: number
  /** Branches stay between these, leaving room for the words either side of them. */
  walls: [number, number]
  /** A branch that comes this close to a wall turns back, on to its next gesture, rather than run up along it. */
  bounce?: number
  /** How far a folder's way out leans up, past facing out from the branch it hangs on. */
  lift: number
  trunk: {
    start: Vec2
    heading: number
    /** How far it runs at its own heading before it starts to sway. */
    straight: number
    /** It's at least this long, however little it carries. */
    length: number
    sway: [Gesture, Gesture]
  }
  /** The two ways a folder's branch alternates between, by whether it hangs below a branch running sideways. */
  sway(below: boolean): [Gesture, Gesture]
  /** Where the repo's name stands on the ground, and the line of words above it. `single` keeps it on one line, as while it's being typed. */
  name(text: string, single?: boolean): Name
}

export interface Name {
  /** Type size, in world px. */
  size: number
  /** The name's lines: on a phone, the owner over the repo. */
  lines: string[]
  /** World y the last line stands on; descenders reach down to the ground. */
  baseline: number
  /** Baseline to baseline, in world px. */
  leading: number
  /** From the top of the line above the name to the ground: names stay out of it. */
  box: Bounds
  /** The line of words above the name: twigs stay out of it too. */
  line: Bounds
}

/** PP Mondwest's advance, in ems a character, with a little to spare: wide letters run over the average. */
const MONDWEST = 0.5
/** PP Mondwest's capitals and ascenders, in ems above the baseline; its descenders reach a quarter em below. */
const ASCENT = 0.66
const DESCENT = 0.26

const WIDE_GROUND = 400
const WIDE_LEFT = -404

/** A desktop: the opening view spans x −432 to 848 and stands on the ground; the plant spreads right and up. */
export const wide: Shape = {
  frame: { width: 1280, height: 800, minScale: 0.6, maxScale: 1.3 },
  fitWidth: false,
  batch: 15,
  spread: 1100,
  foldersLast: false,
  foldAway: false,
  ground: WIDE_GROUND,
  left: -420,
  right: Infinity,
  walls: [-420, Infinity],
  lift: 0,
  trunk: {
    start: [-480, 40],
    heading: -0.3,
    straight: 40,
    length: 780,
    sway: [
      { heading: [0.12, 0.4], length: [110, 280] },
      { heading: [-0.42, -0.18], length: [70, 180] },
    ],
  },
  sway: (below) =>
    below
      ? [
          { heading: [0.05, 0.35], length: [110, 280] },
          { heading: [-0.35, -0.05], length: [70, 180] },
        ]
      : [
          { heading: [-0.3, 0.12], length: [110, 280] },
          { heading: [-1.15, -0.7], length: [70, 180] },
        ],
  name(text) {
    // As big as fits the opening view, up to a size that still leaves the sky to the plant.
    const size = Math.min(150, 1180 / (MONDWEST * Math.max(text.length, 10)))
    const baseline = WIDE_GROUND - DESCENT * size
    const top = baseline - ASCENT * size
    const line = { minX: WIDE_LEFT, maxX: WIDE_LEFT + 460, minY: top - 62, maxY: top - 14 }
    const right = Math.max(line.maxX, WIDE_LEFT + MONDWEST * size * text.length)
    return { size, lines: [text], baseline, leading: size, line, box: { minX: WIDE_LEFT, maxX: right, minY: line.minY, maxY: WIDE_GROUND } }
  },
}

const TALL_WIDTH = 420
const TALL_LEFT = 24

/**
 * A phone, held upright: x 0 to 420, standing on the ground at y 0. The name
 * stacks up from the ground with its line above it; the trunk enters from the
 * left above them and climbs like a vine, and every branch zigzags up between
 * the edges, into sky nothing else uses. Taller screens show more of it.
 */
export const tall: Shape = {
  frame: { width: TALL_WIDTH, height: 700, minScale: 0.6, maxScale: 1.3 },
  fitWidth: true,
  // A narrow screen has room for fewer along each branch.
  batch: 8,
  spread: 560,
  foldersLast: true,
  foldAway: true,
  headroom: 110,
  ground: 0,
  left: 6,
  right: TALL_WIDTH - 6,
  walls: [44, TALL_WIDTH - 44],
  // Each branch sweeps across the column and back, as the hand-placed ones do, so long names find room by a wall.
  bounce: 40,
  // Up a column, a folder's branch climbs out of it rather than run off sideways over its own name.
  lift: 1,
  trunk: {
    start: [-48, -290],
    heading: -0.05,
    straight: 300,
    length: 520,
    sway: [
      { heading: [-2.55, -2.2], length: [120, 210] },
      { heading: [-0.95, -0.6], length: [120, 210] },
    ],
  },
  sway: () => [
    { heading: [-2.55, -2.2], length: [260, 460] },
    { heading: [-0.95, -0.6], length: [260, 460] },
  ],
  name(text, single = false) {
    const cut = text.indexOf('/')
    const lines = single || cut === -1 ? [text] : [text.slice(0, cut + 1), text.slice(cut + 1)]
    const longest = Math.max(...lines.map((line) => line.length), 6)
    const size = Math.min(84, (TALL_WIDTH - 2 * TALL_LEFT) / (MONDWEST * longest))
    const leading = 0.84 * size
    const baseline = -DESCENT * size
    const top = baseline - (lines.length - 1) * leading - ASCENT * size
    const line = { minX: TALL_LEFT, maxX: TALL_WIDTH - TALL_LEFT, minY: top - 78, maxY: top - 12 }
    return { size, lines, baseline, leading, line, box: { minX: TALL_LEFT, maxX: TALL_WIDTH - TALL_LEFT, minY: line.minY, maxY: 0 } }
  },
}
