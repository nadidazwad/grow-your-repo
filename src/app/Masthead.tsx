import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ClipboardEvent, type ReactNode, type RefObject } from 'react'
import { toScreen, type Entry, type View } from '../garden'
import { ROOT_ID, TRUNK_TUCK, type Bounds, type Grove, type Vec2 } from '../grove'
import type { Shape } from '../place'
import { parseLink } from '../repo'

/** World px, so the words scale with the plant. */
const w = (n: number) => `calc(var(--spacing) * ${n})`

/** How far PP Mondwest's baseline sits below the top of a line as tall as the type. */
const BASELINE = 0.78
/** How far the name shrinks, toward the left end of its baseline, while a branch grows across it. */
const TUCKED = 0.3
/** Once less than this much of the name is on screen, the small one drops in at the top. */
const NAME_GONE = 0.5
const PLACEHOLDER = 'owner/repo'

interface Props {
  /** The repo's `owner/name`, or what was typed for it; empty on the landing. */
  name: string
  /** The words above the name: an invitation, what's happening, or what the repo is. */
  line: ReactNode
  /** Grow whatever was typed or pasted. */
  onGrow: (text: string) => void
  shape: Shape
  view: View
  /** Once a repo has grown, the name stands in its world, pans with it, and tucks away while a branch crosses it. */
  grove?: Grove<Entry>
}

/**
 * The repo's name, huge, standing on the ground the plant grows out of, with
 * a line of words above it. The name is also where another repo goes: on the
 * landing it's an empty field, and once a repo has grown, clicking it lets you
 * type or paste over it. A pasted link grows at once.
 */
export function Masthead({ name, line, onGrow, shape, view, grove }: Props) {
  const [editing, setEditing] = useState(!grove)
  const [text, setText] = useState(name)
  const shown = editing ? text || PLACEHOLDER : name
  // Typing, it's one line; standing, a phone stacks the owner over the repo.
  const geometry = shape.name(shown, editing)
  const { size, baseline, leading, lines } = geometry
  // From the top of the first line's box to the last line's baseline.
  const drop = (lines.length - 1) * leading + BASELINE * size
  const anchor: Vec2 = [geometry.line.minX, geometry.line.maxY]
  const place = usePlaced(grove ?? null, view, shape, anchor)
  const crossing = useCrossing(grove ?? null, geometry.box)
  const field = useRef<HTMLInputElement>(null)
  const title = useRef<HTMLDivElement>(null)
  const titleShows = useOnScreen(title, NAME_GONE)

  useEffect(() => {
    if (editing && grove) field.current?.select()
  }, [editing, grove])

  const grow = (value: string) => {
    if (!value.trim()) return
    field.current?.blur()
    onGrow(value)
  }
  const paste = (event: ClipboardEvent<HTMLInputElement>) => {
    const pasted = event.clipboardData.getData('text')
    if (!parseLink(pasted)) return
    event.preventDefault()
    setText(pasted.trim())
    grow(pasted)
  }

  const [owner, repo] = splitName(name)
  // From the bottom of the line to the top of the name's first line box.
  const nameTop = baseline - drop - anchor[1]
  return (
    <>
      {grove && <SmallName name={name} shown={!titleShows} onClick={() => grove.go(ROOT_ID)} />}
      <div ref={place} className="pointer-events-none absolute left-0 top-0 select-none">
        <p
          className="halo pointer-events-auto absolute bottom-0 left-0 text-body transition-opacity duration-500"
          style={{ width: w(geometry.line.maxX - geometry.line.minX), fontSize: w(16), lineHeight: w(22), opacity: crossing ? 0 : 1 }}
        >
          {line}
        </p>
        <div
          ref={title}
          className="absolute left-0 transition-[scale,translate] duration-700 ease-out-expo"
          style={{
            top: w(nameTop),
            // About the left end of the baseline, so it stays standing on the ground.
            transformOrigin: `0 ${w(drop)}`,
            scale: crossing ? TUCKED : 1,
          }}
        >
          <form
            onSubmit={(event) => {
              event.preventDefault()
              grow(text)
            }}
          >
            {editing ? (
              <input
                ref={field}
                value={text}
                onChange={(event) => setText(event.target.value)}
                onPaste={paste}
                onBlur={() => grove && setEditing(false)}
                onKeyDown={(event) => event.key === 'Escape' && grove && setEditing(false)}
                placeholder={PLACEHOLDER}
                aria-label="A public GitHub repo, as owner/repo or its link"
                autoFocus={!grove}
                autoComplete="off"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                enterKeyHint="go"
                className="font-mondwest pointer-events-auto block bg-transparent p-0 text-ink caret-accent outline-none placeholder:text-faint"
                style={{ fontSize: w(size), lineHeight: w(size), height: w(size), width: `${Math.max(shown.length, 4) * 0.47 + 0.15}em` }}
              />
            ) : (
              <button
                type="button"
                onClick={() => {
                  setText(name)
                  setEditing(true)
                }}
                className="group font-mondwest pointer-events-auto block cursor-text whitespace-nowrap text-left outline-none"
                style={{ fontSize: w(size), lineHeight: w(size) }}
                aria-label={`${name}: type or paste another repo`}
              >
                <span className={`${lines.length > 1 ? 'block' : ''} text-faint transition-colors duration-200 group-hover:text-muted`}>{owner}</span>
                <span
                  className={`${lines.length > 1 ? 'block' : ''} text-ink transition-colors duration-200 group-hover:text-accent group-focus-visible:text-accent`}
                  style={lines.length > 1 ? { marginTop: w(leading - size) } : undefined}
                >
                  {repo}
                </span>
              </button>
            )}
          </form>
        </div>
      </div>
    </>
  )
}

/** `owner/` and `repo`, so the repo can stand out in colour. */
function splitName(name: string): [string, string] {
  const cut = name.indexOf('/')
  return cut === -1 ? ['', name] : [name.slice(0, cut + 1), name.slice(cut + 1)]
}

/**
 * Pins an element's top-left corner to a world point: in the grove's world
 * once there is one, and before that where the same point sits in the view a
 * plant opens on, so nothing jumps when one grows.
 */
function usePlaced(grove: Grove<Entry> | null, view: View, shape: Shape, [x, y]: Vec2) {
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return
    const place = () => {
      const [left, top] = grove ? toScreen(grove, view, [x, y]) : opening(shape, view, [x, y])
      element.style.transform = `translate3d(${left}px, ${top}px, 0)`
    }
    place()
    return grove?.onFrame(place)
  }, [grove, view, shape, x, y])
  return ref
}

/** Where a world point sits in the view a plant opens on: the trunk entering at its left edge, its bottom on the ground. */
function opening(shape: Shape, { height, scale, dpr }: View, [x, y]: Vec2): Vec2 {
  const left = shape.trunk.start[0] + TRUNK_TUCK
  const round = (v: number) => Math.round(v * dpr) / dpr
  return [round((x - left) * scale), round((y - shape.ground) * scale + height)]
}

/** True from the moment a folder whose branch, or anything on it, runs across `box` opens, until it closes again. */
function useCrossing(grove: Grove<Entry> | null, box: Bounds) {
  const [crossing, setCrossing] = useState(false)
  const { minX, maxX, minY, maxY } = box
  const area = useMemo(() => ({ minX, maxX, minY, maxY }), [minX, maxX, minY, maxY])
  useEffect(() => {
    if (!grove) return
    const inside = ([x, y]: Vec2) => x > area.minX && x < area.maxX && y > area.minY - 20 && y < area.maxY
    const check = () => {
      const crossers = new Set<string>()
      for (const branch of grove.layout.branches.values()) {
        if (branch.parent !== null && branch.path.points.some(inside)) crossers.add(branch.id)
      }
      for (const node of grove.layout.nodes) if (node.parent !== ROOT_ID && inside(node.at)) crossers.add(node.parent)
      setCrossing([...crossers].some((id) => grove.isOpen(id)))
    }
    check()
    return grove.subscribe(check)
  }, [grove, area])
  return crossing
}

/** True while at least `share` of the element is on screen. */
function useOnScreen(ref: RefObject<Element | null>, share: number) {
  const [shows, setShows] = useState(true)
  useEffect(() => {
    const element = ref.current
    if (!element) return
    const observer = new IntersectionObserver(([entry]) => setShows(entry.intersectionRatio >= share), { threshold: share })
    observer.observe(element)
    return () => observer.disconnect()
  }, [ref, share])
  return shows
}

/** The name, small, pinned to the top left corner while the big one is out of sight; it takes you back to the root. */
function SmallName({ name, shown, onClick }: { name: string; shown: boolean; onClick: () => void }) {
  const [owner, repo] = splitName(name)
  return (
    <button
      type="button"
      onClick={onClick}
      inert={!shown}
      aria-hidden={!shown}
      className={`halo font-mondwest pointer-events-auto fixed left-[30px] top-[22px] z-10 cursor-pointer whitespace-nowrap text-[30px] leading-[34px] outline-none transition-[translate,opacity] motion-reduce:translate-y-0 ${
        shown ? 'translate-y-0 opacity-100 duration-500 ease-out-expo' : '-translate-y-[56px] opacity-0 duration-200 ease-in'
      }`}
    >
      <span className="text-faint">{owner}</span>
      <span className="text-ink">{repo}</span>
    </button>
  )
}
