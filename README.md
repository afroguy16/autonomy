# Agent Infrastructure Map (prototype)

A browser prototype of a 3D, drive-through network map of people, organizations and agents building agent infrastructure. Built with Three.js and TypeScript. It ships with **fake, seeded sample data**; every account, handle and source is invented and links to `example.com`.

## Run it

No install is needed to view it. Three.js loads from jsDelivr through an import map.

```bash
python3 -m http.server 5173     # or: npm run serve
# open http://localhost:5173
```

Opening `index.html` straight from disk won't work, because browsers block ES modules on `file://`.

To change the code:

```bash
npm install              # esbuild + typescript
npm run typecheck        # tsc, strict
npm run build            # bundles src/ -> app.js (three stays external)
python3 build-artifact.py  # optional: one self-contained page -> dist/agent-map.html
```

## Controls

| Action | Mouse / touch | Keyboard (map focused) |
|---|---|---|
| Look around | drag | A/D or ←/→ turn |
| Dive / zoom toward a point | scroll toward it, pinch | + / − |
| Drive forward / back | — | W/S or ↑/↓ |
| Rise / sink | — | E/Q |
| Pan | right-drag or shift-drag, two-finger drag | — |
| Back to the wide view | ⤢ button, or click the minimap | 0 or Home |
| Search | — | `/` |
| Clear selection | click empty space | Esc |

The depth slider on the right is a continuous zoom control. It's also the keyboard-accessible way to zoom.

## Adding data

The app accepts the merged `GraphMap` shape (`src/types.ts`). It also accepts the older CPM shape: `human`/`org` types, `label` for the name, `from`/`to` on edges, and evidence URLs, which become source records.

- **Load JSON** button, or drop a `.json` file onto the map, then choose Merge or Replace.
- From code: `agentMap.addData(json)`, `agentMap.replaceData(json)`, `agentMap.getData()`, `agentMap.report()`.
- **+ Sample batch** adds a few fake accounts so you can watch them settle into place.

Positions are never stored. Each load re-runs the layout from the edges, keeping existing accounts where they were, so new records slot in next to the accounts they link to.

## Files

- `src/types.ts` — the unified data shape, unchanged from the brief
- `src/seed.ts` — deterministic fake seed and sample batches
- `src/normalize.ts` — CPM mapping, merging, validation, and the on-map / off-map decision
- `src/layout.ts` — 3D force layout driven only by edges
- `src/camera.ts` — orbit / dive / drive camera with eased, log-scale zoom
- `src/scene.ts` — Three.js scene: nodes, edges, labels, depth reveal, picking, input
- `src/main.ts` — search, filters, details, list, legend, minimap, data report
