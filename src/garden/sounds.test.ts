import { describe, expect, it } from 'vitest'
import { createGrove, type FolderSpec, type Grove } from '../grove'
import type { Cue, PlayOptions } from '../sound'
import type { Entry } from './entry.ts'
import { listenForSounds } from './sounds.ts'

// Root ─┬─ a/ ─┬─ b.png
//       │      ├─ c.png
//       │      ├─ d.md
//       │      └─ f/ ── g.png
//       └─ e.txt
const file: Entry = { kind: 'file', href: 'https://github.com' }

const tree: FolderSpec<Entry> = {
  name: 'Root',
  branch: { width: 4, path: [[0, 0], [100, 0], [200, 0]] },
  children: [
    {
      name: 'a',
      at: [50, -20],
      label: 'right',
      data: { kind: 'folder' },
      branch: { path: [[55, -100], [60, -200], [65, -300]] },
      children: [
        { name: 'b.png', at: [60, -100], label: 'right', data: file },
        { name: 'c.png', at: [62, -200], label: 'right', data: file },
        { name: 'd.md', at: [64, -290], label: 'right', data: file },
        {
          name: 'f',
          at: [58, -150],
          label: 'left',
          data: { kind: 'folder' },
          branch: { path: [[20, -160], [-40, -170]] },
          children: [{ name: 'g.png', at: [-30, -180], label: 'left', data: file }],
        },
      ],
    },
    { name: 'e.txt', at: [180, 10], label: 'right', data: file },
  ],
}

function settle(grove: Grove<Entry>, seconds = 4) {
  for (let t = 0; t < seconds; t += 1 / 60) grove.step(1 / 60)
}

function listening() {
  const grove = createGrove(tree)
  settle(grove)
  const heard: [Cue, PlayOptions | undefined][] = []
  listenForSounds(grove, (cue, options) => heard.push([cue, options]))
  return { grove, heard, cues: () => heard.map(([cue]) => cue) }
}

describe('the plant’s sounds', () => {
  it('knocks once as a folder opens, then climbs a note for each name that grows in', () => {
    const { grove, heard, cues } = listening()
    grove.open('/a')
    settle(grove)
    expect(cues()).toEqual(['open', 'sprout', 'sprout', 'sprout', 'sprout'])
    // A folder one level down starts one note up.
    expect(heard.slice(1).map(([, options]) => options?.step)).toEqual([1, 2, 3, 4])
  })

  it('knocks once as a branch goes back in, however many names and open folders it takes with it', () => {
    const { grove, cues } = listening()
    grove.open('/a/f')
    settle(grove)
    const before = cues().length
    grove.close('/a')
    settle(grove)
    expect(cues().slice(before)).toEqual(['close'])
  })
})
