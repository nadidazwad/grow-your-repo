import type { SVGProps } from 'react'
import { glyphs, type GlyphName } from './glyphs.ts'

interface Props extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: GlyphName
  /** Size of one icon pixel in CSS px; defaults to the `--px` grid. */
  pixel?: number
}

/** A glyph on the pixel grid. Inside a `group` button it lifts on hover and presses flat (see theme.css). */
export function PixelIcon({ name, pixel, style, ...rest }: Props) {
  const glyph = glyphs[name]
  const size = (n: number) => (pixel ? `${pixel * n}px` : `calc(var(--px) * ${n})`)
  return (
    <svg
      viewBox={`0 0 ${glyph.width} ${glyph.height}`}
      shapeRendering="crispEdges"
      fill="currentColor"
      aria-hidden="true"
      {...rest}
      style={{ width: size(glyph.width), height: size(glyph.height), ...style }}
    >
      <path d={glyph.fill} className="pixel-glyph fill-page" />
      <path d={glyph.outline} className="pixel-glyph" />
      <path d={glyph.shadow} className="pixel-shadow" />
    </svg>
  )
}
