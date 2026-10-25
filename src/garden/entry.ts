import type { GlyphName } from '../icons'

/** What the garden needs to show a node and open it; the grove only carries it. */
export type Entry =
  | {
      kind: 'folder'
      /** A second, quieter line under the folder's name. */
      note?: string
    }
  | {
      kind: 'file'
      /** Where opening it goes, in a new tab. */
      href: string
      /** A text file unless said otherwise. */
      glyph?: GlyphName
    }
