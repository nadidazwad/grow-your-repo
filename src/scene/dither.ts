import {
  Mesh,
  NearestFilter,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  Vector2,
  Vector3,
  WebGLRenderTarget,
  type Camera,
  type WebGLRenderer,
} from 'three'

// Sampled from the reference recording, with sky-blue blossoms and light amber
// ageing in place of its autumn and berry colours.
const PALETTE = [
  '#140d09', // black
  '#3b2620', // bark shadow
  '#6b4a33', // bark
  '#8e6a4a', // bark, lit
  '#b08d68', // bark highlight
  '#8f9a22', // olive
  '#5d9c12', // leaf shade
  '#36c21c', // green
  '#97f416', // lime
  '#c4f53c', // spring
  '#ecf622', // yellow
  '#eef5a6', // pale
  '#1c3f6b', // navy
  '#2e73bf', // deep sky
  '#4fa3e0', // cornflower
  '#87ceeb', // sky
  '#b5e2f7', // pale sky
  '#996b29', // ochre
  '#d19a3d', // amber
  '#edc261', // light amber
  '#f7db8a', // honey
  '#faedb3', // cream
]

/** Rendering at twice the cell resolution gives each cell 4 samples (×4 MSAA) of coverage. */
const SUPERSAMPLE = 2

/**
 * Draws a scene as a grid of flat-coloured cells. Coverage decides whether a
 * cell is drawn at all and colour snaps to the palette, both through a Bayer
 * matrix, which is what turns sub-cell twigs into dotted lines.
 *
 * The grid is locked to the world, not the screen: the scene is rendered from a
 * camera snapped to whole cells, then slid by the leftover device pixels. Pans
 * stay smooth and the dither pattern never crawls.
 *
 * Every device pixel in a cell gets the same colour, so the palette is matched
 * once per cell, into a texture a cell to a texel, and the screen only looks
 * its cell up: a few hundred thousand palette searches a frame, not millions.
 */
export function createDither() {
  const target = new WebGLRenderTarget(1, 1, { samples: 4 })
  const cellTarget = new WebGLRenderTarget(1, 1, { minFilter: NearestFilter, magFilter: NearestFilter, generateMipmaps: false })
  const cellsUniform = { value: new Vector2(1, 1) }

  const dither = new ShaderMaterial({
    depthTest: false,
    depthWrite: false,
    defines: { PALETTE_SIZE: PALETTE.length },
    uniforms: {
      tScene: { value: target.texture },
      uCells: cellsUniform,
      uOrigin: { value: new Vector2() },
      uPalette: { value: PALETTE.map(rgb) },
    },
    vertexShader: FULL_SCREEN,
    fragmentShader: /* glsl */ `
      uniform sampler2D tScene;
      uniform vec2 uCells;
      uniform vec2 uOrigin;
      uniform vec3 uPalette[PALETTE_SIZE];

      float bayer2(vec2 a) {
        a = floor(a);
        return fract(dot(a, vec2(0.5, a.y * 0.75)));
      }

      float bayer4(vec2 a) {
        return bayer2(0.5 * a) * 0.25 + bayer2(a);
      }

      void main() {
        // One fragment per cell, counted from the top left like the screen's.
        vec2 cell = vec2(floor(gl_FragCoord.x), uCells.y - 1.0 - floor(gl_FragCoord.y));
        vec2 world = cell + uOrigin;
        // The centre of a cell sits on the corner of its 2×2 texels, so one
        // bilinear fetch averages them.
        vec4 texel = texture2D(tScene, vec2((cell.x + 0.5) / uCells.x, 1.0 - (cell.y + 0.5) / uCells.y));
        if (texel.a <= bayer4(world)) {
          gl_FragColor = vec4(0.0);
          return;
        }

        vec3 color = texel.rgb / texel.a + (bayer4(world + vec2(2.0, 1.0)) - 0.5) * 0.22;
        vec3 best = uPalette[0];
        float nearest = 1e9;
        for (int i = 0; i < PALETTE_SIZE; i++) {
          vec3 d = (color - uPalette[i]) * vec3(1.0, 1.25, 0.8);
          float gap = dot(d, d);
          if (gap < nearest) {
            nearest = gap;
            best = uPalette[i];
          }
        }
        gl_FragColor = vec4(best, 1.0);
      }
    `,
  })

  const blit = new ShaderMaterial({
    depthTest: false,
    depthWrite: false,
    uniforms: {
      tCells: { value: cellTarget.texture },
      uCells: cellsUniform,
      uCell: { value: 1 },
      uHeight: { value: 1 },
      uShift: { value: new Vector2() },
    },
    vertexShader: FULL_SCREEN,
    fragmentShader: /* glsl */ `
      uniform sampler2D tCells;
      uniform vec2 uCells;
      uniform float uCell;
      uniform float uHeight;
      uniform vec2 uShift;

      void main() {
        vec2 cell = floor((vec2(gl_FragCoord.x, uHeight - gl_FragCoord.y) + uShift) / uCell);
        // Empty cells come out transparent, so the quad covers the whole canvas and nothing needs clearing first.
        gl_FragColor = texture2D(tCells, vec2((cell.x + 0.5) / uCells.x, 1.0 - (cell.y + 0.5) / uCells.y));
      }
    `,
  })

  const quad = new Mesh(new PlaneGeometry(2, 2), dither)
  quad.frustumCulled = false
  const screen = new Scene().add(quad)
  const screenCamera = new OrthographicCamera()

  return {
    /**
     * `cell` and `shift` are in device px. `origin` is the world cell under the
     * camera's top-left corner, mod 4, so the Bayer matrix stays on the world.
     */
    render(gl: WebGLRenderer, scene: Scene, camera: Camera, grid: { cells: Vector2; cell: number; shift: Vector2; origin: Vector2 }) {
      const { cells, cell, shift, origin } = grid
      const width = cells.x * SUPERSAMPLE
      const height = cells.y * SUPERSAMPLE
      if (target.width !== width || target.height !== height) target.setSize(width, height)
      if (cellTarget.width !== cells.x || cellTarget.height !== cells.y) cellTarget.setSize(cells.x, cells.y)
      cellsUniform.value.copy(cells)
      dither.uniforms.uOrigin.value.copy(origin)
      blit.uniforms.uCell.value = cell
      blit.uniforms.uShift.value.copy(shift)
      blit.uniforms.uHeight.value = gl.domElement.height

      // Only the scene needs clearing: both passes after it write every pixel they cover.
      const autoClear = gl.autoClear
      gl.autoClear = false
      gl.setClearColor(0x000000, 0)
      gl.setRenderTarget(target)
      gl.clear()
      gl.render(scene, camera)

      quad.material = dither
      gl.setRenderTarget(cellTarget)
      gl.render(screen, screenCamera)

      quad.material = blit
      gl.setRenderTarget(null)
      gl.render(screen, screenCamera)
      gl.autoClear = autoClear
    },
    dispose() {
      target.dispose()
      cellTarget.dispose()
      dither.dispose()
      blit.dispose()
      quad.geometry.dispose()
    },
  }
}

const FULL_SCREEN = /* glsl */ `
  void main() {
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`

/** Raw sRGB values: `Color` would convert them to linear. */
function rgb(hex: string) {
  const n = parseInt(hex.slice(1), 16)
  return new Vector3((n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255)
}
