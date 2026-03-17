import { Plugin, PluginKey, TextSelection } from "prosemirror-state";

const task_keymap_plugin_key = new PluginKey("task-keymap");

export function create_task_keymap_prose_plugin(): Plugin {
  return new Plugin({
    key: task_keymap_plugin_key,
    props: {
      handleKeyDown(view, event) {
        if (event.key !== "Backspace") return false;

        const { state, dispatch } = view;
        const { selection } = state;

        if (!(selection instanceof TextSelection) || !selection.empty) {
          return false;
        }

        const $pos = selection.$from;
        const node = $pos.parent;

        if (node.type.name !== "list_item") return false;

        if ($pos.parentOffset === 0) {
          if (
            node.attrs["checked"] !== undefined &&
            node.attrs["checked"] !== null
          ) {
            const tr = state.tr.setNodeMarkup($pos.before(), undefined, {
              ...node.attrs,
              checked: null,
            });
            dispatch(tr);
            return true;
          }
        }

        return false;
      },
    },
  });
}
