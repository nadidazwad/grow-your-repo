import { describe, expect, it } from 'vitest'
import { problems } from '../dev/crowding.ts'
import { savedRepo } from '../dev/trees'
import { labelArea } from '../garden'
import { createGrove, ROOT_ID } from '../grove'
import { buildTree, type Folder, type Repo } from '../repo'
import { MORE, placeRepo, wide } from '.'

/** Opens a path the way a visitor would, and returns what's on screen: the open chain's branches and names. */
function openTo(repo: Repo, path: string) {
  const placed = placeRepo(repo)
  const grove = createGrove(placed.tree, { exclusive: true })
  const id = placed.idOf(path)
  grove.go(id)
  const chain = new Set([ROOT_ID])
  for (let at = id; at !== ROOT_ID; at = at.slice(0, at.lastIndexOf('/')) || ROOT_ID) if (grove.layout.branches.has(at)) chain.add(at)
  return {
    placed,
    id,
    branches: [...grove.layout.branches.values()].filter((branch) => chain.has(branch.id)),
    nodes: grove.layout.nodes.filter((node) => chain.has(node.parent)),
  }
}

function folders(folder: Folder): string[] {
  return folder.children.flatMap((child) => (child.kind === 'folder' ? [child.path, ...folders(child)] : []))
}

/** What a visitor would see wrong: names on names or under branches, the name on the ground covered, or anything underground. */
function faults(repo: Repo, path: string) {
  const { placed, branches, nodes } = openTo(repo, path)
  const { ground } = placed.shape
  const found = problems(nodes, branches).map((problem) => problem.text)
  for (const branch of branches) {
    if (branch.path.points.some(([, y]) => y > ground - 40)) found.push(`${branch.id} grows into the ground`)
  }
  for (const node of nodes) {
    const box = labelArea(node)
    const name = placed.name.box
    if (box.maxY > ground) found.push(`${node.id} is underground`)
    if (box.minX < name.maxX && box.maxX > name.minX && box.minY < name.maxY && box.maxY > name.minY) found.push(`${node.id} covers the name`)
  }
  return found
}

describe('placeRepo', () => {
  it('opens every folder of a small repo with nothing on anything else', () => {
    const repo = savedRepo('nadidazwad/garden')
    for (const path of ['', ...folders(repo.root)]) expect(faults(repo, path), path).toEqual([])
  })

  it('opens a huge repo’s top folders, crowded batches and deepest chain cleanly too', () => {
    const repo = savedRepo('facebook/react')
    const top = repo.root.children.filter((child) => child.kind === 'folder').map((child) => child.path)
    const deep = ['packages/react-dom/src/__tests__', 'compiler/packages/babel-plugin-react-compiler/src/__tests__/fixtures/compiler/rules-of-hooks']
    for (const path of [...top, ...deep]) expect(faults(repo, path), path).toEqual([])
  })

  it('grows the same plant for the same repo', () => {
    const shape = (path: string) => {
      const { branches, nodes } = openTo(savedRepo('vitejs/vite'), path)
      return JSON.stringify([branches.map((branch) => branch.path.points), nodes.map((node) => [node.id, node.at, node.label])])
    }
    expect(shape('packages/vite/src/node')).toBe(shape('packages/vite/src/node'))
  })

  it('carries a batch on each branch and the rest on a node at its tip, so every entry stays reachable', () => {
    const repo = savedRepo('facebook/react')
    const folder = 'compiler/packages/babel-plugin-react-compiler/src/__tests__/fixtures/compiler'
    const { placed, nodes, id } = openTo(repo, folder)
    const along = nodes.filter((node) => node.parent === id)
    expect(along).toHaveLength(wide.batch + 1)
    const more = along[along.length - 1]
    expect(more.name).toBe(MORE)
    expect(more.data).toMatchObject({ kind: 'folder', title: '+ 2,721 more' })

    // The 40th entry is two batches further in, and its address is still its path.
    const contents = folder.split('/').reduce((at: Folder, name) => at.children.find((child) => child.name === name) as Folder, repo.root)
    const fortieth = contents.children[39].path
    const deep = placed.idOf(fortieth)
    expect(deep).toBe(`/${folder}/${MORE}/${MORE}/${contents.children[39].name}`)
    expect(placed.pathOf(deep)).toBe(fortieth)
    // Opening it grows both batches before it, clear of each other.
    expect(faults(repo, fortieth)).toEqual([])
  })

  it('finds an entry in a last batch that took in a few spare', () => {
    // 33 entries: 15 on the folder's branch, then all 18 left on the next, rather than 15 and "+ 3 more".
    const entries = Array.from({ length: 33 }, (_, i) => ({ path: `many/${String(i).padStart(2, '0')}.txt`, type: 'blob' as const }))
    const repo = { ...savedRepo('nadidazwad/garden'), root: buildTree(entries) }
    const { placed } = openTo(repo, '')
    expect(placed.idOf('many/32.txt')).toBe(`/many/${MORE}/32.txt`)
    expect(placed.idOf('many/14.txt')).toBe('/many/14.txt')
  })
})
