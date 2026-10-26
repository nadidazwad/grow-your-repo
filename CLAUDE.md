# grow-your-repo

Paste a public GitHub repo's link and its file tree grows as a dithered plant, the way Nadid Azwad's portfolio (`~/Projects/azwad`, live as nadidazwad/garden) grows its folders. Explore it like the portfolio: the root grows in, a folder grows its branch when opened, and a file opens on GitHub. Vite + React 19 + TypeScript, three.js via `@react-three/fiber`, Tailwind v4. A static site on Vercel (`grow-your-repo.vercel.app`, linked from the portfolio's `fun/`); `vercel.json` sends every page path to `index.html`.

## Map
- `src/repo/`: a pasted link to a repo. `parseLink` reads the forms people paste; `fetchRepo` gets the tree in two requests and says why it failed (`RepoError`); `buildTree` nests and sorts it.
- `src/place/`: a repo's tree → a placed `FolderSpec`. `placeRepo(repo, shape)` places the trunk and top level; each folder is a seed placed when it first opens: a seeded steering walk (`walk.ts`) that sways in gestures and follows the clearest way out of a crowd (`routes.ts`), with entries hung along it and a corridor kept clear out of every folder. One chain is open at a time (`exclusive`), so a branch only keeps clear of its ancestors and their names. `shapes.ts` holds `wide` (desktop) and `tall` (phone, a vine up a 420 px column): frame, walls, gestures, batch size and where the name stands. A branch carries a batch of entries; the rest hang off a `..` node at its tip (`idOf`/`pathOf` map repo paths to grove ids).
- `src/grove/`: the file tree as a plant, with no three.js. `createGrove(spec)` owns growth, open/close, the location (the open path) and the camera; scene and labels both read it. It takes a `FolderSpec` (world px, y down): each entry's `at` and label side, each folder's branch path and limbs, or a seed whose `grow()` places it on first open.
- `src/scene/`: everything three.js. `<Scene grove keepOut scale dpr />` draws each branch as lit tubes and instanced leaves, runs the dither pass and steps the grove each frame, so labels and pixels move together. Lazy-loaded.
- `src/garden/`: the page around the plant. `<Garden tree ground exclusive keepOut>{(grove, view) => …}</Garden>` grows one placed tree: names pinned to the plant (`Nodes.tsx`), drag/scroll/fling panning, viewport scale, and the plant's sounds (`sounds.ts`). `Entry` is what a node carries; `labelArea` works out where a node's words sit from the font's measured advances; `glyphOf` picks a file's glyph by its name.
- `src/app/`: the page. `App.tsx` reads the address (`/owner/repo/path?ref=`), fetches and places with `useRepo`, and keys a `<Garden>` by repo; `address.ts` keeps the address and the open chain in step; `Masthead.tsx` is the repo's name on the ground, which is also the field another repo is pasted into; `lines.tsx` is the line of words above it for each moment.
- `src/dev/` (dev only): `/__overview?repo=facebook/react&open=packages` draws a saved repo's open chain as lines and flags crowded or overlapping labels (`&all` shows every top-level chain, `&shape=tall` the phone's); `/__grown?repo=…&open=…&shape=…` grows it as the real plant. `crowding.ts` holds the checks; `trees/` holds saved trees of a small, a medium and a huge repo.
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
