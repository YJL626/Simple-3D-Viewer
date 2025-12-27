# Simple 3D Viewer

Offline-first 3D model viewer built with Wails + React + three.js. Drag, drop, inspect, and validate animation or morph targets quickly.

## Highlights
- Offline-ready (bundled sample models + Draco decoders).
- Drag-and-drop loading.
- Formats: DRC, GLB, GLTF, OBJ, PLY, STL, USDZ (USD should be converted to USDZ).
- Model stats: triangles, vertices, meshes, materials, bounding size.
- Lighting presets + viewer modes (Orbit, Presentation, Stage).
- Animation playback + morph targets (shape keys).
- FPS + frame time overlay.
- Leva controls and bilingual UI (Chinese/English, default Chinese).

## Usage
- Click **Load fox.glb (animation test)**.
- Click **Load suzanna.glb (morph test)**.
- Or drag and drop your own model onto the canvas.
- Use the left panel or Leva for quick toggles and lights.

## Development
Frontend (from `frontend/`):
- `pnpm run dev`
- `pnpm run build`
- `pnpm run preview`

Wails:
- `wails dev`
- `wails build`

## Assets
- `frontend/public/fox.glb` (animation test)
- `frontend/public/suzanna.glb` (morph target test)
- `frontend/public/draco` (Draco decoder files)

## Notes
- For USD files, convert to USDZ before loading.

## Screenshots
Add screenshots or gifs here for GitHub.
