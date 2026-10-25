import { buildTree, type Repo, type TreeEntry } from '../../repo'
import garden from './garden.txt?raw'
import react from './react.txt?raw'
import vite from './vite.txt?raw'

// Saved trees to place without asking GitHub: a small, a medium and a huge repo.
// One path a line; folders end in a slash, submodules in an @.
const saved = { 'nadidazwad/garden': garden, 'vitejs/vite': vite, 'facebook/react': react }

export type SavedName = keyof typeof saved
export const savedNames = Object.keys(saved) as SavedName[]

export function savedRepo(name: SavedName): Repo {
  const entries: TreeEntry[] = saved[name]
    .split('\n')
    .filter(Boolean)
    .map((line) =>
      line.endsWith('/') ? { path: line.slice(0, -1), type: 'tree' } : line.endsWith('@') ? { path: line.slice(0, -1), type: 'commit' } : { path: line, type: 'blob' },
    )
  const [owner, repo] = name.split('/')
  return { owner, name: repo, ref: 'main', defaultRef: 'main', description: null, root: buildTree(entries), truncated: false, path: '' }
}
