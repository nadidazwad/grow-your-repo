import type { GlyphName } from '../icons'

/** What the garden needs to show a node and open it; the grove only carries it. */
export type Entry =
  | {
      kind: 'folder'
      /** A second, quieter line under the folder's name. */
      note?: string
      /** Shown instead of the name, as by the node holding the rest of a big folder. */
      title?: string
      /** It holds the rest of a big folder: drawn as a folder with dots. */
      rest?: boolean
    }
  | {
      kind: 'file'
      /** Where opening it goes, in a new tab. */
      href: string
      /** A text file unless said otherwise. */
      glyph?: GlyphName
    }

/** What a node's label reads: a folder's name ends in a slash. */
export function nameOf(node: { name: string; kind: 'folder' | 'file'; data?: Entry }) {
  if (node.data?.kind === 'folder' && node.data.title) return node.data.title
  return node.kind === 'folder' ? `${node.name}/` : node.name
}
