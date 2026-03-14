<script lang="ts">
  import type { CanvasNode } from "$lib/features/canvas/types/canvas";

  interface Props {
    node: CanvasNode;
  }

  let { node }: Props = $props();

  const node_color = $derived(
    node.color ? `var(--canvas-color-${node.color}, ${node.color})` : undefined,
  );
</script>

<div
  class="CanvasNode CanvasNode--{node.type}"
  style:left="{node.x}px"
  style:top="{node.y}px"
  style:width="{node.width}px"
  style:height="{node.height}px"
  style:--node-color={node_color}
>
  {#if node.type === "text"}
    <div class="CanvasNode__content CanvasNode__content--text">
      {node.text}
    </div>
  {:else if node.type === "file"}
    <div class="CanvasNode__content CanvasNode__content--file">
      <span class="CanvasNode__icon">📄</span>
      <span class="CanvasNode__label">{node.file.split("/").pop()}</span>
    </div>
  {:else if node.type === "link"}
    <div class="CanvasNode__content CanvasNode__content--link">
      <span class="CanvasNode__icon">🔗</span>
      <span class="CanvasNode__label">{node.url}</span>
    </div>
  {:else if node.type === "group"}
    {#if node.label}
      <div class="CanvasNode__group-label">{node.label}</div>
    {/if}
  {/if}
</div>

<style>
  .CanvasNode {
    position: absolute;
    border-radius: 6px;
    overflow: hidden;
    box-sizing: border-box;
    pointer-events: auto;
  }

  .CanvasNode--text,
  .CanvasNode--file,
  .CanvasNode--link {
    background: var(--node-color, var(--card));
    border: 1px solid var(--border);
    box-shadow: 0 1px 3px rgb(0 0 0 / 0.08);
  }

  .CanvasNode--group {
    background: var(--node-color, var(--muted));
    border: 1.5px dashed var(--border);
    opacity: 0.6;
  }

  .CanvasNode__content {
    padding: 12px;
    font-size: 13px;
    line-height: 1.5;
    color: var(--foreground);
    height: 100%;
    overflow: hidden;
  }

  .CanvasNode__content--text {
    white-space: pre-wrap;
    word-break: break-word;
  }

  .CanvasNode__content--file,
  .CanvasNode__content--link {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .CanvasNode__icon {
    font-size: 16px;
    flex-shrink: 0;
  }

  .CanvasNode__label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--muted-foreground);
    font-size: 12px;
  }

  .CanvasNode__group-label {
    position: absolute;
    top: -20px;
    left: 4px;
    font-size: 11px;
    font-weight: 500;
    color: var(--muted-foreground);
    white-space: nowrap;
  }
</style>
