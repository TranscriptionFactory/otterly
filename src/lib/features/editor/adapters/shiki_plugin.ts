import { $prose } from "@milkdown/kit/utils";
import { Plugin, PluginKey } from "@milkdown/kit/prose/state";
import { Decoration, DecorationSet } from "@milkdown/kit/prose/view";
import type { Node as ProseNode } from "@milkdown/kit/prose/model";
import type { HighlighterCore } from "shiki/core";
import {
  get_highlighter_sync,
  resolve_language,
  resolve_theme,
} from "./shiki_highlighter";

export const shiki_plugin_key = new PluginKey<ShikiPluginState>(
  "shiki-highlight",
);

type ShikiPluginState = {
  decorations: DecorationSet;
  theme: string;
};

function build_decorations(
  doc: ProseNode,
  highlighter: HighlighterCore,
  theme: string,
): DecorationSet {
  const decorations: Decoration[] = [];

  doc.descendants((node, pos) => {
    if (node.type.name !== "code_block") return;

    const code = node.textContent;
    if (!code) return;

    const raw_lang = node.attrs.language as string | null | undefined;
    const lang = resolve_language(raw_lang);
    if (!lang) return;

    try {
      const { tokens } = highlighter.codeToTokens(code, {
        lang,
        theme,
      });

      let offset = pos + 1;

      for (let line_idx = 0; line_idx < tokens.length; line_idx++) {
        const line = tokens[line_idx]!;
        for (const token of line) {
          const from = offset;
          const to = from + token.content.length;

          if (token.color) {
            let style = `color:${token.color}`;
            if (token.fontStyle !== undefined && token.fontStyle & 1) {
              style += ";font-style:italic";
            }
            if (token.fontStyle !== undefined && token.fontStyle & 2) {
              style += ";font-weight:bold";
            }
            decorations.push(Decoration.inline(from, to, { style }));
          }

          offset = to;
        }
        if (line_idx < tokens.length - 1) {
          offset += 1;
        }
      }
    } catch {
      // unsupported language or parse error — fall back to unstyled
    }
  });

  return DecorationSet.create(doc, decorations);
}

export const shiki_plugin = $prose(() => {
  let theme_observer: MutationObserver | null = null;

  return new Plugin({
    key: shiki_plugin_key,

    state: {
      init(_, { doc }): ShikiPluginState {
        const highlighter = get_highlighter_sync();
        const theme = resolve_theme();
        if (!highlighter) {
          return { decorations: DecorationSet.empty, theme };
        }
        return {
          theme,
          decorations: build_decorations(doc, highlighter, theme),
        };
      },

      apply(tr, prev_state): ShikiPluginState {
        const meta = tr.getMeta(shiki_plugin_key) as
          | Partial<ShikiPluginState>
          | undefined;
        const theme = meta?.theme ?? prev_state.theme;
        const theme_changed =
          meta?.theme !== undefined && meta.theme !== prev_state.theme;

        if (!tr.docChanged && !theme_changed) {
          return {
            theme,
            decorations: prev_state.decorations.map(tr.mapping, tr.doc),
          };
        }

        const highlighter = get_highlighter_sync();
        if (!highlighter) {
          return {
            theme,
            decorations: prev_state.decorations.map(tr.mapping, tr.doc),
          };
        }

        return {
          theme,
          decorations: build_decorations(tr.doc, highlighter, theme),
        };
      },
    },

    props: {
      decorations(state) {
        return shiki_plugin_key.getState(state)?.decorations;
      },
    },

    view(editor_view) {
      theme_observer = new MutationObserver(() => {
        const new_theme = resolve_theme();
        const current = shiki_plugin_key.getState(editor_view.state);
        if (current && current.theme !== new_theme) {
          const tr = editor_view.state.tr.setMeta(shiki_plugin_key, {
            theme: new_theme,
          });
          editor_view.dispatch(tr);
        }
      });

      theme_observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["data-color-scheme"],
      });

      return {
        destroy() {
          theme_observer?.disconnect();
          theme_observer = null;
        },
      };
    },
  });
});
