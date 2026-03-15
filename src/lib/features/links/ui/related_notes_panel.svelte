<script lang="ts">
  import LinkSection from "$lib/features/links/ui/link_section.svelte";
  import LinkItem from "$lib/features/links/ui/link_item.svelte";
  import { use_app_context } from "$lib/app/context/app_context.svelte";
  import { ACTION_IDS } from "$lib/app";

  const { stores, action_registry } = use_app_context();

  const status = $derived(stores.links.related_notes_status);
  const error = $derived(stores.links.related_notes_error);
  const hits = $derived(stores.links.related_notes);

  function open_note(path: string) {
    void action_registry.execute(ACTION_IDS.note_open, path);
  }

  function title_from_path(path: string): string {
    const leaf = path.split("/").pop() ?? path;
    return leaf.endsWith(".md") ? leaf.slice(0, -3) : leaf;
  }

  function similarity_label(distance: number): string {
    const pct = Math.round((1 - distance) * 100);
    return `${String(pct)}%`;
  }
</script>

<div class="RelatedNotesPanel">
  <LinkSection title="Related" count={hits.length}>
    {#if status === "loading"}
      <p class="RelatedNotesPanel__loading">Loading related notes...</p>
    {:else if status === "error"}
      <p class="RelatedNotesPanel__error">
        {error ?? "Related notes unavailable"}
      </p>
    {:else if hits.length === 0}
      <p class="RelatedNotesPanel__empty">No related notes found</p>
    {:else}
      {#each hits as hit (hit.note.path)}
        <LinkItem
          title={hit.note.title || title_from_path(hit.note.path)}
          path={hit.note.path}
          meta={similarity_label(hit.distance)}
          onclick={() => open_note(hit.note.path)}
        />
      {/each}
    {/if}
  </LinkSection>
</div>

<style>
  .RelatedNotesPanel {
    display: flex;
    flex-direction: column;
    overflow-y: auto;
    height: 100%;
  }

  .RelatedNotesPanel__empty {
    font-size: var(--text-xs);
    color: var(--muted-foreground);
    padding: var(--space-1) var(--space-3) var(--space-1) var(--space-6);
    margin: 0;
  }

  .RelatedNotesPanel__loading {
    font-size: var(--text-xs);
    color: var(--muted-foreground);
    padding: var(--space-1) var(--space-3) var(--space-1) var(--space-6);
    margin: 0;
  }

  .RelatedNotesPanel__error {
    font-size: var(--text-xs);
    color: var(--destructive);
    padding: var(--space-1) var(--space-3) var(--space-1) var(--space-6);
    margin: 0;
  }
</style>
