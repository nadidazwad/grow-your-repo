import { useState } from 'react'
import { labelArea, nameOf, type Entry } from '../garden'
import { createGrove, ROOT_ID, type Bounds, type GroveBranch, type GroveNode } from '../grove'
import { placeRepo } from '../place'
import { problems } from './crowding.ts'
import { savedNames, savedRepo, type SavedName } from './trees'

/**
 * Dev only: a saved repo placed as a plant, with one chain of folders open as
 * it would be on screen, drawn as lines. Crowded and overlapping labels are red.
 * `?repo=facebook/react&open=packages/react-dom/src`; `&all` lays every chain
 * one level down side by side.
 */
export default function Overview() {
  const params = new URLSearchParams(location.search)
  const name = (savedNames.find((saved) => saved === params.get('repo')) ?? 'nadidazwad/garden') as SavedName
  const repo = savedRepo(name)
  const opens = params.has('all')
    ? ['', ...repo.root.children.filter((child) => child.kind === 'folder').map((child) => child.path)]
    : [params.get('open') ?? '']
  return (
    <div className="flex flex-wrap gap-4 bg-white p-4 font-sans text-[13px]">
      <nav className="flex w-full gap-4">
        {savedNames.map((saved) => (
          <a key={saved} href={`?repo=${saved}`} className={saved === name ? 'text-accent' : 'text-ink'}>
            {saved}
          </a>
        ))}
        <a href={`?repo=${name}&all`} className="text-ink">
          every top-level folder
        </a>
      </nav>
      {opens.map((open) => (
        <Chain key={open} name={name} open={open} wide={opens.length === 1} />
      ))}
    </div>
  )
}

/** Places the repo and opens the chain to `open`, timing it. */
function lay(name: SavedName, open: string) {
  const started = performance.now()
  const placed = placeRepo(savedRepo(name))
  const grove = createGrove(placed.tree, { exclusive: true })
  const id = placed.idOf(open)
  grove.go(id)
  const took = performance.now() - started
  const chain = new Set<string>([ROOT_ID])
  for (let at = id; at !== ROOT_ID; at = at.slice(0, at.lastIndexOf('/')) || ROOT_ID) if (grove.layout.branches.has(at)) chain.add(at)
  const branches = [...grove.layout.branches.values()].filter((branch) => chain.has(branch.id))
  const nodes = grove.layout.nodes.filter((node) => chain.has(node.parent))
  return { placed, took, chain, branches, nodes, found: problems(nodes, branches) }
}

function Chain({ name, open, wide }: { name: SavedName; open: string; wide: boolean }) {
  const [{ placed, took, chain, branches, nodes, found }] = useState(() => lay(name, open))
  const flagged = new Set(found.flatMap((problem) => problem.ids))
  for (const problem of found) console.info(problem.text)

  const { ground } = placed.shape
  const box = bounds(branches, nodes)
  const pad = 40
  const [minX, minY] = [Math.min(box.minX, -480) - pad, Math.min(box.minY, ground - 800) - pad]
  const [maxX, maxY] = [Math.max(box.maxX, 848) + pad, ground + pad]
  return (
    <figure style={{ width: wide ? '100%' : 'calc(50% - 8px)' }}>
      <figcaption className="text-muted">
        /{open} · {nodes.length} names · placed in {took.toFixed(0)} ms ·{' '}
        <span className={found.length ? 'text-[#d00]' : ''}>{found.length} problems</span>
      </figcaption>
      <svg className="block w-full border border-[#eee]" viewBox={`${minX} ${minY} ${maxX - minX} ${maxY - minY}`}>
        {/* The opening view at 1280 × 800, resting on the ground. */}
        <rect x={-432} y={ground - 800} width={1280} height={800} fill="none" stroke="#a6a6a6" strokeDasharray="8 6" />
        <line x1={minX} x2={maxX} y1={ground} y2={ground} stroke="#111214" />
        <rect {...rect(placed.name.box)} fill="#f3f3f3" />
        <text x={placed.name.box.minX} y={ground - 8} fontSize={placed.name.size * 0.7} fill="#ddd">
          {placed.name.text}
        </text>
        {branches.map((branch) => (
          <polyline
            key={branch.id}
            points={branch.path.points.map((p) => p.join(',')).join(' ')}
            stroke={branch.id === ROOT_ID ? '#6b4a33' : '#36c21c'}
            strokeWidth={branch.width}
            strokeLinecap="round"
            fill="none"
            opacity={0.55}
          />
        ))}
        {nodes.map((node) => (
          <rect key={`${node.id}:box`} {...rect(labelArea(node, { icon: false }))} fill={flagged.has(node.id) ? '#ff000033' : 'none'} stroke={flagged.has(node.id) ? '#ff0000' : 'none'} />
        ))}
        {nodes.map((node) => (
          <Node key={node.id} node={node} open={chain.has(node.id)} />
        ))}
      </svg>
    </figure>
  )
}

function Node({ node, open }: { node: GroveNode<Entry>; open: boolean }) {
  return (
    <g transform={`translate(${node.at[0]} ${node.at[1]})`}>
      <rect x={-10} y={-9} width={20} height={18} fill={node.kind === 'folder' ? (open ? '#007bb9' : '#16130f') : '#fff'} stroke="#16130f" />
      <text
        x={node.label === 'right' ? 22 : node.label === 'left' ? -22 : 0}
        y={node.label === 'below' ? 34 : 5}
        textAnchor={node.label === 'right' ? 'start' : node.label === 'left' ? 'end' : 'middle'}
        fontSize={15}
        fill="#16130f"
      >
        {nameOf(node)}
      </text>
    </g>
  )
}

const rect = (box: Bounds) => ({ x: box.minX, y: box.minY, width: box.maxX - box.minX, height: box.maxY - box.minY })

function bounds(branches: GroveBranch[], nodes: GroveNode<Entry>[]): Bounds {
  const box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
  const add = ({ minX, minY, maxX, maxY }: Bounds) => {
    box.minX = Math.min(box.minX, minX)
    box.minY = Math.min(box.minY, minY)
    box.maxX = Math.max(box.maxX, maxX)
    box.maxY = Math.max(box.maxY, maxY)
  }
  for (const branch of branches) for (const [x, y] of branch.path.points) add({ minX: x, maxX: x, minY: y, maxY: y })
  for (const node of nodes) add(labelArea(node))
  return box
}
