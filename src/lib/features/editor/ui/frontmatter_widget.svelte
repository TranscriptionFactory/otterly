<script lang="ts">
  import { type EditorView } from "@milkdown/kit/prose/view";
  import { type Node as ProseNode } from "@milkdown/kit/prose/model";
  import { Plus, X, Tag } from "lucide-static";

  let { 
    node, 
    view, 
    get_pos 
  }: { 
    node: ProseNode; 
    view: EditorView; 
    get_pos: () => number | undefined 
  } = $props();

  // Parse YAML from node content
  // For now, let's just show a simple key-value editor
  // In a real implementation, we'd use js-yaml
  
  function update_node(new_content: string) {
    const pos = get_pos();
    if (pos === undefined) return;
    
    const tr = view.state.tr.insertText(new_content, pos + 1, pos + 1 + node.content.size);
    view.dispatch(tr);
  }

  // Simplified parsing for MVP
  let properties = $state<{key: string, value: string}[]>([]);
  let tags = $state<string[]>([]);

  $effect(() => {
    const content = node.textContent;
    // Basic parser for "key: value" lines
    const lines = content.split('\n');
    const new_props: {key: string, value: string}[] = [];
    const new_tags: string[] = [];

    for (const line of lines) {
      if (line.trim() === '---') continue;
      const match = line.match(/^([^:]+):\s*(.*)$/);
      if (match) {
        const key = match[1].trim();
        const value = match[2].trim();
        if (key === 'tags' || key === 'tag') {
           // simple tag parser for [tag1, tag2] or just one tag
           if (value.startsWith('[') && value.endsWith(']')) {
             new_tags.push(...value.slice(1, -1).split(',').map(t => t.trim()));
           } else {
             new_tags.push(value);
           }
        } else {
          new_props.push({key, value});
        }
      }
    }
    properties = new_props;
    tags = new_tags;
  });

  function save() {
    let yaml = '---\n';
    for (const prop of properties) {
      if (prop.key) {
        yaml += `${prop.key}: ${prop.value}\n`;
      }
    }
    if (tags.length > 0) {
      yaml += `tags: [${tags.join(', ')}]\n`;
    }
    yaml += '---';
    update_node(yaml);
  }

  function add_property() {
    properties.push({key: '', value: ''});
  }

  function remove_property(index: number) {
    properties.splice(index, 1);
    save();
  }

  function add_tag() {
    tags.push('new-tag');
    save();
  }

  function remove_tag(index: number) {
    tags.splice(index, 1);
    save();
  }
</script>

<div class="frontmatter-widget p-4 mb-4 border border-zinc-200 dark:border-zinc-800 rounded-lg bg-zinc-50 dark:bg-zinc-900/50">
  <div class="flex items-center justify-between mb-4">
    <h3 class="text-xs font-semibold uppercase tracking-wider text-zinc-500 flex items-center gap-2">
      <Tag size={14} />
      Metadata
    </h3>
  </div>

  <div class="space-y-3">
    {#each properties as prop, i}
      <div class="flex items-center gap-2">
        <input 
          type="text" 
          bind:value={prop.key} 
          onblur={save}
          placeholder="Key"
          class="flex-1 bg-transparent border-b border-zinc-200 dark:border-zinc-800 px-1 py-0.5 text-sm focus:border-zinc-400 outline-none"
        />
        <input 
          type="text" 
          bind:value={prop.value} 
          onblur={save}
          placeholder="Value"
          class="flex-[2] bg-transparent border-b border-zinc-200 dark:border-zinc-800 px-1 py-0.5 text-sm focus:border-zinc-400 outline-none"
        />
        <button onclick={() => remove_property(i)} class="p-1 hover:text-red-500">
          <X size={14} />
        </button>
      </div>
    {/each}

    <div class="flex flex-wrap gap-2 pt-2">
      {#each tags as tag, i}
        <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-zinc-200 dark:bg-zinc-800 text-xs">
          {tag}
          <button onclick={() => remove_tag(i)} class="hover:text-red-500">
            <X size={10} />
          </button>
        </span>
      {/each}
      <button 
        onclick={add_tag}
        class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-dashed border-zinc-300 dark:border-zinc-700 text-xs hover:bg-zinc-100 dark:hover:bg-zinc-800"
      >
        <Plus size={10} />
        Add tag
      </button>
    </div>

    <button 
      onclick={add_property}
      class="text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 flex items-center gap-1 pt-2"
    >
      <Plus size={14} />
      Add property
    </button>
  </div>
</div>

<style>
  .frontmatter-widget {
    user-select: none;
  }
  input {
    user-select: text;
  }
</style>
