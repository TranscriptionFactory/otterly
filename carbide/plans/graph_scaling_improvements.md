# Graph Scaling Improvements — Implementation Plan

Supersedes the SVG+DOM rendering decisions in `a1_full_vault_graph.md` (D2, D5).
The current implementation works well up to ~300–500 notes but degrades beyond that due to SVG/DOM overhead, O(n²) force simulation, and lack of viewport culling.

## Decision Log

| #   | Decision                                                                           | Rationale                                                                                                                                                                                                                                                                          |
| --- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Switch vault graph rendering from SVG+HTML to **PixiJS 8 (WebGL2/WebGPU)** Canvas  | SVG creates one DOM node per graph element — at 2k+ nodes the browser spends more time on layout/paint than on physics. PixiJS renders everything in a single `<canvas>`, batch-draws thousands of sprites per frame, and already supports WebGPU for future-proofing. ~45KB gzip. |
| D2  | Keep **d3-force** for layout, move simulation to a **Web Worker**                  | d3-force is proven and already integrated. At 5k nodes `forceManyBody` takes 8–15ms/tick — enough to cause jank on 60fps. A dedicated worker keeps the UI thread free. Position updates sent via `Float64Array` transferables (~80KB for 5k nodes) with zero-copy overhead.        |
| D3  | Implement **spatial index viewport culling** via a grid-based hash                 | Only render nodes/edges whose bounding box intersects the visible viewport. For a 5k-node graph at typical zoom, ~200–500 nodes are visible. Grid hash gives O(1) lookups per cell vs. O(n) full scan. Simpler than a quadtree and sufficient for uniform-ish force layouts.       |
| D4  | **Adaptive force stabilization** — tick budget scales with node count              | Current fixed 150 ticks is too few for 5k+ nodes and wasted for 50-node graphs. New formula: `clamp(node_count * 0.5, 50, 500)` ticks, with an early-exit when `alpha < 0.001`.                                                                                                    |
| D5  | **Batch semantic KNN** into a single Rust command                                  | Current approach fires n parallel IPC calls. At 200 notes that's 200 round-trips. A single `semantic_search_batch` command runs all KNN queries on the Rust side, deduplicates edges there, and returns one payload. Reduces IPC overhead from O(n) to O(1).                       |
| D6  | **Streaming vault graph** via chunked IPC for vaults >5k notes                     | Below 5k the existing single-shot `graph_load_vault_graph` is fine. Above 5k, a chunked variant sends nodes/edges in pages of 1k, letting the frontend start rendering immediately. Uses Tauri event channel, not polling.                                                         |
| D7  | **Level-of-detail (LOD)** rendering — labels hidden at low zoom, nodes become dots | At zoom levels where labels would be <6px, skip text rendering entirely. Below a second threshold, render nodes as 2px circles instead of full sprites. Reduces draw calls by 60–80% when zoomed out on large graphs.                                                              |
| D8  | Keep **neighborhood graph as SVG** (no migration)                                  | Neighborhood view shows <100 nodes with fixed layout. SVG+HTML gives accessible, interactive buttons with native focus/hover. No performance issue, no reason to change.                                                                                                           |

## Rejected Alternatives

| Alternative                           | Why Rejected                                                                                                                                                                   |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| sigma.js                              | Tightly coupled to its own graph model and camera system. Less control over rendering pipeline. PixiJS is lower-level but gives us exactly the control we need.                |
| @cosmograph/cosmos (GPU force layout) | GPU-accelerated force layout is impressive but adds a heavy WASM/WebGPU dependency and is less mature. d3-force in a worker is sufficient for our 10k target.                  |
| Canvas2D (no WebGL)                   | Canvas2D can't batch draw calls — each `fillRect`/`fillText` is a separate GPU command. At 5k nodes with labels, WebGL batching is 5–10x faster.                               |
| SharedArrayBuffer for worker comms    | Requires `Cross-Origin-Isolation` headers that Tauri's webview doesn't reliably support. Transferable `Float64Array` achieves zero-copy without COOP/COEP constraints.         |
| Quadtree for viewport culling         | More complex to maintain than a grid hash for our use case. Force layouts produce roughly uniform distributions — grid cells work well. Quadtree is better for clustered data. |
| WASM-based force simulation           | Marginal speedup over JS for n-body at this scale. Worker isolation already solves the jank problem. WASM adds build complexity.                                               |

---

## Phase 1: WebGL Renderer + Viewport Culling

**Goal:** Replace SVG rendering in vault graph with PixiJS Canvas. Largest single performance win.

### A. New Dependencies

```
pnpm add pixi.js@^8
```

No additional Rust dependencies.

### B. New Files

#### `src/lib/features/graph/domain/vault_graph_renderer.ts`

WebGL rendering engine wrapping PixiJS.

```typescript
interface GraphRenderer {
  initialize(container: HTMLElement): void;
  set_graph(nodes: RenderedNode[], edges: RenderedEdge[]): void;
  update_positions(positions: Float64Array): void;
  set_viewport(x: number, y: number, zoom: number): void;
  highlight_node(id: string | null): void;
  select_node(id: string | null): void;
  set_filter(matching_ids: Set<string>): void;
  set_semantic_edges(edges: SemanticEdge[], visible: boolean): void;
  destroy(): void;

  // Events
  on_node_click: (id: string) => void;
  on_node_hover: (id: string | null) => void;
  on_background_drag: (dx: number, dy: number) => void;
  on_zoom: (delta: number, center: { x: number; y: number }) => void;
}
```

Implementation:

- `Application` with single `Container` holding two layers: edges (`Graphics` batch) and nodes (`Container` of `Sprite`+`Text` pairs)
- Node sprites: pre-rendered circle texture (shared across all nodes) with tint for state (selected, hovered, dimmed, default)
- Edge rendering: single `Graphics` object with `moveTo/lineTo` per visible edge. Semantic edges use dashed line pattern
- Labels: `BitmapText` on each node sprite, visibility controlled by LOD zoom threshold
- Hit testing: PixiJS built-in `eventMode: 'static'` on node sprites for click/hover. No custom hit testing needed

#### `src/lib/features/graph/domain/spatial_index.ts`

Grid-based spatial hash for viewport culling.

```typescript
interface SpatialIndex {
  rebuild(nodes: { id: string; x: number; y: number }[]): void;
  query_viewport(x: number, y: number, width: number, height: number): string[];
}
```

Implementation:

- Fixed cell size (e.g., 200px in graph-space)
- `Map<string, string[]>` where key is `${col},${row}` and value is node IDs in that cell
- `rebuild()` on every position update from worker (amortized O(n))
- `query_viewport()` iterates cells overlapping the viewport rect, collects node IDs. O(cells) where cells ≈ viewport_area / cell_area

#### `src/lib/features/graph/domain/vault_graph_worker.ts`

Web Worker running d3-force simulation.

```typescript
// Worker message protocol
type WorkerInbound =
  | {
      type: "init";
      nodes: { id: string; x?: number; y?: number }[];
      edges: { source: string; target: string }[];
    }
  | { type: "tick_budget"; ticks: number }
  | { type: "reheat"; alpha?: number }
  | { type: "pin_node"; id: string; x: number; y: number }
  | { type: "unpin_node"; id: string }
  | { type: "stop" };

type WorkerOutbound =
  | { type: "positions"; buffer: Float64Array } // [x0, y0, x1, y1, ...]
  | { type: "stabilized" }
  | { type: "tick"; alpha: number };
```

Implementation:

- Imports `d3-force` standalone (no DOM dependency — works in worker)
- On `init`: create simulation with same forces as current (link: 80, charge: -200, center, collide: 20)
- Adaptive tick count: `clamp(nodes.length * 0.5, 50, 500)`, early exit on `alpha < 0.001`
- After stabilization, enters idle mode — only recomputes on `reheat` (e.g., after drag-pin)
- Positions sent as `Float64Array` via `postMessage(buffer, [buffer.buffer])` for zero-copy transfer

### C. Modified Files

#### `src/lib/features/graph/ui/vault_graph_canvas.svelte`

Major rewrite. Current: SVG+HTML rendering with inline d3-force. New: thin Svelte wrapper around `GraphRenderer`.

Changes:

- Remove all SVG/HTML node rendering (`{#each}` blocks for nodes and edges)
- Remove inline d3-force simulation code
- Add `<div bind:this={container}>` as the PixiJS mount point
- Initialize `GraphRenderer` + `Worker` in `$effect` on mount
- Wire renderer events → store mutations (hover, select, filter)
- Wire store state → renderer methods (highlight, select, semantic toggle)
- Keep pan/zoom UX controls (Cmd+scroll zoom, drag to pan) but delegate to renderer's viewport
- Keep the filter input, stats display, semantic toggle, and large-vault warning as HTML overlay

#### `src/lib/features/graph/domain/vault_graph_layout.ts`

Simplify significantly:

- Remove `create_vault_graph_simulation()` and `stabilize_simulation()` (moved to worker)
- Remove `resolve_vault_graph_view()` position computation (renderer handles this)
- Keep `VaultGraphView` type and `resolve_vault_graph_view()` for deriving visibility/highlight state (filter matching, connected-to-hovered logic), but output node IDs + states rather than positioned elements
- Add `compute_adaptive_tick_budget(node_count: number): number` helper

### D. LOD Rendering

Implemented inside `vault_graph_renderer.ts`:

| Zoom Level | Node Rendering      | Label Rendering | Edge Rendering      |
| ---------- | ------------------- | --------------- | ------------------- |
| > 0.6      | Full circle (8px r) | Visible         | Full (1px stroke)   |
| 0.3 – 0.6  | Small circle (4px)  | Hidden          | Thin (0.5px stroke) |
| < 0.3      | Dot (2px)           | Hidden          | Faint (0.3px, 0.3α) |

Thresholds configurable via constants in `vault_graph_renderer.ts`.

### E. Edge Cases

| Case                          | Behavior                                                                                  |
| ----------------------------- | ----------------------------------------------------------------------------------------- |
| WebGL not available           | PixiJS 8 auto-falls back to Canvas2D. No code change needed.                              |
| Browser tab backgrounded      | Worker continues ticking. Renderer pauses via `requestAnimationFrame` naturally stopping. |
| Graph with 0 nodes            | Show "No notes in vault" message (existing behavior, kept as HTML overlay).               |
| Rapid zoom (trackpad inertia) | Debounce spatial index queries to 1 per frame via `requestAnimationFrame` guard.          |
| Node dragged outside viewport | Viewport auto-expands (pan follows dragged node) or node is released at edge.             |
| Component unmount during tick | Worker `terminate()` called in Svelte `onDestroy`. Renderer `destroy()` cleans up PixiJS. |

### F. Performance Targets

| Metric                     | Current (SVG)      | Target (WebGL)                |
| -------------------------- | ------------------ | ----------------------------- |
| 500 nodes render           | ~30fps             | 60fps                         |
| 2000 nodes render          | ~8fps              | 60fps                         |
| 5000 nodes render          | <2fps / unusable   | 45–60fps                      |
| 10000 nodes render         | N/A                | 30–45fps                      |
| Initial stabilization (5k) | ~450ms (blocks UI) | ~600ms (worker, non-blocking) |
| Memory (5k nodes)          | ~80MB (DOM)        | ~25MB (GPU)                   |

---

## Phase 2: Worker-Based Force Simulation

**Goal:** Move d3-force off the main thread. Eliminates jank during stabilization and drag interactions.

### A. Worker Lifecycle

```
mount → create worker → post 'init' with nodes/edges
                       → worker ticks adaptively
                       → worker posts positions each frame
                       → renderer.update_positions(buffer)
                       → spatial_index.rebuild(positions)
                       → renderer culls to viewport
                       → worker posts 'stabilized'
drag  → post 'pin_node' → worker fixes position, reheats
        → post 'unpin_node' on release → worker unfixes, re-stabilizes
unmount → post 'stop' → worker.terminate()
```

### B. Position Transfer Protocol

- Worker allocates `Float64Array(node_count * 2)` — interleaved `[x0, y0, x1, y1, ...]`
- Transferred (not copied) via `postMessage(msg, [buffer])` — zero-copy
- Main thread reads positions, rebuilds spatial index, updates renderer
- Main thread allocates a new buffer for next frame (worker can't reuse transferred buffer)
- At 10k nodes: 160KB per transfer, 60fps = ~9.6MB/s throughput — well within message channel capacity

### C. Adaptive Tick Budget

```typescript
function compute_tick_budget(node_count: number): number {
  const budget = Math.round(node_count * 0.5);
  return Math.max(50, Math.min(budget, 500));
}
```

| Nodes | Ticks | Estimated Stabilization Time |
| ----- | ----- | ---------------------------- |
| 50    | 50    | ~15ms                        |
| 300   | 150   | ~90ms                        |
| 1000  | 500   | ~400ms                       |
| 5000  | 500   | ~600ms                       |
| 10000 | 500   | ~1.2s                        |

Early exit: if `simulation.alpha() < 0.001` before budget exhausted, stop and post `stabilized`.

### D. Reheat on Interaction

- Node drag: `pin_node` message pins the node at cursor position, reheats simulation to `alpha=0.3` with reduced tick budget (50 ticks). This makes nearby nodes react to the drag in real-time.
- Filter change: no reheat needed — filtering is a visual overlay, not a layout change.
- Semantic edge toggle: no reheat — semantic edges are visual-only, not part of the force simulation.

---

## Phase 3: Batched Semantic KNN

**Goal:** Replace n parallel IPC calls with a single batch command.

### A. New Rust Command

In `src-tauri/src/features/search/service.rs`:

```rust
#[tauri::command]
pub async fn semantic_search_batch(
    app: AppHandle,
    vault_id: String,
    paths: Vec<String>,
    limit: usize,
    distance_threshold: f64,
) -> Result<Vec<SemanticEdge>, String>
```

Logic:

1. Open embedding DB for vault
2. For each path in `paths`, run KNN query (reuse existing `knn_search`)
3. Deduplicate edges (bidirectional: sort source/target pair as key)
4. Filter by distance threshold
5. Return flat `Vec<SemanticEdge>`

This runs entirely in Rust — no IPC per note. The KNN queries share the same DB connection and embedding index.

### B. New TypeScript Port Method

In `src/lib/features/graph/ports.ts` (or `SearchPort`):

```typescript
semantic_search_batch(
  vault_id: string,
  paths: string[],
  limit: number,
  distance_threshold: number
): Promise<SemanticEdge[]>
```

### C. Modified Service

In `graph_service.ts`, `load_semantic_edges()`:

```typescript
// Before: n parallel calls
const promises = nodes.map((n) =>
  search_port.semantic_search(vault_id, n.path, knn_limit),
);
const results = await Promise.allSettled(promises);
// ... client-side deduplication

// After: single batch call
const edges = await search_port.semantic_search_batch(
  vault_id,
  nodes.map((n) => n.path),
  knn_limit,
  distance_threshold,
);
store.set_semantic_edges(edges);
```

### D. Performance Impact

| Vault Size | Before (n IPC calls) | After (1 IPC call) |
| ---------- | -------------------- | ------------------ |
| 50 notes   | ~150ms (50 × 3ms)    | ~20ms              |
| 200 notes  | ~600ms (200 × 3ms)   | ~60ms              |
| 500 notes  | N/A (exceeds limit)  | ~150ms             |

With batching, the `SEMANTIC_EDGE_MAX_VAULT_SIZE` limit can be raised from 200 to 500+ notes.

---

## Phase 4: Streaming Vault Graph (>5k notes)

**Goal:** Progressive loading for very large vaults so the user sees results immediately.

### A. Chunked Loading Protocol

Only activates when `node_count > 5000`. Below that, the existing single-shot command is used.

New Rust command:

```rust
#[tauri::command]
pub async fn graph_load_vault_graph_streamed(
    app: AppHandle,
    vault_id: String,
    chunk_size: usize, // default 1000
) -> Result<(), String>
```

Emits Tauri events:

```typescript
type GraphChunkEvent =
  | { type: "nodes"; nodes: VaultGraphNode[]; total: number; progress: number }
  | { type: "edges"; edges: VaultGraphEdge[]; total: number; progress: number }
  | { type: "done"; stats: VaultGraphStats };
```

Sequence:

1. Query total counts
2. Emit node chunks (1k per event) — frontend adds to simulation incrementally
3. Emit edge chunks (1k per event) — frontend adds links, reheats simulation
4. Emit `done` — frontend finalizes

### B. Frontend Integration

In `graph_service.ts`:

```typescript
async load_vault_graph() {
  const snapshot = await this.graph_port.load_vault_graph(vault_id)
  if (snapshot.stats.node_count <= 5000) {
    this.store.set_vault_snapshot(snapshot)
    return
  }
  // Stream mode
  const listener = listen<GraphChunkEvent>('graph-chunk', (event) => {
    if (event.payload.type === 'nodes') {
      worker.postMessage({ type: 'add_nodes', nodes: event.payload.nodes })
    } else if (event.payload.type === 'edges') {
      worker.postMessage({ type: 'add_edges', edges: event.payload.edges })
    } else if (event.payload.type === 'done') {
      worker.postMessage({ type: 'reheat' })
      listener.then(unlisten => unlisten())
    }
  })
  await invoke('graph_load_vault_graph_streamed', { vault_id, chunk_size: 1000 })
}
```

### C. Worker Incremental Mode

Worker message extensions:

```typescript
type WorkerInbound =
  | ... // existing messages
  | { type: 'add_nodes'; nodes: { id: string }[] }
  | { type: 'add_edges'; edges: { source: string; target: string }[] }
```

On `add_nodes`: insert into simulation, assign random initial positions near center.
On `add_edges`: add links to simulation, reheat to `alpha=0.1` (gentle re-layout).

### D. When to Use Streaming

| Vault Size   | Loading Strategy       | Rationale                                   |
| ------------ | ---------------------- | ------------------------------------------- |
| ≤ 5000 notes | Single-shot (existing) | <100ms query, <5MB payload, simple          |
| > 5000 notes | Chunked streaming      | Progressive rendering, no long blank screen |

---

## Phase 5: Cache Invalidation Improvements

**Goal:** Reduce unnecessary full-cache invalidation.

### A. Granular Neighborhood Cache Invalidation

Currently `graph_invalidate_cache` with `target: "neighborhood"` invalidates ALL entries for the vault. This is wasteful — editing note A shouldn't invalidate the cached neighborhood of note Z.

New invalidation strategy:

```rust
fn invalidate_note_neighborhood(vault_id: &str, note_path: &str) {
    // Invalidate the note's own neighborhood
    cache.invalidate(&format!("{}:{}", vault_id, note_path));

    // Invalidate neighborhoods of notes that link TO or FROM this note
    // (their edge lists may have changed)
    let connected = get_connected_paths(vault_id, note_path);
    for path in connected {
        cache.invalidate(&format!("{}:{}", vault_id, path));
    }
}
```

This requires a quick lookup of connected paths from the search DB — but it's a single indexed query, much cheaper than reloading all 64 cached neighborhoods.

### B. Vault Graph Delta Updates

Instead of invalidating the entire vault graph cache on any note change, compute a delta:

```rust
enum VaultGraphDelta {
    NodeAdded(VaultGraphNode),
    NodeRemoved(String),          // path
    NodeRenamed(String, String),  // old_path, new_path
    EdgeAdded(VaultGraphEdge),
    EdgeRemoved(VaultGraphEdge),
}
```

Frontend applies deltas to the existing simulation (add/remove nodes and edges) and reheats. No full reload needed for single-note edits.

This is an optimization — not required for correctness. The current full-invalidation approach works, just wastes bandwidth.

---

## Implementation Sequence

| Phase | Scope                             | Depends On | Estimated Complexity |
| ----- | --------------------------------- | ---------- | -------------------- |
| 1     | WebGL renderer + viewport culling | —          | Large                |
| 2     | Worker-based force simulation     | Phase 1    | Medium               |
| 3     | Batched semantic KNN              | —          | Small                |
| 4     | Streaming vault graph             | Phase 2    | Medium               |
| 5     | Cache invalidation improvements   | —          | Small                |

**Phase 1 and 3 are independent** — can be developed in parallel.
**Phase 2 depends on Phase 1** — the worker communicates with the PixiJS renderer.
**Phase 4 depends on Phase 2** — streaming feeds into the worker's incremental mode.
**Phase 5 is independent** — pure backend optimization.

Recommended execution order: **Phase 3 → Phase 1 → Phase 2 → Phase 5 → Phase 4**.
Phase 3 is the smallest win with the least risk. Phase 1+2 are the biggest wins. Phase 4 is only needed if we want to support >5k note vaults (currently warned against). Phase 5 is a quality-of-life improvement.

---

## Files Summary

### New Files

| File                                                    | Purpose                       |
| ------------------------------------------------------- | ----------------------------- |
| `src/lib/features/graph/domain/vault_graph_renderer.ts` | PixiJS WebGL rendering engine |
| `src/lib/features/graph/domain/spatial_index.ts`        | Grid-based viewport culling   |
| `src/lib/features/graph/domain/vault_graph_worker.ts`   | Web Worker running d3-force   |
| `tests/graph/vault_graph_renderer.test.ts`              | Renderer unit tests           |
| `tests/graph/spatial_index.test.ts`                     | Spatial index unit tests      |
| `tests/graph/vault_graph_worker.test.ts`                | Worker message protocol tests |

### Modified Files

| File                                                  | Changes                                                 |
| ----------------------------------------------------- | ------------------------------------------------------- |
| `src/lib/features/graph/ui/vault_graph_canvas.svelte` | Rewrite: SVG → PixiJS mount + worker lifecycle          |
| `src/lib/features/graph/domain/vault_graph_layout.ts` | Simplify: remove simulation, keep view state derivation |
| `src/lib/features/graph/application/graph_service.ts` | Batch semantic KNN, streaming support                   |
| `src/lib/features/graph/ports.ts`                     | Add `semantic_search_batch` port method                 |
| `src/lib/features/graph/state/graph_store.svelte.ts`  | No major changes — store API stays the same             |
| `src-tauri/src/features/search/service.rs`            | Add `semantic_search_batch` command                     |
| `src-tauri/src/features/graph/service.rs`             | Granular cache invalidation, streaming command          |
| `package.json`                                        | Add `pixi.js@^8`                                        |

### Unchanged

| File                                                 | Why                                               |
| ---------------------------------------------------- | ------------------------------------------------- |
| `src/lib/features/graph/ui/graph_canvas.svelte`      | Neighborhood view stays SVG (D8)                  |
| `src/lib/features/graph/domain/graph_canvas_view.ts` | Neighborhood layout unchanged                     |
| `src-tauri/src/shared/cache.rs`                      | LRU cache works as-is                             |
| `src-tauri/src/features/graph/types.rs`              | Types unchanged (delta types added in service.rs) |

---

## Testing Strategy

### Unit Tests

| Test File                      | Scenarios                                                                                                                                                                            |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `spatial_index.test.ts`        | Empty index returns []. Single node in viewport. Node outside viewport excluded. Rebuild after position change. Cell boundary correctness. Large grid (10k nodes) query <1ms.        |
| `vault_graph_worker.test.ts`   | Init with empty graph. Init with 100 nodes stabilizes. Adaptive tick budget formula. Pin/unpin updates position. Stop terminates cleanly. Position buffer has correct length.        |
| `vault_graph_renderer.test.ts` | Initialize creates canvas. Set graph renders nodes. Highlight changes tint. Filter dims non-matching. LOD hides labels at low zoom. Destroy cleans up. Semantic edges render dashed. |
| `semantic_search_batch` (Rust) | Empty paths returns []. Deduplication of bidirectional edges. Distance threshold filtering. Mixed results (some notes have embeddings, some don't).                                  |

### Integration Tests

| Scenario                               | Assertion                                                    |
| -------------------------------------- | ------------------------------------------------------------ |
| Load vault graph with 100 notes        | All nodes visible, edges rendered, stabilizes in <200ms      |
| Toggle semantic edges on 50-note vault | Dashed edges appear, batch call made (not n calls)           |
| Filter query dims non-matching nodes   | Matching nodes full opacity, others dimmed, edges consistent |
| Zoom out on 1000-node graph            | Labels disappear, nodes shrink, frame rate stays >30fps      |
| Switch vault while graph loading       | Previous load cancelled (revision check), new vault loads    |

### Performance Benchmarks (manual)

| Benchmark                     | Method                                              | Pass Criteria    |
| ----------------------------- | --------------------------------------------------- | ---------------- |
| 5k node render fps            | Chrome DevTools Performance tab, measure paint time | >45fps sustained |
| 10k node render fps           | Same                                                | >30fps sustained |
| Stabilization time (5k nodes) | `performance.now()` around worker init→stabilized   | <1s              |
| Semantic batch (200 notes)    | `performance.now()` around batch call               | <100ms           |
| Memory (5k nodes)             | Chrome DevTools Memory tab                          | <30MB graph-only |
