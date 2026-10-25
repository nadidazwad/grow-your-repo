import type { Bounds, Vec2 } from '../grove'

const CELL = 32

/** Points and boxes to keep clear of, bucketed so "how far is the nearest one" stays cheap. */
export class Field {
  private cells = new Map<number, { points: Vec2[]; boxes: Bounds[] }>()

  addPoints(points: readonly Vec2[]) {
    for (const point of points) this.cell(key(cellOf(point[0]), cellOf(point[1]))).points.push(point)
  }

  addBox(box: Bounds) {
    for (let cx = cellOf(box.minX); cx <= cellOf(box.maxX); cx++) {
      for (let cy = cellOf(box.minY); cy <= cellOf(box.maxY); cy++) this.cell(key(cx, cy)).boxes.push(box)
    }
  }

  /** Distance from a point to the nearest thing, or `reach` if nothing is nearer. */
  distance([x, y]: Vec2, reach: number) {
    return this.nearest({ minX: x, maxX: x, minY: y, maxY: y }, reach)
  }

  /** Distance from a box to the nearest thing, or `reach` if nothing is nearer; 0 if they overlap. */
  nearest(box: Bounds, reach: number) {
    let best = reach
    for (let cx = cellOf(box.minX - reach); cx <= cellOf(box.maxX + reach); cx++) {
      for (let cy = cellOf(box.minY - reach); cy <= cellOf(box.maxY + reach); cy++) {
        const cell = this.cells.get(key(cx, cy))
        if (!cell) continue
        for (const [px, py] of cell.points) {
          const dx = Math.max(box.minX - px, 0, px - box.maxX)
          const dy = Math.max(box.minY - py, 0, py - box.maxY)
          if (dx < best && dy < best) best = Math.min(best, Math.hypot(dx, dy))
        }
        for (const other of cell.boxes) {
          const dx = Math.max(box.minX - other.maxX, 0, other.minX - box.maxX)
          const dy = Math.max(box.minY - other.maxY, 0, other.minY - box.maxY)
          if (dx < best && dy < best) best = Math.min(best, Math.hypot(dx, dy))
        }
        if (best === 0) return 0
      }
    }
    return best
  }

  private cell(at: number) {
    let cell = this.cells.get(at)
    if (!cell) this.cells.set(at, (cell = { points: [], boxes: [] }))
    return cell
  }
}

const cellOf = (v: number) => Math.floor(v / CELL)
// Room for ±2^20 cells each way, far beyond any plant.
const key = (cx: number, cy: number) => (cx + 1048576) * 2097152 + (cy + 1048576)
