import type { Entry } from '../garden'
import type { BranchSpec, EntrySpec, FolderSpec, LabelSide, Vec2 } from '../grove'

// A stand-in until pasted repos are fetched and placed on their own: part of
// nadidazwad/garden, placed by hand on the portfolio's own trunk and work/
// branch (world px, y down). Delete it once real trees grow.

/** World y of the ground the plant stands on; the opening view spans x -432 to 848 and rests on it. */
export const SAMPLE_GROUND = 400

const REPO = 'https://github.com/nadidazwad/garden/blob/main'

type Child = EntrySpec<Entry>

const file = (path: string, at: Vec2, label: LabelSide): Child => ({
  name: path.split('/').pop()!,
  at,
  label,
  data: { kind: 'file', href: `${REPO}/${path}`, glyph: path.endsWith('.md') ? 'page' : 'text' },
})

const folder = (name: string, at: Vec2, label: LabelSide, branch: BranchSpec, children: Child[]): Child => ({
  name,
  at,
  label,
  branch,
  children,
  data: { kind: 'folder' },
})

export const sample: FolderSpec<Entry> = {
  name: 'nadidazwad/garden',
  branch: {
    width: 8.5,
    path: [
      [-480, 26], [-432, -2], [-396, -18], [-360, -33], [-323, -39], [-287, -33], [-250, -22],
      [-214, -4], [-177, 11], [-141, 19], [-90, 24], [-54, 15], [-25, 0], [4, -9], [41, -12],
      [92, -11], [130, -8], [164, -5], [201, 18], [237, 55], [277, 102],
    ],
    limbs: [
      [[164, -5], [201, -25], [237, -36], [262, -47]],
      [[-60, 18], [-40, -2], [-20, -22]],
      [[-6, -6], [2, -22], [8, -34]],
      [[77, -11], [95, 17], [113, 47]],
      [[222, 42], [265, 40], [312, 43]],
      [[-305, -34], [-262, -10], [-218, 10]],
    ],
  },
  children: [
    folder(
      'src',
      [-145, -47],
      'right',
      {
        path: [
          [-115, -82], [-92, -118], [-68, -165], [-50, -200], [-14, -234], [30, -256], [81, -267],
          [132, -270], [175, -274], [205, -289], [248, -314], [285, -358], [325, -419],
        ],
        limbs: [
          [[23, -251], [45, -290], [66, -332]],
          [[175, -273], [190, -250], [203, -228]],
        ],
      },
      [
        folder(
          'portfolio',
          [4, -158],
          'below',
          {
            path: [
              [18, -186], [40, -192], [62, -180], [81, -162], [117, -147], [161, -139], [205, -139],
              [248, -143], [292, -147], [350, -151], [408, -158], [459, -166], [503, -177], [550, -200],
            ],
            limbs: [
              [[270, -145], [282, -160], [292, -176]],
              [[16, -196], [32, -208], [48, -217]],
            ],
          },
          [
            file('src/portfolio/tree.ts', [110, -94], 'right'),
            folder(
              'writing',
              [321, -202],
              'right',
              {
                path: [
                  [342, -230], [355, -256], [380, -293], [410, -336], [439, -354], [482, -362],
                  [518, -369], [554, -387], [584, -413], [613, -449], [649, -447], [682, -438],
                  [708, -427], [735, -450], [767, -476], [811, -491], [855, -494], [898, -487],
                  [927, -472], [956, -465], [990, -470],
                ],
                limbs: [
                  [[453, -358], [480, -382], [510, -402]],
                  [[392, -311], [425, -306], [453, -308]],
                  [[898, -487], [925, -505], [956, -516]],
                ],
              },
              [
                file('src/portfolio/writing/about.md', [680, -386], 'right'),
                file('src/portfolio/writing/how-this-grew.md', [870, -424], 'right'),
              ],
            ),
            file('src/portfolio/layouts.ts', [290, -110], 'right'),
            file('src/portfolio/media.ts', [503, -121], 'right'),
            file('src/portfolio/phone.json', [600, -170], 'right'),
          ],
        ),
        folder(
          'scene',
          [366, -440],
          'right',
          {
            path: [
              [400, -500], [440, -524], [490, -538], [546, -544], [604, -546], [662, -552], [718, -566],
              [770, -586], [812, -612], [846, -646],
            ],
            limbs: [[[812, -612], [838, -598], [860, -596]]],
          },
          [
            file('src/scene/Scene.tsx', [478, -486], 'right'),
            file('src/scene/plant.ts', [640, -516], 'right'),
            file('src/scene/dither.ts', [800, -536], 'right'),
            file('src/scene/materials.ts', [560, -600], 'right'),
          ],
        ),
        folder(
          'garden',
          [300, -496],
          'left',
          {
            path: [
              [314, -548], [326, -594], [348, -636], [382, -670], [426, -694], [478, -706], [534, -712],
              [590, -722], [640, -742],
            ],
            limbs: [[[534, -712], [544, -744], [540, -770]]],
          },
          [
            file('src/garden/Garden.tsx', [366, -600], 'right'),
            file('src/garden/Nodes.tsx', [430, -650], 'right'),
            file('src/garden/useDrag.ts', [452, -748], 'left'),
            folder(
              'case',
              [668, -752],
              'right',
              {
                path: [[694, -800], [718, -836], [756, -864], [804, -880], [856, -884], [906, -894], [948, -914], [980, -944]],
                limbs: [[[856, -884], [870, -912], [868, -938]]],
              },
              [
                file('src/garden/case/Viewer.tsx', [760, -812], 'right'),
                file('src/garden/case/Strip.tsx', [900, -846], 'right'),
                file('src/garden/case/parse.ts', [1000, -960], 'right'),
              ],
            ),
          ],
        ),
      ],
    ),
    file('package.json', [-250, -84], 'left'),
    file('LICENSE', [37, 46], 'below'),
    file('README.md', [242, -4], 'right'),
  ],
}
