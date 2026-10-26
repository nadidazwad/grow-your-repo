// Pixel icons drawn on the same grid as the dithered plant: one icon pixel is
// one cell. Hovering lifts a glyph with a one-pixel shadow down and to the left.

const FOLDER = `
.####.......
#....#......
#.....#####.
#..........#
#..........#
#..........#
#..........#
#..........#
#..........#
.##########.
`

const OPEN_FOLDER = `
.###...........
#..############
#.#...........#
#.#..........#.
#.#..........#.
##..........#..
##..........#..
##.........#...
#..........#...
###########....
`

const TEXT = `
######...
#....##..
#....#.#.
#....####
#.###...#
#.......#
#.#####.#
#.......#
#.#####.#
#.......#
#.###...#
#########
`

const PAGE = `
######...
#....##..
#....#.#.
#....####
#.......#
#.####..#
#.####..#
#.......#
#.#####.#
#.......#
#.####..#
#########
`

/** Source code: a pair of angle brackets over a short line. */
const CODE = `
######...
#....##..
#....#.#.
#....####
#.......#
#..#.#..#
#.#...#.#
#..#.#..#
#.......#
#.###...#
#.......#
#########
`

/** Data and settings: rows of keys and values. */
const DATA = `
######...
#....##..
#....#.#.
#....####
#.......#
#.##.##.#
#.......#
#.##.##.#
#.......#
#.##.##.#
#.......#
#########
`

const PICTURE = `
######...
#....##..
#....#.#.
#....####
#.......#
#.##....#
#.##..#.#
#....####
#...#####
#..######
#.#######
#########
`

const FILM = `
######...
#....##..
#....#.#.
#....####
#.......#
#..#....#
#..##...#
#..###..#
#..##...#
#..#....#
#.......#
#########
`

const LINK = `
######...
#....##..
#....#.#.
#....####
#.......#
#..####.#
#....##.#
#...#.#.#
#..#..#.#
#.#.....#
#.......#
#########
`

/** The contact folder: a folder with a face on it, smiling. */
const HELLO = `
.####.......
#....#......
#.....#####.
#..........#
#...#..#...#
#..........#
#..#....#..#
#...####...#
#..........#
.##########.
`

/** The same face winking, while the pointer is on it. */
const HELLO_WINK = `
.####.......
#....#......
#.....#####.
#..........#
#..##..#...#
#..........#
#..#....#..#
#...####...#
#..........#
.##########.
`

/** Open, the face leans back with the flap. */
const HELLO_OPEN = `
.###...........
#..############
#.#...........#
#.#..#..#....#.
#.#..........#.
##..#....#..#..
##...####...#..
##.........#...
#..........#...
###########....
`

const CLOSE = `
#.....#
.#...#.
..#.#..
...#...
..#.#..
.#...#.
#.....#
`

const LIST = `
#.#######
.........
#.#######
.........
#.#######
`

const CARDS = `
###.###
###.###
###.###
.......
###.###
###.###
###.###
`

const CHEVRONS = `
..#...#..
.#.....#.
#.......#
.#.....#.
..#...#..
`

const FULLSCREEN = `
###..###
#......#
#......#
........
........
#......#
#......#
###..###
`

const ARROW_LEFT = `
...#.....
..#......
.#.......
#########
.#.......
..#......
...#.....
`

const ARROW_RIGHT = `
.....#...
......#..
.......#.
#########
.......#.
......#..
.....#...
`

export type GlyphName =
  | 'folder'
  | 'openFolder'
  | 'text'
  | 'page'
  | 'code'
  | 'data'
  | 'picture'
  | 'film'
  | 'link'
  | 'hello'
  | 'helloWink'
  | 'helloOpen'
  | 'close'
  | 'list'
  | 'cards'
  | 'chevrons'
  | 'fullscreen'
  | 'arrowLeft'
  | 'arrowRight'

export interface Glyph {
  /** Size in icon pixels, with room for the shadow so hovering doesn't shift layout. */
  width: number
  height: number
  /** SVG path data, one unit per icon pixel. */
  outline: string
  /** The inside of the outline, painted in the page colour so the plant doesn't show through. */
  fill: string
  shadow: string
}

export const glyphs: Record<GlyphName, Glyph> = {
  folder: compile(FOLDER),
  openFolder: compile(OPEN_FOLDER),
  text: compile(TEXT),
  page: compile(PAGE),
  code: compile(CODE),
  data: compile(DATA),
  picture: compile(PICTURE),
  film: compile(FILM),
  link: compile(LINK),
  hello: compile(HELLO),
  helloWink: compile(HELLO_WINK),
  helloOpen: compile(HELLO_OPEN),
  close: compile(CLOSE),
  list: compile(LIST),
  cards: compile(CARDS),
  chevrons: compile(CHEVRONS),
  fullscreen: compile(FULLSCREEN),
  arrowLeft: compile(ARROW_LEFT),
  arrowRight: compile(ARROW_RIGHT),
}

function compile(art: string): Glyph {
  const rows = art.trim().split('\n')
  const width = rows[0].length + 1
  const height = rows.length + 1
  // The glyph sits one pixel in from the left so its shadow fits.
  const on = (x: number, y: number) => rows[y]?.[x - 1] === '#'
  const inside = interior(rows)
  const outline: [number, number][] = []
  const fill: [number, number][] = []
  const shadow: [number, number][] = []
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (on(x, y)) outline.push([x, y])
      else if (inside.has(`${x - 1},${y}`)) fill.push([x, y])
      else if (on(x + 1, y - 1)) shadow.push([x, y])
    }
  }
  return { width, height, outline: toPath(outline), fill: toPath(fill), shadow: toPath(shadow) }
}

/** Cells enclosed by the outline, so the shadow only falls outside it. */
function interior(rows: string[]) {
  const width = rows[0].length
  const height = rows.length
  const outside = new Set<string>()
  const queue: [number, number][] = [[-1, -1]]
  while (queue.length) {
    const [x, y] = queue.pop()!
    const key = `${x},${y}`
    if (x < -1 || y < -1 || x > width || y > height || outside.has(key)) continue
    if (rows[y]?.[x] === '#') continue
    outside.add(key)
    queue.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1])
  }
  const inside = new Set<string>()
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (rows[y][x] !== '#' && !outside.has(`${x},${y}`)) inside.add(`${x},${y}`)
    }
  }
  return inside
}

function toPath(cells: [number, number][]) {
  return cells.map(([x, y]) => `M${x} ${y}h1v1h-1z`).join('')
}
