import type { Bounds, GroveNode } from '../grove'
import { nameOf, type Entry } from './entry.ts'

/** PP Neue Montreal's advance for each printable ASCII character, ' ' to '~', at 16 px: a name's size. Measured. */
const ADVANCE = [
  3.42, 3.49, 5.04, 9.6, 9.5, 13.78, 9.66, 2.72, 4.22, 4.22, 7.23, 8.83, 3.12, 5.63, 3.07, 6.1, 9.95, 5.2, 8.94, 9.55, 9.18, 9.12,
  9.38, 8.18, 9.57, 9.41, 3.15, 3.09, 8.14, 8.78, 8.14, 7.84, 13.92, 10.32, 10.56, 11.25, 11.06, 9.79, 9.2, 11.71, 11.36, 3.81,
  8.08, 10.22, 8.86, 13.5, 11.31, 12.42, 9.79, 12.42, 10.34, 10.03, 9.54, 10.98, 9.92, 14.69, 9.3, 10.05, 9.63, 4.46, 6.13, 4.46,
  7.6, 9.12, 3.49, 8.3, 8.98, 8.43, 8.98, 8.7, 4.4, 8.99, 8.53, 3.14, 3.14, 7.68, 3.14, 12.77, 8.53, 8.94, 8.98, 8.98, 5.39, 7.73,
  4.78, 8.53, 7.6, 11.95, 7.63, 7.87, 7.22, 4.64, 3.49, 4.64, 6.86,
]
/** Anything else, an accented or a CJK letter, counts as a wide one. */
const WIDE = 16
/** A folder's note is set smaller than its name. */
const NOTE_SIZE = 12.5 / 16

/** How wide words are at a name's size, in world px. */
function widthOf(text: string) {
  let width = 0
  for (const character of text) {
    const code = character.codePointAt(0)!
    width += code >= 32 && code < 127 ? ADVANCE[code - 32] : WIDE
  }
  return width
}

/**
 * Where a node's icon, name and note sit, in world px. Worked out from the
 * font's measured advances rather than from the page, so it works before fonts
 * load and away from the page: placement keeps words apart with it, and the
 * plant keeps twigs off them.
 */
export function labelArea(node: Pick<GroveNode<Entry>, 'name' | 'kind' | 'at' | 'label' | 'data'>, { icon: withIcon = true } = {}): Bounds {
  const [x, y] = node.at
  // A little to spare, as a browser rounds its own way.
  const name = widthOf(nameOf(node)) + 4
  const note = node.data?.kind === 'folder' && node.data.note ? widthOf(node.data.note) * NOTE_SIZE + 4 : 0
  const width = Math.max(name, note)
  const depth = note ? 26 : 10
  const icon = { minX: x - 18, maxX: x + 18, minY: y - 18, maxY: y + 18 }
  const label =
    node.label === 'right'
      ? { minX: x + 22, maxX: x + 22 + width, minY: y - 10, maxY: y + depth }
      : node.label === 'left'
        ? { minX: x - 22 - width, maxX: x - 22, minY: y - 10, maxY: y + depth }
        : { minX: x - width / 2, maxX: x + width / 2, minY: y + 20, maxY: y + 30 + depth }
  if (!withIcon) return label
  return {
    minX: Math.min(icon.minX, label.minX),
    maxX: Math.max(icon.maxX, label.maxX),
    minY: Math.min(icon.minY, label.minY),
    maxY: Math.max(icon.maxY, label.maxY),
  }
}
