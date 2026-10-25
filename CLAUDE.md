# grow-your-repo

Paste a public GitHub repo's link and its file tree grows as a dithered plant, the way Nadid Azwad's portfolio (`~/Projects/azwad`, live as nadidazwad/garden) grows its folders. Explore it like the portfolio: the root grows in, a folder grows its branch when opened, and a file opens on GitHub. Vite + React 19 + TypeScript, three.js via `@react-three/fiber`, Tailwind v4. A static site on Vercel (`grow-your-repo.vercel.app`, linked from the portfolio's `fun/`); `vercel.json` sends every page path to `index.html`.

## Map
- `src/grove/`: the file tree as a plant, with no three.js. `createGrove(spec)` owns growth, open/close, the location (the open path) and the camera; scene and labels both read it. It takes a `FolderSpec` with everything already placed (world px, y down): each entry's `at` and label side, each folder's branch path and limbs.
- `src/scene/`: everything three.js. `<Scene grove keepOut scale dpr />` draws each branch as lit tubes and instanced leaves, runs the dither pass and steps the grove each frame, so labels and pixels move together. Lazy-loaded.
- `src/garden/`: the page around the plant. `<Garden tree ground />` grows one placed tree: names pinned to the plant (`Nodes.tsx`), drag/scroll/fling panning, viewport scale, and the plant's sounds (`sounds.ts`). `Entry` is what a node carries; `labelArea` estimates where a node's words sit.
- `src/app/`: the root. `sample.ts` is a hand-placed stand-in tree, to be replaced by fetched, generated ones.
- `src/dev/`: `/__overview` (dev only) draws a tree fully open as lines and flags crowded or overlapping labels; `crowding.ts` holds the checks.
- `src/icons/`: pixel glyphs on the dither grid. `src/sound/`: `sound.play(cue)` and the welcome tune; `cues.ts` is the mix. `src/styles/theme.css`: design tokens as a Tailwind `@theme`; the default palette and text sizes are cleared, so use these tokens or arbitrary values.
- Fonts: PP Neue Montreal, PP Mondwest, PP NeueBit, one weight each, git-ignored in `public/fonts/`. `pnpm build` runs `scripts/fonts.mjs`, which pulls missing ones from the private `nadidazwad/garden-fonts` repo when `FONTS_TOKEN` is set.
- Outside the repo: `~/Projects/azwad` is where all of this came from (its `src/portfolio/tree.ts` is a hand-placed tree to learn the look from); `~/Projects/azwad-reference/plant-concept.mp4` is the concept recording; `~/Projects/azwad-assets/tools/sounds/make.py` renders the sounds.

## Commands
- `pnpm dev`: dev server
- `pnpm build`: fonts + `tsc -b` + `vite build`
- `pnpm lint`: oxlint
- `pnpm test`: vitest

## Rules
- Public GitHub repos only, fetched straight from the browser: no server, no tokens.
- The plant, icons and labels share one pixel grid (`CELL` in `src/grove/view.ts`). The dither pattern is locked to the world and the picture slides by whole device pixels; don't snap the camera to cells (pans stutter) or dither in screen space (pans shimmer).
- Emphasis comes from colour (grey `body` text with `ink`/`accent` phrases), not weight. Each font has only one weight.
- No tilted or rotated text.
- Commit messages end with `Co-Skimmed-By: Nadid Azwad`, never a Claude co-author trailer.
