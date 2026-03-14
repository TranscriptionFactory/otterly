import { describe, it, expect } from "vitest";
import {
  screen_to_canvas,
  canvas_to_screen,
  zoom_at_point,
  clamp_zoom,
  fit_to_content,
  ZOOM_MIN,
  ZOOM_MAX,
} from "$lib/features/canvas/domain/canvas_viewport";

describe("clamp_zoom", () => {
  it("clamps below minimum", () => {
    expect(clamp_zoom(0.01)).toBe(ZOOM_MIN);
  });

  it("clamps above maximum", () => {
    expect(clamp_zoom(10)).toBe(ZOOM_MAX);
  });

  it("passes through valid zoom", () => {
    expect(clamp_zoom(1.5)).toBe(1.5);
  });
});

describe("screen_to_canvas", () => {
  it("converts at identity camera", () => {
    const result = screen_to_canvas(100, 200, { x: 0, y: 0, zoom: 1 });
    expect(result).toEqual({ x: 100, y: 200 });
  });

  it("accounts for camera offset", () => {
    const result = screen_to_canvas(100, 200, { x: 50, y: 100, zoom: 1 });
    expect(result).toEqual({ x: 150, y: 300 });
  });

  it("accounts for zoom", () => {
    const result = screen_to_canvas(200, 400, { x: 0, y: 0, zoom: 2 });
    expect(result).toEqual({ x: 100, y: 200 });
  });
});

describe("canvas_to_screen", () => {
  it("converts at identity camera", () => {
    const result = canvas_to_screen(100, 200, { x: 0, y: 0, zoom: 1 });
    expect(result).toEqual({ x: 100, y: 200 });
  });

  it("is inverse of screen_to_canvas", () => {
    const camera = { x: 50, y: -30, zoom: 1.5 };
    const canvas_point = screen_to_canvas(300, 400, camera);
    const screen_point = canvas_to_screen(
      canvas_point.x,
      canvas_point.y,
      camera,
    );
    expect(screen_point.x).toBeCloseTo(300);
    expect(screen_point.y).toBeCloseTo(400);
  });
});

describe("zoom_at_point", () => {
  it("preserves the screen point in canvas space", () => {
    const camera = { x: 100, y: 100, zoom: 1 };
    const screen_x = 200;
    const screen_y = 150;

    const before = screen_to_canvas(screen_x, screen_y, camera);
    const new_camera = zoom_at_point(camera, screen_x, screen_y, 2);
    const after = screen_to_canvas(screen_x, screen_y, new_camera);

    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  it("clamps zoom to bounds", () => {
    const camera = { x: 0, y: 0, zoom: 1 };
    const result = zoom_at_point(camera, 0, 0, 100);
    expect(result.zoom).toBe(ZOOM_MAX);
  });
});

describe("fit_to_content", () => {
  it("returns identity for empty nodes", () => {
    const result = fit_to_content([], 800, 600);
    expect(result).toEqual({ x: 0, y: 0, zoom: 1 });
  });

  it("centers a single small node", () => {
    const nodes = [{ x: 100, y: 100, width: 200, height: 100 }];
    const result = fit_to_content(nodes, 800, 600);
    expect(result.zoom).toBeLessThanOrEqual(1);
    expect(result.zoom).toBeGreaterThan(0);
  });

  it("zooms out for large content", () => {
    const nodes = [{ x: 0, y: 0, width: 2000, height: 2000 }];
    const result = fit_to_content(nodes, 800, 600);
    expect(result.zoom).toBeLessThan(1);
  });
});
