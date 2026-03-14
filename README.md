<img src="./assets/badger_icon_nobackground2.png" alt="Badgerly Carbide" width="150">


## Features

- **Vault-based** — A vault is just a folder. No proprietary database. Use your existing tools (git, sync clients, VS Code) alongside Badgerly without issues.
- **Tab system** — Open multiple notes, pin important ones, and restore closed tabs.
- **WYSIWYG Markdown** — Live rendering as you type via Milkdown/ProseMirror. Headings, tables, task lists, and syntax highlighting included.
- **Wiki-links** — Simple `[[note]]` linking. Badgerly tracks backlinks and outlinks automatically to help you navigate your knowledge base.
- **The Omnibar** — One search bar for everything. Search notes by content (SQLite FTS5) or quickly jump to files by name (`Cmd+P` / `Cmd+O`).
- **Git Integration** — Native support for versioning. View status, stage changes, and commit without leaving the app.
- **Image Paste** — Paste images directly into the editor. They are automatically stored in an assets folder of your choice.
- **Custom Hotkeys** — Rebindable shortcuts for every action in the app.
- **Dark & Light Modes** — Matches your system or toggle manually.

## Getting Started

### Prerequisites

- [Node.js 20+](https://nodejs.org/) and [pnpm](https://pnpm.io/)
- [Rust toolchain](https://rustup.rs/)
- Platform-specific build tools (see [Tauri's guide](https://tauri.app/start/prerequisites/))

### Installation

```bash
pnpm install
pnpm tauri dev
```

To build a production installer for your platform:

```bash
pnpm tauri build
```

## Contributing

We use a Ports and Adapters (Hexagonal) architecture to keep the business logic testable and decoupled from the platform.

- **Business Logic:** Check `src/lib/services/`
- **Architecture Details:** See [architecture.md](./architecture.md)
- **UI & Design System:** See [UI.md](./UI.md)

### Validation

Before submitting a PR, please run:

```bash
pnpm check      # Type checking
pnpm lint       # Linting
pnpm test       # Vitest unit tests
pnpm format     # Prettier
```

## Acknowledgments

Badgerly is a fork of [Otterly]([https://github.com/TranscriptionFactory/otterly](https://github.com/ajkdrag/otterly)). Thank you to the Otterly project for providing the foundation this project builds on.

Thanks also to [Ferrite](https://github.com/OlaProeis/Ferrite), [Moraya](https://github.com/TranscriptionFactory/moraya), [Scratch](https://github.com/erictli/scratch), and [Lokus](https://github.com/lokus-ai/lokus) for inspiration.
## License

MIT - See [LICENSE](./LICENSE) for details.
