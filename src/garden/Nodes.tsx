import { useLayoutEffect, useRef, useSyncExternalStore, type CSSProperties } from 'react'
import type { Grove, GroveNode, LabelSide } from '../grove'
import { glyphs, PixelIcon, type GlyphName } from '../icons'
import { sound } from '../sound'
import type { Entry } from './entry.ts'
import { toScreen, type View } from './view.ts'

interface Props {
  grove: Grove<Entry>
  view: View
  /** What the tree is, for screen readers. */
  label: string
  onOpen: (node: GroveNode<Entry>) => void
}

/** Icons and names for every file and folder, pinned to where the plant draws them. */
export function Nodes({ grove, view, label, onOpen }: Props) {
  useSyncExternalStore(grove.subscribe, () => grove.version)
  const anchors = useRef(new Map<string, HTMLDivElement>())

  useLayoutEffect(() => {
    const place = () => {
      for (const node of grove.layout.nodes) {
        const anchor = anchors.current.get(node.id)
        if (!anchor) continue
        const [x, y] = toScreen(grove, view, node.at)
        anchor.style.transform = `translate3d(${x}px, ${y}px, 0)`
      }
    }
    place()
    return grove.onFrame(place)
  }, [grove, view])

  return (
    <div className="pointer-events-none absolute inset-0 select-none" role="tree" aria-label={label}>
      {grove.layout.nodes.map((node) => {
        const visible = grove.isVisible(node.id)
        return (
          <div
            key={node.id}
            ref={(element) => {
              if (element) anchors.current.set(node.id, element)
              else anchors.current.delete(node.id)
            }}
            className="absolute left-0 top-0 transition-[opacity,visibility] duration-150 ease-out data-hidden:invisible data-hidden:opacity-0"
            data-hidden={visible ? undefined : ''}
            inert={!visible}
          >
            {node.kind === 'folder' ? (
              <Folder
                node={node}
                shown={visible}
                open={grove.isOpen(node.id)}
                here={grove.location === node.id}
                onToggle={() => grove.toggle(node.id)}
              />
            ) : (
              <File node={node} shown={visible} here={grove.location === node.id} onOpen={() => onOpen(node)} />
            )}
          </div>
        )
      })}
    </div>
  )
}

const LABEL = 'halo whitespace-nowrap text-[length:calc(var(--spacing)*16)] leading-[1.2]'
const NOTE = 'halo whitespace-nowrap text-[length:calc(var(--spacing)*12.5)] leading-[1.3] text-muted'
const HOVER = 'group-hover:text-accent group-focus-visible:text-accent'

function Folder({ node, shown, open, here, onToggle }: { node: GroveNode<Entry>; shown: boolean; open: boolean; here: boolean; onToggle: () => void }) {
  const glyph: GlyphName = open ? 'openFolder' : 'folder'
  const entry = node.data?.kind === 'folder' ? node.data : undefined
  return (
    <Item
      node={node}
      shown={shown}
      glyph={glyph}
      expanded={open}
      onClick={onToggle}
      iconClass={`${open ? 'text-ink' : 'text-muted'} ${HOVER}`}
      // An open folder's name steps back; its contents are what matter now.
      nameClass={`${open && !here ? 'text-muted' : 'text-ink'} ${HOVER}`}
      name={`${node.name}/`}
      note={entry?.note}
    />
  )
}

function File({ node, shown, here, onOpen }: { node: GroveNode<Entry>; shown: boolean; here: boolean; onOpen: () => void }) {
  const entry = node.data?.kind === 'file' ? node.data : undefined
  return (
    <Item
      node={node}
      shown={shown}
      glyph={entry?.glyph ?? 'text'}
      onClick={onOpen}
      current={here}
      iconClass={`${here ? 'text-accent' : 'text-faint'} ${HOVER}`}
      nameClass={`${here ? 'text-ink' : 'text-body'} ${HOVER}`}
      name={node.name}
    />
  )
}

interface ItemProps {
  node: GroveNode<Entry>
  /** Whether it's on the plant; each time it comes back, it pops in again. */
  shown: boolean
  glyph: GlyphName
  name: string
  note?: string
  iconClass: string
  nameClass: string
  expanded?: boolean
  current?: boolean
  onClick: () => void
}

/** Where a name's clip starts, so it grows out of the icon's side. */
const SPROUT: Record<LabelSide, string> = {
  right: 'inset(-10px 100% -10px -14px)',
  left: 'inset(-10px -14px -10px 100%)',
  below: 'inset(-10px -14px 100% -14px)',
}

/**
 * The icon sits centred on the node's point; the name hangs off it to the
 * right, the left, or underneath. The whole thing is one button, as big as the icon.
 * Arriving, the icon pops and the name grows out of it a beat later.
 */
function Item({ node, shown, glyph, name, note, iconClass, nameClass, expanded, current, onClick }: ItemProps) {
  const { width, height } = glyphs[glyph]
  const px = (n: number) => `calc(var(--px) * ${n})`
  const gap = 'calc(var(--spacing) * 8)'
  const side: LabelSide = node.label
  const label: CSSProperties =
    side === 'right'
      ? { left: `calc(100% + ${gap})`, top: '50%', transform: 'translateY(-50%)' }
      : side === 'left'
        ? { right: `calc(100% + ${gap})`, top: '50%', transform: 'translateY(-50%)', textAlign: 'right' }
        : { left: '50%', top: 'calc(100% + var(--spacing) * 4)', transform: 'translateX(-50%)', textAlign: 'center' }
  return (
    <button
      type="button"
      role="treeitem"
      aria-expanded={expanded}
      aria-current={current || undefined}
      onClick={onClick}
      // A mouse passing over gets the faintest tick; a finger has already touched it.
      onPointerEnter={(event) => event.pointerType === 'mouse' && sound.play('hover')}
      className="group pointer-events-auto absolute block cursor-pointer outline-none"
      style={{ left: px(-width / 2), top: px(-height / 2), width: px(width), height: px(height) }}
    >
      <PixelIcon
        name={glyph}
        data-glyph={node.id}
        className={`block transition-colors duration-150 ${shown ? 'motion-safe:animate-pop' : ''} ${iconClass}`}
      />
      <span
        className={`absolute flex flex-col ${shown ? 'motion-safe:animate-sprout' : ''}`}
        style={{ ...label, '--sprout-from': SPROUT[side] } as CSSProperties}
      >
        <span className={LABEL}>
          <span className={`line-draw group-focus-visible:line-drawn ${nameClass}`}>{name}</span>
        </span>
        {note && <span className={NOTE}>{note}</span>}
      </span>
    </button>
  )
}
