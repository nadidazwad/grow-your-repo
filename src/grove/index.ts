// The file tree drawn as a plant: what grows where, and how it moves.
// No three.js here; src/scene draws it and src/garden labels it.
export { createGrove, type Bounds, type Grove } from './grove.ts'
export {
  ROOT_ID,
  type BranchSpec,
  type EntrySpec,
  type FileSpec,
  type FolderSpec,
  type LabelSide,
  type GroveBranch,
  type GroveNode,
  type Limb,
  type Polyline,
  type Vec2,
} from './layout.ts'
export { CELL, pixelGrid, type PixelGrid } from './view.ts'
