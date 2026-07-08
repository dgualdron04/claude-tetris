# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Vanilla JavaScript Tetris. No dependencies, no build step, no package.json — just `index.html`, `style.css`, and `game.js`.

## Running / testing

There is no build or test suite. To run the game:

```bash
start index.html        # Windows: open directly, or
npx serve .              # serve locally, then open http://localhost:8000
```

Verify changes by opening the page in a browser and playing (arrow keys to move/rotate, Space for hard drop, P to pause). There is no automated test to run instead.

## Architecture

Everything lives in `game.js` (~300 lines), driven by module-level mutable state (`board`, `current`, `next`, `score`, `lines`, `level`, `paused`, `gameOver`, `dropInterval`, etc.) rather than a class or store — keep new logic consistent with that style rather than introducing state management abstractions.

- **Board**: `ROWS × COLS` matrix (`createBoard`), each cell `0` (empty) or a color index `1–7`.
- **Pieces**: `PIECES` are square matrices of color indices. `rotateCW` does a transpose + column reversal; `tryRotate` applies it with wall-kick offsets `[0, -1, 1, -2, 2]`, taking the first offset that doesn't collide.
- **Collision**: `collide(shape, ox, oy)` is the single source of truth used by movement, rotation, ghost-piece projection, and spawn checks.
- **Game loop**: `loop(ts)` runs via `requestAnimationFrame`, accumulates `dt` into `dropAccum`, and advances the piece one row (or calls `lockPiece`) once `dropAccum >= dropInterval`.
- **Locking**: `lockPiece` → `merge` (bakes piece into `board`) → `clearLines` (scans bottom-up, splices full rows, unshifts empty ones, updates score/level/`dropInterval`) → `spawn` (promotes `next` to `current`, generates a new `next`, calls `endGame` if the new piece already collides at spawn).
- **Scoring/level**: `LINE_SCORES = [0, 100, 300, 500, 800]` × `level`; level = `floor(lines / 10) + 1`; `dropInterval = max(100, 1000 - (level - 1) * 90)`.
- **Rendering**: `draw()` clears and redraws the grid, settled board, ghost piece (`ghostY()` projects `current` straight down, drawn at `globalAlpha = 0.2`), then the current piece. `drawNext()` renders the preview canvas the same way.
- All DOM/canvas element references are grabbed once at the top of `game.js` via `getElementById` — there's no re-querying inside functions.

Tunable constants at the top of `game.js` (`COLS`, `ROWS`, `BLOCK`, `COLORS`, `LINE_SCORES`, `dropInterval`): if `COLS`/`ROWS`/`BLOCK` change, also update the `<canvas id="board">` `width`/`height` in `index.html` to match (`COLS × BLOCK` by `ROWS × BLOCK`).
