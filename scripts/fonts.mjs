// The fonts are licensed to the site, not to everyone who clones this public repo, so
// they live in a private one and a build pulls whatever public/fonts/ is missing.
// FONTS_TOKEN (FONT_TOKEN works too): a GitHub token that can read FONTS_REPO's contents (set it in Vercel).
// Without one, a local build goes ahead on fallback fonts; a Vercel build stops.
import { access, mkdir, readFile, writeFile } from 'node:fs/promises'

const REPO = process.env.FONTS_REPO ?? 'nadidazwad/garden-fonts'
const dir = new URL('../public/fonts/', import.meta.url)
const css = await readFile(new URL('../src/styles/fonts.css', import.meta.url), 'utf8')
const files = [...css.matchAll(/url\('\/fonts\/([^']+)'\)/g)].map(([, file]) => file)

const missing = []
for (const file of files) {
  await access(new URL(file, dir)).catch(() => missing.push(file))
}
if (!missing.length) process.exit(0)

const token = process.env.FONTS_TOKEN || process.env.FONT_TOKEN
if (!token) {
  // Names only, never values: enough to spot a typo or a variable scoped to another environment.
  const near = Object.keys(process.env).filter((name) => /font/i.test(name))
  const seen = near.length ? `This build sees ${near.join(', ')}.` : `No font variable reached this build${process.env.VERCEL_ENV ? ` (${process.env.VERCEL_ENV})` : ''}.`
  console.warn(`fonts: missing ${missing.join(', ')}. Put them in public/fonts/, or set FONTS_TOKEN to pull them from ${REPO}. ${seen}`)
  process.exit(process.env.VERCEL ? 1 : 0)
}

await mkdir(dir, { recursive: true })
for (const file of missing) {
  const response = await fetch(`https://api.github.com/repos/${REPO}/contents/${file}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.raw' },
  })
  if (!response.ok) {
    console.error(`fonts: ${file} came back ${response.status} from ${REPO}`)
    process.exit(1)
  }
  await writeFile(new URL(file, dir), Buffer.from(await response.arrayBuffer()))
  console.log(`fonts: pulled ${file}`)
}
