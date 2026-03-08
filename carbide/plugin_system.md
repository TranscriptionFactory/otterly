# Carbide Plugin System Design

## Plugin System Strategy

Build a native Carbide plugin API first. Design it with Obsidian-like vocabulary (same concepts, similar method names) so porting is trivial, but don't build a compatibility shim until the app has real users.

## Editor Engine Constraint

Obsidian uses CodeMirror 6 (plain-text, line/column positions). Carbide uses Milkdown/ProseMirror (structured document tree, node-based positions). This is the fundamental constraint that determines which Obsidian plugins could ever be shimmed.

### Obsidian Plugin Compatibility Tiers

| Tier | API Surface | Examples | Shimmable? |
|---|---|---|---|
| Works | Vault I/O, MetadataCache, Commands, Settings, StatusBar, Events | Templater, Linter, Tag Wrangler | Yes — no editor engine dependency |
| Translatable | `Editor` abstraction (`getCursor`, `replaceSelection`, `getLine`), `MarkdownPostProcessor`, `registerMarkdownCodeBlockProcessor` | Dataview, Tasks, Admonitions | Yes, with line/col ↔ ProseMirror position adapter |
| Impossible | `editor.cm` (raw CM6 EditorView), CM6 extensions/decorations/state, custom `ItemView` subclasses, deep `WorkspaceLeaf` manipulation | Vim mode, Style Settings, custom view plugins | No — requires CM6 on ProseMirror |

Many of the highest-value community plugins (Dataview, Tasks, Templater, Calendar, Kanban) are in Tiers 1-2.

## Native Plugin API Design

### Architecture

```
┌─────────────────────────────────────────────────┐
│  Main App (Trusted)                             │
│  ┌───────────────────────────────────────────┐  │
│  │ Plugin Host                               │  │
│  │  - Manifest loader + permission validator │  │
│  │  - RPC dispatcher (postMessage ↔ API)     │  │
│  │  - Capability gate (check perms per call) │  │
│  │  - Network proxy (credential injection)   │  │
│  │  - Output sanitizer (HTML/XSS)           │  │
│  │  - Rate limiter                           │  │
│  └───────────────────────────────────────────┘  │
│         ▲ postMessage RPC                       │
│         │                                        │
│  ┌──────┴──────┐  ┌──────────────┐              │
│  │ Plugin A    │  │ Plugin B     │  (iframes)   │
│  │ (sandboxed) │  │ (sandboxed)  │              │
│  └─────────────┘  └──────────────┘              │
└─────────────────────────────────────────────────┘
```

### Plugin Structure

Each plugin lives in `<vault>/.carbide/plugins/<name>/`:
- `manifest.json` — name, version, permissions, api_version
- `main.js` — compiled entry point
- `styles.css` — optional styles

### Permission Model

Granular, capability-based permissions declared in manifest:
- `fs:read`, `fs:write` — vault file access
- `editor:read`, `editor:modify` — editor state access
- `network:fetch` — HTTP requests (proxied through host)
- `ui:panel`, `ui:statusbar` — UI slot access
- `commands:register` — command palette registration

Plugins that need API keys (e.g. Zotero) declare `credentials: ["zotero_api_key"]`. The host proxies HTTP and injects credentials — the plugin iframe never sees raw keys.

### API Surface

Design with Obsidian-like vocabulary for easy porting:

- `vault.read(path)`, `vault.create(path, content)`, `vault.modify(path, content)`, `vault.delete(path)`, `vault.list()`
- `editor.getCursor()`, `editor.getSelection()`, `editor.replaceSelection(text)`, `editor.getValue()`, `editor.setValue(content)`
- `commands.register({ id, name, callback })`, `commands.remove(id)`
- `ui.addStatusBarItem()`, `ui.addSidebarPanel()`, `ui.addRibbonIcon()`
- `events.on('file-change', cb)`, `events.on('active-file-change', cb)`
- `settings.register(settingsTab)`
- `metadata.getFileCache(path)` — frontmatter, links, headings, tags

### Plugin Lifecycle

`discover → validate manifest → load iframe → activate (onload) → running → deactivate (onunload)`

Hot-reload in dev mode via file watcher on the plugin directory.

## Obsidian Compatibility Layer (Deferred)

If Carbide gains users, build `@carbide/obsidian-compat` as a separate package:

### How the Shim Works

Intercept `import { Plugin, Vault, Editor } from 'obsidian'` with a compatibility module:

```
Obsidian plugin's main.js
        │
        ▼
  shimmed `obsidian` module
   ├── Plugin base class      → Carbide plugin lifecycle
   ├── app.vault.*             → Carbide vault.* API
   ├── app.metadataCache.*     → Carbide metadata.* API
   ├── app.workspace.*         → Carbide workspace state
   ├── Editor.*                → line/col ↔ ProseMirror position adapter
   ├── addCommand()            → Carbide commands.register()
   ├── addStatusBarItem()      → Carbide ui.addStatusBarItem()
   └── registerMarkdown*()     → post-process Milkdown's rendered output
```

Loading: scan `.obsidian/plugins/` or `.carbide/compat/` → read `manifest.json` + `main.js` → inject shimmed module → call `onload()` → catch unsupported API calls.

### Hard Problems in the Compat Layer

1. **MetadataCache** — Obsidian maintains a live index of every file's frontmatter, links, headings, tags. Carbide must build this from scratch (parse all .md, incremental updates on change). Many popular plugins depend on it.
2. **Editor position mapping** — `{line: 5, ch: 12}` ↔ ProseMirror `ResolvedPos`. Fiddly around embedded nodes (images, code blocks, math blocks).
3. **Undocumented internals** — Plugins accessing `(app as any).plugins`, `(app as any).internalPlugins`, `leaf.view.sourceMode`. Impossible to shim without reverse engineering.
4. **Event timing semantics** — When does `vault.on('modify')` fire relative to MetadataCache updates? Poorly documented, but plugins depend on ordering.

### Legal

`obsidian.d.ts` on npm is MIT-licensed. Clean-room shim from type definitions is fine. Behavioral compatibility requires care to avoid reverse engineering the proprietary runtime.

### Effort Estimate

Even scoped to the top 20 plugins: ~2-3 months (Vault shim, MetadataCache, Editor adapter, event system, testing against real plugins). Not justified until Carbide has real adoption.

## Ironclaw Assessment

Evaluated [nearai/ironclaw](https://github.com/nearai/ironclaw) for plugin design inspiration. Ironclaw is a headless AI agent runtime with WASM-sandboxed tools — fundamentally different problem (request/response tool execution vs long-lived UI plugins in a desktop editor). The "transferable" patterns (capability permissions, manifest schemas, credential isolation) are standard plugin security patterns that don't require ironclaw as a reference. Obsidian and VS Code are far closer analogues. **Verdict: not useful for Carbide's plugin design.**

## Implementation Plan

### Phase 1: Native Plugin API (with Tier 1-3 features)
- Plugin host, manifest loader, permission validator
- iframe sandbox + postMessage RPC bridge
- TypeScript SDK: `@carbide/plugin-api`
- Demo plugins: Hello World, Word Count, LaTeX Snippets

### Phase 2: MetadataCache Infrastructure
- Parse all vault .md files for frontmatter, links, headings, tags
- Incremental updates on file change
- Expose via `metadata.getFileCache(path)`
- Enables query-based plugins (Dataview-like)

### Phase 3: Obsidian Compatibility (only if users demand it)
- `@carbide/obsidian-compat` shimming Tier 1-2 APIs
- Plugin compatibility checker (static analysis of `main.js` → report)
- Tested against top 20 community plugins
