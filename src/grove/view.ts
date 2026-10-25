/** One dither cell, and one pixel of a pixel icon, in design px. */
export const CELL = 2.8

export interface PixelGrid {
  /** Cell size in device pixels: always whole, so cells never blur. */
  device: number
  css: number
  world: number
}

export function pixelGrid(scale: number, dpr: number): PixelGrid {
  const device = Math.max(2, Math.round(CELL * scale * dpr))
  return { device, css: device / dpr, world: device / dpr / scale }
}
