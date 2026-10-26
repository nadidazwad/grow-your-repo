import type { GlyphName } from '../icons'

// Which glyph a file wears, by its name: prose, code, data and settings, pictures, films; plain text otherwise.

const PICTURES = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'svg', 'ico', 'bmp', 'tif', 'tiff', 'heic'])
const FILMS = new Set(['mp4', 'mov', 'webm', 'mkv', 'avi', 'm4v'])
const PROSE = new Set(['md', 'mdx', 'markdown', 'rst', 'adoc'])
const DATA = new Set(['json', 'jsonc', 'json5', 'yaml', 'yml', 'toml', 'ini', 'cfg', 'conf', 'env', 'lock', 'xml', 'csv', 'tsv', 'plist', 'properties'])
const CODE = new Set([
  'ts', 'tsx', 'mts', 'cts', 'js', 'jsx', 'mjs', 'cjs', 'py', 'rb', 'go', 'rs', 'java', 'kt', 'kts', 'swift', 'c', 'h', 'cc', 'cpp',
  'hpp', 'cs', 'fs', 'php', 'scala', 'sh', 'bash', 'zsh', 'fish', 'ps1', 'lua', 'dart', 'ex', 'exs', 'erl', 'hs', 'ml', 'clj',
  'vue', 'svelte', 'astro', 'css', 'scss', 'sass', 'less', 'html', 'htm', 'sql', 'r', 'jl', 'zig', 'nim', 'wgsl', 'glsl',
])
/** Files known by name alone. */
const NAMED: Record<string, GlyphName> = {
  readme: 'page',
  license: 'page',
  licence: 'page',
  changelog: 'page',
  contributing: 'page',
  authors: 'page',
  notice: 'page',
  makefile: 'code',
  dockerfile: 'code',
  gemfile: 'code',
  rakefile: 'code',
}

export function glyphOf(name: string): GlyphName {
  const lower = name.toLowerCase()
  const dot = lower.lastIndexOf('.')
  const stem = dot > 0 ? lower.slice(0, dot) : lower
  const extension = dot > 0 ? lower.slice(dot + 1) : ''
  if (NAMED[stem] && (!extension || PROSE.has(extension) || extension === 'txt')) return NAMED[stem]
  if (PICTURES.has(extension)) return 'picture'
  if (FILMS.has(extension)) return 'film'
  if (PROSE.has(extension)) return 'page'
  if (CODE.has(extension)) return 'code'
  // Settings files are mostly dotfiles: .gitignore, .npmrc, .editorconfig.
  if (DATA.has(extension) || dot === 0) return 'data'
  return 'text'
}
