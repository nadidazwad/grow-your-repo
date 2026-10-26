import type { Bounds, Vec2 } from '../grove'

/** Grid cells, in world px. */
const CELL = 20
/** Sky this clear of everything counts as open. */
const OPEN = 140
/** A route out keeps this clear of everything, so it never runs under a name. */
const NARROWEST = 30

interface Room {
  /** Where the grid covers. */
  area: Bounds

  words: Bounds[]
  paths: Vec2[]
  /** Branches don't go past these. */
  walls: [number, number]
  floor: number
}

/**
 * How far each spot is from open sky, going round the words and branches
 * already there and never squeezing past them: the way out of a crowd. A
 * branch that follows it downhill leaves a crowd by the shortest clear route.
 * Zero out in the open, and outside the area it covers.
 */
export function routesOut({ area, words, paths, walls, floor }: Room): (point: Vec2) => number {
  const columns = Math.ceil((area.maxX - area.minX) / CELL)
  const rows = Math.ceil((area.maxY - area.minY) / CELL)
  const cells = columns * rows
  const column = (x: number) => Math.floor((x - area.minX) / CELL)
  const row = (y: number) => Math.floor((y - area.minY) / CELL)

  // How far each cell is from anything, in px: words, branches, the walls and the ground.
  const clearance = new Float32Array(cells).fill(Infinity)
  const fill = (minC: number, maxC: number, minR: number, maxR: number) => {
    for (let r = Math.max(0, minR); r <= Math.min(rows - 1, maxR); r++) {
      for (let c = Math.max(0, minC); c <= Math.min(columns - 1, maxC); c++) clearance[r * columns + c] = 0
    }
  }
  for (const box of words) fill(column(box.minX), column(box.maxX), row(box.minY), row(box.maxY))
  for (const [x, y] of paths) fill(column(x), column(x), row(y), row(y))
  fill(-1, column(walls[0]) - 1, 0, rows)
  fill(column(walls[1]) + 1, columns, 0, rows)
  fill(0, columns, row(floor) + 1, rows)
  chamfer(clearance, columns, rows)

  // From open sky back through every cell clear enough to pass.
  const out = new Float32Array(cells).fill(Infinity)
  const queue: number[] = []
  for (let i = 0; i < cells; i++) {
    if (clearance[i] >= OPEN) {
      out[i] = 0
      queue.push(i)
    }
  }
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head]
    const c = i % columns
    const r = (i - c) / columns
    for (const [dc, dr, step] of NEIGHBOURS) {
      const nc = c + dc
      const nr = r + dr
      if (nc < 0 || nr < 0 || nc >= columns || nr >= rows) continue
      const n = nr * columns + nc
      if (clearance[n] < NARROWEST || out[n] <= out[i] + step) continue
      out[n] = out[i] + step
      queue.push(n)
    }
  }

  // Cells too tight to pass, or with no way out, count as far as anything in the area could be.
  const far = Math.hypot(area.maxX - area.minX, area.maxY - area.minY)
  return ([x, y]) => {
    const c = column(x)
    const r = row(y)
    if (c < 0 || r < 0 || c >= columns || r >= rows) return 0
    const known = out[r * columns + c]
    return known === Infinity ? far : known
  }
}

const NEIGHBOURS = [
  [1, 0, CELL],
  [-1, 0, CELL],
  [0, 1, CELL],
  [0, -1, CELL],
  [1, 1, CELL * Math.SQRT2],
  [1, -1, CELL * Math.SQRT2],
  [-1, 1, CELL * Math.SQRT2],
  [-1, -1, CELL * Math.SQRT2],
] as const

/** Distances from the zeroed cells, near enough: two passes of a 3-4 chamfer, in px. */
function chamfer(d: Float32Array, columns: number, rows: number) {
  const straight = CELL
  const diagonal = CELL * 1.4
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < columns; c++) {
      const i = r * columns + c
      if (c > 0) d[i] = Math.min(d[i], d[i - 1] + straight)
      if (r > 0) {
        d[i] = Math.min(d[i], d[i - columns] + straight)
        if (c > 0) d[i] = Math.min(d[i], d[i - columns - 1] + diagonal)
        if (c < columns - 1) d[i] = Math.min(d[i], d[i - columns + 1] + diagonal)
      }
    }
  }
  for (let r = rows - 1; r >= 0; r--) {
    for (let c = columns - 1; c >= 0; c--) {
      const i = r * columns + c
      if (c < columns - 1) d[i] = Math.min(d[i], d[i + 1] + straight)
      if (r < rows - 1) {
        d[i] = Math.min(d[i], d[i + columns] + straight)
        if (c < columns - 1) d[i] = Math.min(d[i], d[i + columns + 1] + diagonal)
        if (c > 0) d[i] = Math.min(d[i], d[i + columns - 1] + diagonal)
      }
    }
  }
}
