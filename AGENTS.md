# Repository Guidelines

## Project Structure & Module Organization
- Go backend (`main.go`, `app.go`) hosts the Wails window, embeds `frontend/dist`, and exposes app methods; build-tag configs live in `config_debug.go` and `config_release.go`.
- Frontend lives in `frontend/` with React + Vite + TypeScript entrypoints (`src/main.tsx`, `src/App.tsx`) plus shared assets/styles under `src/assets`, `App.css`, and `style.css`.
- Public runtime assets live in `frontend/public` (example model `example.glb` and Draco decoders under `public/draco` for offline loading).
- Build artifacts: `frontend/dist` is produced by Vite; Wails packages binaries and platform assets into `build/`.
- Project config sits in `wails.json`; package management and locks stay in `frontend/` (`pnpm-lock.yaml`, `pnpm-workspace.yaml`).

## Build, Test, and Development Commands
- `pnpm install` (inside `frontend/`) installs UI deps; Wails hooks call it automatically.
- `pnpm run dev` – Vite-only UI dev server; `pnpm run build` – TypeScript check + Vite production bundle; `pnpm run preview` – serve built UI.
- `wails dev` – Go backend with hot-reloading frontend (also `task dev`).
- `wails build -tags release` or `task build` – production app (frameless/fullscreen).
- `task lint` – `go build`, `go vet`, and TypeScript type check. Run before PRs.

## Coding Style & Naming Conventions
- Go: format with `gofmt`; exported identifiers use PascalCase; keep functions context-aware.
- TypeScript/React: strict mode on; prefer functional components with PascalCase filenames; hooks start with `use`; shared utilities in `frontend/src/lib`; use the `@/*` path alias.
- Styling: Tailwind v4 utilities first; keep bespoke styles alongside components and prune unused classes.

## Testing Guidelines
- No automated tests yet; add Go unit tests as `*_test.go` beside sources and run `go test ./...`.
- For UI, adopt Vitest + React Testing Library when introduced; meanwhile rely on type checks and manual QA via `pnpm run preview` or `wails dev`.

## Commit & Pull Request Guidelines
- No existing history—use Conventional Commits (`feat:`, `fix:`, `chore:`) in present tense with concise scope.
- PRs should describe intent, list commands run (`task lint`, `pnpm run build`), note tested platforms, and attach screenshots/gifs for UI changes.
- Keep changes focused; avoid mixing unrelated frontend and backend refactors unless tightly coupled.

## Security & Configuration Tips
- Keep secrets out of the repo; configure environment-specific values externally.
- Wails window flags differ by build tag (`config_debug.go` vs `config_release.go`); verify UX in both debug and release.
- Update `wails.json` when renaming the app or changing frontend tooling; rebuild frontend (`pnpm run build`) so embedded assets stay current.
