import type { Camera } from "$lib/features/canvas/types/canvas";

export const ZOOM_MIN = 0.1;
export const ZOOM_MAX = 5;
export const ZOOM_STEP = 0.1;

export function clamp_zoom(zoom: number): number {
  return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoom));
}

export function screen_to_canvas(
  screen_x: number,
  screen_y: number,
  camera: Camera,
): { x: number; y: number } {
  return {
    x: screen_x / camera.zoom + camera.x,
    y: screen_y / camera.zoom + camera.y,
  };
}

export function canvas_to_screen(
  canvas_x: number,
  canvas_y: number,
  camera: Camera,
): { x: number; y: number } {
  return {
    x: (canvas_x - camera.x) * camera.zoom,
    y: (canvas_y - camera.y) * camera.zoom,
  };
}

export function zoom_at_point(
  camera: Camera,
  screen_x: number,
  screen_y: number,
  new_zoom: number,
): Camera {
  const clamped = clamp_zoom(new_zoom);
  const before = screen_to_canvas(screen_x, screen_y, camera);
  const after_x = screen_x / clamped;
  const after_y = screen_y / clamped;
  return {
    x: before.x - after_x,
    y: before.y - after_y,
    zoom: clamped,
  };
}

export function fit_to_content(
  nodes: Array<{ x: number; y: number; width: number; height: number }>,
  viewport_width: number,
  viewport_height: number,
  padding: number = 60,
): Camera {
  if (nodes.length === 0) {
    return { x: 0, y: 0, zoom: 1 };
  }

  let min_x = Infinity;
  let min_y = Infinity;
  let max_x = -Infinity;
  let max_y = -Infinity;

  for (const node of nodes) {
    min_x = Math.min(min_x, node.x);
    min_y = Math.min(min_y, node.y);
    max_x = Math.max(max_x, node.x + node.width);
    max_y = Math.max(max_y, node.y + node.height);
  }

  const content_width = max_x - min_x;
  const content_height = max_y - min_y;

  const available_width = viewport_width - padding * 2;
  const available_height = viewport_height - padding * 2;

  if (available_width <= 0 || available_height <= 0) {
    return { x: min_x, y: min_y, zoom: 1 };
  }

  const zoom = clamp_zoom(
    Math.min(
      available_width / content_width,
      available_height / content_height,
      1,
    ),
  );

  const center_x = (min_x + max_x) / 2;
  const center_y = (min_y + max_y) / 2;

  return {
    x: center_x - viewport_width / 2 / zoom,
    y: center_y - viewport_height / 2 / zoom,
    zoom,
  };
}
