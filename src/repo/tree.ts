export interface Folder {
  kind: 'folder'
  name: string
  /** From the repo's root, without a leading slash; empty for the root. */
  path: string
  /** Folders first, then files, in reading order. */
  children: (Folder | File)[]
  /** Files and folders inside, at any depth. */
  count: number
}

export interface File {
  kind: 'file'
  name: string
  path: string
  /** A link to another repo, which GitHub shows as a folder that goes elsewhere. */
  submodule?: boolean
}

/** One entry of GitHub's recursive tree. */
export interface TreeEntry {
  path: string
  type: 'blob' | 'tree' | 'commit'
}

/**
 * Nests GitHub's flat list into folders. Folders come first, then files; names
 * starting with a dot after the rest, then by name, numbers in order. The same
 * repo always sorts the same way, whatever the visitor's language.
 */
export function buildTree(entries: TreeEntry[]): Folder {
  const root: Folder = { kind: 'folder', name: '', path: '', children: [], count: 0 }
  const folders = new Map<string, Folder>([['', root]])

  const folderAt = (path: string): Folder => {
    const known = folders.get(path)
    if (known) return known
    // A truncated tree can list a file without the folder it's in.
    const cut = path.lastIndexOf('/')
    const parent = folderAt(cut === -1 ? '' : path.slice(0, cut))
    const folder: Folder = { kind: 'folder', name: path.slice(cut + 1), path, children: [], count: 0 }
    parent.children.push(folder)
    folders.set(path, folder)
    return folder
  }

  for (const entry of entries) {
    if (entry.type === 'tree') {
      folderAt(entry.path)
      continue
    }
    const cut = entry.path.lastIndexOf('/')
    const file: File = { kind: 'file', name: entry.path.slice(cut + 1), path: entry.path }
    if (entry.type === 'commit') file.submodule = true
    folderAt(cut === -1 ? '' : entry.path.slice(0, cut)).children.push(file)
  }

  const settle = (folder: Folder): number => {
    folder.children.sort(order)
    folder.count = folder.children.reduce((sum, child) => sum + 1 + (child.kind === 'folder' ? settle(child) : 0), 0)
    return folder.count
  }
  settle(root)
  return root
}

const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' })

function order(a: Folder | File, b: Folder | File) {
  if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1
  const dotted = Number(a.name.startsWith('.')) - Number(b.name.startsWith('.'))
  if (dotted) return dotted
  return collator.compare(a.name, b.name) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)
}
