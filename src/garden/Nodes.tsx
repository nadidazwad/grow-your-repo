import { useLayoutEffect, useRef, useSyncExternalStore, type CSSProperties, type PointerEvent } from 'react'
import type { Grove, GroveNode, LabelSide } from '../grove'
import { glyphs, PixelIcon, type GlyphName } from '../icons'
import { sound } from '../sound'
import { nameOf, type Entry } from './entry.ts'
import { toScreen, type View } from './view.ts'

interface Props {
  grove: Grove<Entry>
  view: View
  /** What the tree is, for screen readers. */
  label: string
}

/** Icons and names for every file and folder, pinned to where the plant draws them. */
export function Nodes({ grove, view, label }: Props) {
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
              <File node={node} shown={visible} here={grove.location === node.id} />
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
  const entry = node.data?.kind === 'folder' ? node.data : undefined
  const glyph: GlyphName = entry?.rest ? (open ? 'openMore' : 'more') : open ? 'openFolder' : 'folder'
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
      name={nameOf(node)}
      note={entry?.note}
    />
  )
}

/** A file is a link to it on GitHub, opening in a new tab: a link rather than a script, so no pop-up blocker gets between. */
function File({ node, shown, here }: { node: GroveNode<Entry>; shown: boolean; here: boolean }) {
  const entry = node.data?.kind === 'file' ? node.data : undefined
  return (
    <Item
      node={node}
      shown={shown}
      glyph={entry?.glyph ?? 'text'}
      href={entry?.href}
      onClick={() => sound.play('link')}
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
  /** Where it goes, in a new tab; without one it's a button. */
  href?: string
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
 * right, the left, or underneath. The whole thing is one button, or one link, as big as the icon.
 * Arriving, the icon pops and the name grows out of it a beat later.
 */
function Item({ node, shown, glyph, name, note, iconClass, nameClass, expanded, current, href, onClick }: ItemProps) {
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
  const props = {
    role: 'treeitem',
    'aria-expanded': expanded,
    'aria-current': current || undefined,
    onClick,
    // A mouse passing over gets the faintest tick; a finger has already touched it.
    onPointerEnter: (event: PointerEvent) => event.pointerType === 'mouse' && sound.play('hover'),
    className: 'group pointer-events-auto absolute block cursor-pointer outline-none',
    style: { left: px(-width / 2), top: px(-height / 2), width: px(width), height: px(height) },
    children: (
      <>
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
      </>
    ),
  }
  // Not draggable: a link the browser drags itself would steal the press from panning.
  return href ? <a href={href} target="_blank" rel="noopener noreferrer" draggable={false} {...props} /> : <button type="button" {...props} />
}
