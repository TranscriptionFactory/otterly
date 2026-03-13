<script lang="ts">
  import { get_app_context } from "$lib/app/di/app_context";
  import { Table, List, RefreshCw } from "lucide-static";

  const { stores, services } = get_app_context();
  const bases_store = stores.bases;
  const vault_store = stores.vault;

  function refresh() {
    const vault_id = vault_store.active_vault_id;
    if (vault_id) {
      void services.bases.refresh_properties(vault_id);
      void services.bases.run_query(vault_id);
    }
  }
</script>

<div class="h-full flex flex-col bg-white dark:bg-zinc-950">
  <div class="flex items-center justify-between px-4 py-2 border-b border-zinc-200 dark:border-zinc-800">
    <div class="flex items-center gap-4">
      <h2 class="text-sm font-semibold">Bases</h2>
      <div class="flex items-center bg-zinc-100 dark:bg-zinc-900 rounded-md p-0.5">
        <button 
          class="p-1 rounded {bases_store.active_view_mode === 'table' ? 'bg-white dark:bg-zinc-800 shadow-sm' : ''}"
          onclick={() => bases_store.active_view_mode = 'table'}
        >
          <Table size={14} />
        </button>
        <button 
          class="p-1 rounded {bases_store.active_view_mode === 'list' ? 'bg-white dark:bg-zinc-800 shadow-sm' : ''}"
          onclick={() => bases_store.active_view_mode = 'list'}
        >
          <List size={14} />
        </button>
      </div>
    </div>
    <button 
      class="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-900 rounded-md"
      onclick={refresh}
      disabled={bases_store.loading}
    >
      <RefreshCw size={14} class={bases_store.loading ? 'animate-spin' : ''} />
    </button>
  </div>

  <div class="flex-1 overflow-auto p-4">
    {#if bases_store.loading && bases_store.result_set.length === 0}
      <div class="h-full flex items-center justify-center text-zinc-500">
        <RefreshCw size={24} class="animate-spin" />
      </div>
    {:else if bases_store.error}
      <div class="p-4 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-md text-sm">
        {bases_store.error}
      </div>
    {:else if bases_store.result_set.length === 0}
      <div class="h-full flex items-center justify-center text-zinc-500 text-sm">
        No results found.
      </div>
    {:else}
      <div class="space-y-4">
        {#each bases_store.result_set as row}
          <div class="p-3 border border-zinc-200 dark:border-zinc-800 rounded-lg hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors">
            <div class="flex items-start justify-between mb-2">
              <h3 class="text-sm font-medium">{row.note.title || row.note.name}</h3>
              <span class="text-[10px] text-zinc-400 tabular-nums">{row.note.path}</span>
            </div>
            
            <div class="flex flex-wrap gap-2 mb-2">
              {#each row.tags as tag}
                <span class="px-1.5 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-900 text-[10px] text-zinc-600 dark:text-zinc-400">
                  #{tag}
                </span>
              {/each}
            </div>

            <div class="grid grid-cols-2 gap-x-4 gap-y-1">
              {#each Object.entries(row.properties) as [key, prop]}
                <div class="flex items-center gap-2 text-[11px]">
                  <span class="text-zinc-500 truncate">{key}:</span>
                  <span class="text-zinc-700 dark:text-zinc-300 truncate font-medium">{prop.value}</span>
                </div>
              {/each}
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>
