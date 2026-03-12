<script lang="ts">
  import { onMount } from "svelte";
  import { Copy, Check } from "@lucide/svelte";
  import type { EditorView } from "@codemirror/view";

  import { use_app_context } from "$lib/app/context/app_context.svelte";

  interface Props {
    content: string | null;
    buffer_id?: string | null;
    line_count?: number | null;
    file_type?: string;
    filename?: string;
    wrap_lines?: boolean;
  }

  let {
    content,
    buffer_id = null,
    line_count = null,
    file_type = "text",
    filename = "",
    wrap_lines = true,
  }: Props = $props();

  const { ports } = use_app_context();
  let container: HTMLDivElement | undefined = $state();
  let view: EditorView | undefined;
  let copied = $state(false);
  let copy_timer: ReturnType<typeof setTimeout> | undefined;

  async function get_full_content(): Promise<string> {
    if (content !== null) return content;
    if (buffer_id && line_count !== null) {
      return await ports.document.read_buffer_window(buffer_id, 0, line_count);
    }
    return "";
  }

  async function copy_content() {
    try {
      const full_content = await get_full_content();
      await navigator.clipboard.writeText(full_content);
      copied = true;
      clearTimeout(copy_timer);
      copy_timer = setTimeout(() => {
        copied = false;
      }, 2000);
    } catch {
      // silently fail
    }
  }

  async function load_initial_content(): Promise<string> {
    if (content !== null) return content;
    if (buffer_id && line_count !== null) {
      // Load first 5000 lines for instant preview
      // If file is larger, we might want a "Load more" button or true virtualization
      const initial_limit = 5000;
      const end = Math.min(line_count, initial_limit);
      let text = await ports.document.read_buffer_window(buffer_id, 0, end);
      if (line_count > initial_limit) {
        text += `\n\n--- FILE TRUNCATED (${line_count} lines total). Virtualized viewing not fully implemented. ---`;
      }
      return text;
    }
    return "";
  }

  onMount(() => {
    let destroyed = false;

    const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;

    const init = async () => {
      const [
        { EditorView, basicSetup },
        { EditorState },
        { LanguageDescription },
        { languages },
        dark_theme,
        initial_text,
      ] = await Promise.all([
        import("codemirror"),
        import("@codemirror/state"),
        import("@codemirror/language"),
        import("@codemirror/language-data"),
        dark ? import("@codemirror/theme-one-dark") : Promise.resolve(null),
        load_initial_content(),
      ]);

      if (destroyed || !container) return;

      const extensions = [
        basicSetup,
        EditorState.readOnly.of(true),
        EditorView.theme({
          "&": { height: "100%", fontSize: "var(--text-sm, 13px)" },
          ".cm-scroller": {
            overflow: "auto",
            fontFamily: "var(--font-mono, monospace)",
          },
        }),
      ];

      if (wrap_lines) {
        extensions.push(EditorView.lineWrapping);
      }

      if (dark_theme) {
        extensions.push(dark_theme.oneDark);
      }

      const target =
        filename || (file_type === "code" ? "file.ts" : "file.txt");
      const lang_desc = LanguageDescription.matchFilename(languages, target);

      if (lang_desc) {
        try {
          const lang_support = await lang_desc.load();
          if (!destroyed) extensions.push(lang_support);
        } catch {
          // language load failed, proceed without highlighting
        }
      }

      if (destroyed || !container) return;

      view = new EditorView({
        doc: initial_text,
        extensions,
        parent: container,
      });
    };

    init();

    return () => {
      destroyed = true;
      clearTimeout(copy_timer);
      view?.destroy();
    };
  });

  $effect(() => {
    if (!view) return;
    load_initial_content().then((text) => {
      if (!view) return;
      const current = view.state.doc.toString();
      if (current !== text) {
        view.dispatch({
          changes: { from: 0, to: current.length, insert: text },
        });
      }
    });
  });
</script>

<div class="CodeViewer">
  <div class="CodeViewer__editor" bind:this={container}></div>
  <button
    class="CodeViewer__copy"
    onclick={copy_content}
    aria-label="Copy code"
  >
    {#if copied}
      <Check class="h-3.5 w-3.5" />
      <span>Copied!</span>
    {:else}
      <Copy class="h-3.5 w-3.5" />
      <span>Copy</span>
    {/if}
  </button>
</div>

<style>
  .CodeViewer {
    position: relative;
    height: 100%;
    overflow: hidden;
    background-color: var(--background);
    color: var(--foreground);
  }

  .CodeViewer__editor {
    height: 100%;
    overflow: hidden;
  }

  .CodeViewer__copy {
    position: absolute;
    top: var(--space-2);
    right: var(--space-2);
    display: flex;
    align-items: center;
    gap: var(--space-1);
    padding: var(--space-1) var(--space-2);
    border-radius: var(--radius-md);
    border: 1px solid var(--border);
    background-color: var(--background);
    color: var(--muted-foreground);
    font-size: var(--text-sm);
    cursor: pointer;
    opacity: 0;
    transition:
      opacity 0.15s ease,
      background-color 0.15s ease;
  }

  .CodeViewer:hover .CodeViewer__copy {
    opacity: 1;
  }

  .CodeViewer__copy:hover {
    background-color: var(--accent);
    color: var(--foreground);
  }
</style>
