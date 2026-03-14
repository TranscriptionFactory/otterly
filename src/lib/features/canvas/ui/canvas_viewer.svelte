<script lang="ts">
  import { use_app_context } from "$lib/app/context/app_context.svelte";
  import type { CanvasTabState } from "$lib/features/canvas/state/canvas_store.svelte";
  import type { Camera } from "$lib/features/canvas/types/canvas";
  import CanvasSurface from "$lib/features/canvas/ui/canvas_surface.svelte";

  interface Props {
    tab_id: string;
    file_path: string;
    file_type: "canvas" | "excalidraw";
  }

  let { tab_id, file_path, file_type }: Props = $props();
  const { stores } = use_app_context();

  const canvas_state: CanvasTabState | undefined = $derived(
    stores.canvas.get_state(tab_id),
  );

  function handle_camera_change(camera: Camera) {
    stores.canvas.set_camera(tab_id, camera);
  }
</script>

<div class="CanvasViewer">
  {#if canvas_state?.status === "loading"}
    <div class="CanvasViewer__state">
      <span>Loading canvas…</span>
    </div>
  {:else if canvas_state?.status === "error"}
    <div class="CanvasViewer__state CanvasViewer__state--error">
      <span>{canvas_state.error_message ?? "Failed to load canvas"}</span>
    </div>
  {:else if canvas_state?.status === "ready" && canvas_state.canvas_data}
    <CanvasSurface
      canvas_data={canvas_state.canvas_data}
      camera={canvas_state.camera}
      on_camera_change={handle_camera_change}
    />
  {:else}
    <div class="CanvasViewer__state">
      <span>No canvas loaded</span>
    </div>
  {/if}
</div>

<style>
  .CanvasViewer {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
  }

  .CanvasViewer__state {
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 1;
    font-size: var(--text-sm);
    color: var(--muted-foreground);
  }

  .CanvasViewer__state--error {
    color: var(--destructive);
  }
</style>
