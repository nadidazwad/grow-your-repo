import { describe, expect, it } from 'vitest'
import { createGrove, type FolderSpec, type Grove } from '.'

// Root ─┬─ a/ ── b/ ── c.txt
//       └─ d.txt
const tree: FolderSpec = {
  name: 'Root',
  branch: { width: 4, path: [[0, 0], [100, 0], [200, 0]] },
  children: [
    {
      name: 'a',
      at: [50, -20],
      label: 'right',
      branch: { path: [[55, -100], [50, -200]] },
      children: [
        {
          name: 'b',
          at: [70, -100],
          label: 'right',
          branch: { path: [[150, -100], [250, -100]] },
          children: [{ name: 'c.txt', at: [200, -90], label: 'right' }],
        },
      ],
    },
    { name: 'd.txt', at: [180, 10], label: 'right' },
  ],
}

function settle(grove: Grove, seconds = 6) {
  for (let t = 0; t < seconds; t += 1 / 60) grove.step(1 / 60)
}

describe('grove', () => {
  it('grows the top level, then a folder’s children when it opens', () => {
    const grove = createGrove(tree)
    settle(grove)
    expect(grove.count).toBe(2)
    expect(grove.isVisible('/a/b')).toBe(false)

    grove.toggle('/a')
    expect(grove.isOpen('/a')).toBe(true)
    settle(grove)
    expect(grove.isVisible('/a/b')).toBe(true)
    expect(grove.count).toBe(3)
  })

  it('grows a folder’s branch out of the folder, apart from its parent’s branch', () => {
    const grove = createGrove(tree)
    const [x, y] = grove.layout.branches.get('/a')!.path.points[0]
    expect(Math.hypot(x - 50, y + 20)).toBeLessThan(20)
    // The trunk runs along y = 0; the new branch doesn't reach back to it.
    expect(Math.max(...grove.layout.branches.get('/a')!.path.points.map(([, py]) => py))).toBeLessThan(-20)
  })

  it('grows stouter branches from folders that hold more', () => {
    const { branches } = createGrove(tree).layout
    expect(branches.get('/a')!.load).toBe(2)
    expect(branches.get('/a/b')!.load).toBe(1)
    expect(branches.get('/a')!.width).toBeGreaterThan(branches.get('/a/b')!.width)
  })

  it('closing a folder retracts its open descendants first', () => {
    const grove = createGrove(tree)
    settle(grove)
    grove.toggle('/a')
    settle(grove)
    grove.toggle('/a/b')
    settle(grove)
    expect(grove.count).toBe(4)

    grove.toggle('/a')
    const gone = new Map<string, number>()
    for (let frame = 0; frame < 600; frame++) {
      grove.step(1 / 60)
      for (const id of ['/a/b/c.txt', '/a/b']) {
        if (!gone.has(id) && !grove.isVisible(id)) gone.set(id, frame)
      }
      // A branch never floats without its folder, and a folder looks open until its branch is gone.
      if (grove.growth('/a/b') > 0) expect(grove.isVisible('/a/b')).toBe(true)
      if (grove.isVisible('/a/b')) expect(grove.isOpen('/a')).toBe(true)
    }

    expect(gone.get('/a/b/c.txt')!).toBeLessThan(gone.get('/a/b')!)
    expect(grove.isOpen('/a')).toBe(false)
    expect(grove.isOpen('/a/b')).toBe(false)
    expect(grove.count).toBe(2)
  })

  it('grows fast at first, eases into the tip, and snaps back quickly', () => {
    const grove = createGrove(tree)
    settle(grove)
    const length = grove.layout.branches.get('/a')!.path.length
    grove.toggle('/a')
    const grown: number[] = []
    for (let frame = 0; frame < 120; frame++) {
      grove.step(1 / 60)
      grown.push(grove.growth('/a'))
    }
    // A tenth of a second in, a good stretch is already out...
    expect(grown[5]).toBeGreaterThan(length * 0.25)
    // ...and it reaches the tip barely moving.
    const done = grown.findIndex((g) => g >= length)
    expect(done).toBeGreaterThan(0)
    expect(grown[done] - grown[done - 6]).toBeLessThan(length * 0.02)

    grove.toggle('/a')
    settle(grove, 0.2)
    expect(grove.growth('/a')).toBe(0)
  })

  it('keeps the trunk entering from the left edge, and only pans once the plant outgrows the view', () => {
    const grove = createGrove(tree)
    grove.setView(1600, 900)
    // The trunk starts at x = 0 and a little of its base stays tucked off screen.
    const leftEdge = (width: number) => grove.camera[0] - width / 2
    expect(leftEdge(1600)).toBeGreaterThan(0)
    expect(leftEdge(1600)).toBeLessThan(80)

    settle(grove)
    expect(grove.canPan).toBe(false)
    const before = grove.camera
    grove.pan(120, 80)
    expect(grove.camera).toEqual(before)

    grove.setView(160, 120)
    grove.toggle('/a')
    settle(grove)
    expect(grove.canPan).toBe(true)
    const [x] = grove.camera
    grove.pan(40, 0)
    expect(grove.camera[0]).toBeCloseTo(x + 40)

    // Dragging or flinging toward the wall stops at it.
    grove.pan(-500, 0)
    expect(leftEdge(160)).toBeGreaterThan(0)
    grove.pan(60, 0)
    grove.fling(-4000, 0)
    settle(grove, 2)
    expect(leftEdge(160)).toBeGreaterThan(0)
    expect(leftEdge(160)).toBeLessThan(80)
  })

  it('stands the opening view on the ground, and never lets it sink below', () => {
    const grove = createGrove(tree, { ground: 100 })
    const bottomEdge = (height: number) => grove.camera[1] + height / 2
    grove.setView(1600, 400)
    expect(bottomEdge(400)).toBeCloseTo(100)
    grove.setView(1600, 700)
    expect(bottomEdge(700)).toBeCloseTo(100)

    // Opened up and spilling past a short view, it can be dragged up, but not underground.
    grove.setView(400, 160)
    settle(grove)
    grove.toggle('/a')
    settle(grove)
    expect(grove.canPan).toBe(true)
    grove.pan(0, -500)
    expect(bottomEdge(160)).toBeLessThan(100)
    grove.pan(0, 2000)
    expect(bottomEdge(160)).toBeCloseTo(100)
  })

  it('opens already framed for the view it is given, before any frame steps', () => {
    const grove = createGrove(tree, { ground: 100, view: [1600, 400] })
    expect(grove.camera[1] + 400 / 2).toBeCloseTo(100)
    expect(grove.camera[0] - 1600 / 2).toBeGreaterThan(0)
    expect(grove.camera[0] - 1600 / 2).toBeLessThan(80)
  })

  it('can keep the plant to the width of the view, so the view only moves up and down', () => {
    const grove = createGrove(tree, { ground: 100, fitWidth: true, headroom: 90 })
    grove.setView(160, 120)
    settle(grove)
    const [x] = grove.camera
    grove.toggle('/a')
    grove.toggle('/a/b')
    settle(grove)
    expect(grove.canPan).toBe(true)
    grove.pan(300, -200)
    expect(grove.camera[0]).toBe(x)
    // As high as it goes, the top of the view sits the headroom above the plant's top.
    grove.pan(0, -2000)
    const top = Math.min(...[...grove.layout.branches.values()].flatMap((branch) => branch.path.points.map(([, y]) => y)))
    expect(grove.camera[1] - 60).toBeLessThanOrEqual(top - 90 + 1)
  })

  it('can let only one sibling folder be open, growing it once the other is back in', () => {
    // Root ─┬─ a/ ── b/ ── c.txt
    //       └─ e/ ── f.txt
    const siblings: FolderSpec = {
      ...tree,
      children: [
        tree.children[0],
        { name: 'e', at: [150, -20], label: 'right', branch: { path: [[155, -100], [150, -200]] }, children: [{ name: 'f.txt', at: [150, -150], label: 'right' }] },
      ],
    }
    const grove = createGrove(siblings, { exclusive: true })
    settle(grove)
    grove.open('/a/b')
    settle(grove)
    expect(grove.isVisible('/a/b/c.txt')).toBe(true)

    grove.open('/e')
    for (let frame = 0; frame < 600; frame++) {
      grove.step(1 / 60)
      if (grove.growth('/a') > 0) expect(grove.growth('/e')).toBe(0)
    }
    expect(grove.isOpen('/a')).toBe(false)
    expect(grove.isOpen('/a/b')).toBe(false)
    expect(grove.isVisible('/e/f.txt')).toBe(true)
  })

  it('can fold away what hangs past an open folder, and grow it back once that folder closes', () => {
    // Root ── a/ ─┬─ x.txt
    //             ├─ b/ ── c.txt
    //             └─ y.txt
    const climbing: FolderSpec = {
      ...tree,
      children: [
        {
          name: 'a',
          at: [50, -20],
          label: 'right',
          branch: { path: [[55, -100], [50, -200], [55, -300]] },
          children: [
            { name: 'x.txt', at: [80, -80], label: 'right' },
            { name: 'b', at: [30, -150], label: 'left', branch: { path: [[-50, -200], [-60, -300]] }, children: [{ name: 'c.txt', at: [-40, -250], label: 'right' }] },
            { name: 'y.txt', at: [80, -260], label: 'right' },
          ],
        },
      ],
    }
    const grove = createGrove(climbing, { exclusive: true, foldAway: true })
    grove.open('/a')
    settle(grove)
    expect(grove.isVisible('/a/y.txt')).toBe(true)

    grove.open('/a/b')
    for (let frame = 0; frame < 600; frame++) {
      grove.step(1 / 60)
      // b/ only grows once what hangs past it has folded away.
      if (grove.isVisible('/a/y.txt')) expect(grove.growth('/a/b')).toBe(0)
    }
    expect(grove.isVisible('/a/x.txt')).toBe(true)
    expect(grove.isVisible('/a/y.txt')).toBe(false)
    expect(grove.isVisible('/a/b/c.txt')).toBe(true)

    grove.close('/a/b')
    for (let frame = 0; frame < 600; frame++) {
      grove.step(1 / 60)
      // a/ only grows back once b/ is in.
      if (grove.growth('/a/b') > 0) expect(grove.isVisible('/a/y.txt')).toBe(false)
    }
    expect(grove.isVisible('/a/y.txt')).toBe(true)
    expect(grove.growth('/a')).toBe(grove.layout.branches.get('/a')!.path.length)
  })

  it('ignores branches of folders that are still closed when deciding whether to pan', () => {
    const grove = createGrove(tree)
    // Tall enough for the top level, not for b/, which sits inside a/ until a/ opens.
    grove.setView(1600, 200)
    settle(grove)
    expect(grove.canPan).toBe(false)
  })
})

describe('seeds', () => {
  // Root ── s/ ── t/ ── u.txt, where s/ and t/ are only placed once they open.
  const placed: string[] = []
  const seeded = (): FolderSpec => ({
    name: 'Root',
    branch: { width: 4, path: [[0, 0], [100, 0], [200, 0]] },
    children: [
      {
        name: 's',
        at: [50, -20],
        label: 'right',
        load: 2,
        grow: () => {
          placed.push('/s')
          return {
            branch: { path: [[55, -100], [50, -200]] },
            children: [
              {
                name: 't',
                at: [70, -100],
                label: 'right',
                load: 1,
                grow: () => {
                  placed.push('/s/t')
                  return { branch: { path: [[150, -100], [250, -100]] }, children: [{ name: 'u.txt', at: [200, -90], label: 'right' }] }
                },
              },
            ],
          }
        },
      },
    ],
  })

  it('places a folder only when it first opens, and only once', () => {
    placed.length = 0
    const grove = createGrove(seeded())
    settle(grove)
    expect(placed).toEqual([])
    expect(grove.layout.branches.has('/s')).toBe(false)

    grove.toggle('/s')
    settle(grove)
    expect(placed).toEqual(['/s'])
    expect(grove.isVisible('/s/t')).toBe(true)
    // As stout as what it holds, though what's inside isn't placed yet.
    expect(grove.layout.branches.get('/s')!.load).toBe(2)

    grove.toggle('/s')
    settle(grove)
    grove.toggle('/s')
    settle(grove)
    expect(placed).toEqual(['/s'])
  })

  it('places the folders on the way to a deep link', () => {
    placed.length = 0
    const grove = createGrove(seeded())
    grove.go('/s/t/u.txt')
    expect(placed).toEqual(['/s', '/s/t'])
    expect(grove.location).toBe('/s/t/u.txt')
    settle(grove)
    expect(grove.isVisible('/s/t/u.txt')).toBe(true)
  })
})

describe('location', () => {
  it('grows a deep link folder by folder, then lands on the file', () => {
    const grove = createGrove(tree)
    grove.go('/a/b/c.txt')
    expect(grove.location).toBe('/a/b/c.txt')

    for (let frame = 0; frame < 600; frame++) {
      grove.step(1 / 60)
      // Nothing grows out of a folder that isn't on screen yet.
      if (!grove.isVisible('/a/b')) expect(grove.growth('/a/b')).toBe(0)
    }
    expect(grove.isOpen('/a')).toBe(true)
    expect(grove.isOpen('/a/b')).toBe(true)
    expect(grove.isVisible('/a/b/c.txt')).toBe(true)
  })

  it('steps back out: the file first, then one folder at a time', () => {
    const grove = createGrove(tree)
    grove.go('/a/b/c.txt')
    settle(grove)

    grove.go('/a/b')
    settle(grove)
    expect(grove.location).toBe('/a/b')
    expect(grove.isOpen('/a/b')).toBe(true)

    grove.go('/a')
    settle(grove)
    expect(grove.isOpen('/a/b')).toBe(false)
    expect(grove.isOpen('/a')).toBe(true)
  })

  it('follows opening and closing by hand, and keeps other open folders open', () => {
    const grove = createGrove(tree)
    settle(grove)
    grove.open('/a')
    settle(grove)
    grove.open('/a/b')
    settle(grove)
    grove.open('/d.txt')
    expect(grove.location).toBe('/d.txt')

    grove.close('/d.txt')
    expect(grove.location).toBe('/')
    expect(grove.isOpen('/a/b')).toBe(true)

    grove.open('/a/b/c.txt')
    grove.close('/a')
    expect(grove.location).toBe('/')
  })

  it('can open a folder whole, every folder inside it too, and stay on the folder', () => {
    const grove = createGrove(tree)
    grove.go('/a/', { whole: true })
    settle(grove)
    expect(grove.location).toBe('/a')
    expect(grove.isExpanded('/a/b')).toBe(true)
    expect(grove.isVisible('/a/b/c.txt')).toBe(true)
    // Closing it closes all of it.
    grove.close('/a')
    expect(grove.isExpanded('/a/b')).toBe(false)
  })

  it('takes an unknown path to the nearest folder that exists', () => {
    const grove = createGrove(tree)
    grove.go('/a/nope/c.txt')
    expect(grove.location).toBe('/a')
    grove.go('/elsewhere')
    expect(grove.location).toBe('/')
  })
})
