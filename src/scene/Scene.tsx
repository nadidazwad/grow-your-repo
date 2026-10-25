import { Canvas, useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useState } from 'react'
import { OrthographicCamera, Vector2 } from 'three'
import { pixelGrid, type Bounds, type Grove, type GroveBranch, type PixelGrid } from '../grove'
import { createDither } from './dither.ts'
import { barkMaterial, foliageMaterial } from './materials.ts'
import { growPlant } from './plant.ts'

interface Props {
  grove: Grove
  /** World areas where words sit near a branch (labels, the masthead): its twigs stop short of them. */
  keepOut: (branch: GroveBranch) => Bounds[]
  /** CSS px per world px. */
  scale: number
  dpr: number
  /** Stops drawing, and the grove's clock with it, while something covers the whole plant. */
  paused?: boolean
}

// Drives the grove's clock too, so labels and branches move in the same frame.
export default function Scene({ grove, keepOut, scale, dpr, paused = false }: Props) {
  return (
    <Canvas
      className="!absolute inset-0 [image-rendering:pixelated]"
      // r3f lets its canvas take the pointer; the plant has nothing to point at, and the words under it do.
      style={{ pointerEvents: 'none' }}
      dpr={dpr}
      frameloop={paused ? 'never' : 'always'}
      linear
      flat
      // The screen only ever gets one flat pass, so it needs no depth or stencil.
      gl={{ alpha: true, antialias: false, depth: false, stencil: false, powerPreference: 'high-performance' }}
    >
      <Garden grove={grove} keepOut={keepOut} scale={scale} />
    </Canvas>
  )
}

type Grid = Parameters<ReturnType<typeof createDither>['render']>[3]

type Grown = ReturnType<typeof build>

function build(branch: GroveBranch, keepOut: Bounds[]) {
  return { id: branch.id, ...growPlant(branch, keepOut), barkMaterial: barkMaterial(), foliageMaterial: foliageMaterial() }
}

/**
 * Points the camera at whole cells just above and left of the view, and sets
 * how far the dither pass slides the picture to land it on the real camera.
 */
function aim(
  camera: OrthographicCamera,
  grid: Grid,
  [x, y]: readonly [number, number],
  pixels: PixelGrid,
  view: { width: number; height: number; scale: number; dpr: number; canvas: HTMLCanvasElement },
) {
  const column = Math.floor(x / pixels.world)
  const row = Math.floor(y / pixels.world)
  // One spare cell each way covers the slide.
  grid.cell = pixels.device
  grid.cells.set(Math.ceil(view.canvas.width / pixels.device) + 1, Math.ceil(view.canvas.height / pixels.device) + 1)
  grid.shift.set(
    Math.round((x - column * pixels.world) * view.scale * view.dpr),
    Math.round((y - row * pixels.world) * view.scale * view.dpr),
  )
  grid.origin.set(((column % 4) + 4) % 4, ((row % 4) + 4) % 4)

  // World y points down the screen; three's points up.
  const left = column * pixels.world - view.width / 2 / view.scale
  const top = row * pixels.world - view.height / 2 / view.scale
  camera.left = left
  camera.right = left + grid.cells.x * pixels.world
  camera.top = -top
  camera.bottom = -top - grid.cells.y * pixels.world
  camera.updateProjectionMatrix()
}

function Garden({ grove, keepOut, scale }: { grove: Grove; keepOut: (branch: GroveBranch) => Bounds[]; scale: number }) {
  // A branch is built once its folder is placed, which is when it first opens.
  const [plants, setPlants] = useState<Grown[]>([])
  useEffect(() => {
    const built = new Map<string, Grown>()
    const update = () => {
      const before = built.size
      for (const branch of grove.layout.branches.values()) {
        if (!built.has(branch.id)) built.set(branch.id, build(branch, keepOut(branch)))
      }
      if (built.size !== before) setPlants([...built.values()])
    }
    update()
    const unsubscribe = grove.subscribe(update)
    return () => {
      unsubscribe()
      for (const plant of built.values()) {
        plant.bark.dispose()
        plant.foliage.dispose()
        plant.barkMaterial.dispose()
        plant.foliageMaterial.dispose()
      }
    }
  }, [grove, keepOut])
  const camera = useMemo(() => {
    const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 1000)
    camera.position.z = 100
    return camera
  }, [])
  const dither = useMemo(() => createDither(), [])
  const grid = useMemo<Grid>(() => ({ cells: new Vector2(), cell: 1, shift: new Vector2(), origin: new Vector2() }), [])

  useEffect(() => () => dither.dispose(), [dither])

  useFrame((state, delta) => {
    grove.step(Math.min(delta, 1 / 30))

    const { gl, size } = state
    const dpr = state.viewport.dpr
    const pixels = pixelGrid(scale, dpr)
    const time = state.clock.elapsedTime
    const sway = grove.still ? 0 : 1
    for (const plant of plants) {
      // Whole cells only: a tip creeping a fraction of a cell per frame makes its pixels flicker.
      const grow = Math.floor(grove.growth(plant.id) / pixels.world) * pixels.world
      for (const material of [plant.barkMaterial, plant.foliageMaterial]) {
        material.uniforms.uGrow.value = grow
        material.uniforms.uTime.value = time
        material.uniforms.uSway.value = sway
      }
    }

    aim(camera, grid, grove.camera, pixels, { ...size, scale, dpr, canvas: gl.domElement })
    dither.render(gl, state.scene, camera, grid)
  }, 1)

  return plants.map((plant) => (
    <group key={plant.id}>
      <mesh geometry={plant.bark} material={plant.barkMaterial} frustumCulled={false} />
      <mesh geometry={plant.foliage} material={plant.foliageMaterial} frustumCulled={false} />
    </group>
  ))
}
