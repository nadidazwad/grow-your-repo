import type { Bounds, GroveNode } from '../grove'
import type { Entry } from './entry.ts'

/** Average glyph widths, in world px, of a name (16 px) and a folder's note (12.5 px). */
const NAME_EM = 8.4
const NOTE_EM = 6.3

/**
 * Roughly where a node's icon, name and note sit, in world px. Estimated from
 * average glyph widths rather than measured, so it works before fonts load and
 * away from the page: the plant uses it to keep twigs off words.
 */
export function labelArea(node: GroveNode<Entry>, { icon: withIcon = true } = {}): Bounds {
  const [x, y] = node.at
  const name = (node.name.length + (node.kind === 'folder' ? 2 : 0)) * NAME_EM
  const note = node.data?.kind === 'folder' && node.data.note ? node.data.note.length * NOTE_EM : 0
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
