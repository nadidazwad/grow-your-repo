import { sample, SAMPLE_GROUND } from '../app/sample.ts'
import { labelArea } from '../garden'
import { createGrove } from '../grove'
import { problems } from './crowding.ts'

/** Dev only: the whole tree opened at once, as lines, with crowded and overlapping labels in red. */
export default function Overview() {
  const { layout } = createGrove(sample)
  const { minX, minY } = layout.bounds
  const [maxX, maxY] = [Math.max(layout.bounds.maxX, 848), SAMPLE_GROUND]
  const pad = 160
  const depth = (id: string) => id.split('/').length - 1
  const hues = ['#6b4a33', '#007bb9', '#d19a3d', '#36c21c', '#4fa3e0', '#8f9a22']
  const found = problems(layout.nodes, [...layout.branches.values()])
  const flagged = new Set(found.flatMap((problem) => problem.ids))
  for (const problem of found) console.info(problem.text)
  return (
    <svg
      className="block"
      viewBox={`${minX - pad} ${minY - pad} ${maxX - minX + pad * 2} ${maxY - minY + pad * 2}`}
      style={{ width: '100vw', height: '100vh', background: '#fff' }}
    >
      {/* The opening view at 1280 × 800, resting on the ground. */}
      <rect x={-432} y={SAMPLE_GROUND - 800} width={1280} height={800} fill="none" stroke="#a6a6a6" strokeDasharray="8 6" />
      <line x1={-480} x2={maxX + pad} y1={SAMPLE_GROUND} y2={SAMPLE_GROUND} stroke="#111214" />
      {[...layout.branches.values()].map((branch) => (
        <g key={branch.id} stroke={hues[depth(branch.id === '/' ? '' : branch.id) % hues.length]} fill="none">
          <polyline points={branch.path.points.map((p) => p.join(',')).join(' ')} strokeWidth={branch.width} strokeLinecap="round" opacity={0.55} />
          {branch.limbs.map((limb, i) => (
            <polyline key={i} points={limb.points.map((p) => p.join(',')).join(' ')} strokeWidth={1.5} />
          ))}
        </g>
      ))}
      {layout.nodes.map((node) => {
        const box = labelArea(node, { icon: false })
        return (
          <rect
            key={`${node.id}:box`}
            x={box.minX}
            y={box.minY}
            width={box.maxX - box.minX}
            height={box.maxY - box.minY}
            fill={flagged.has(node.id) ? '#ff000033' : 'none'}
            stroke={flagged.has(node.id) ? '#ff0000' : 'none'}
          />
        )
      })}
      {layout.nodes.map((node) => (
        <g key={node.id} transform={`translate(${node.at[0]} ${node.at[1]})`}>
          <rect x={-10} y={-9} width={20} height={18} fill={node.kind === 'folder' ? '#16130f' : '#fff'} stroke="#16130f" />
          <text
            x={node.label === 'right' ? 18 : node.label === 'left' ? -18 : 0}
            y={node.label === 'below' ? 30 : 5}
            textAnchor={node.label === 'right' ? 'start' : node.label === 'left' ? 'end' : 'middle'}
            fontSize={16}
            fill="#16130f"
          >
            {node.name}
            {node.kind === 'folder' ? '/' : ''}
          </text>
        </g>
      ))}
    </svg>
  )
}
