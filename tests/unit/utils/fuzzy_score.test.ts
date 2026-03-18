import { describe, it, expect } from "vitest";
import { fuzzy_score, fuzzy_score_multi } from "$lib/shared/utils/fuzzy_score";

describe("fuzzy_score", () => {
  it("returns null for empty query", () => {
    expect(fuzzy_score("", "hello")).toBeNull();
  });

  it("returns null when query is longer than target", () => {
    expect(fuzzy_score("abcdef", "abc")).toBeNull();
  });

  it("returns null when characters are not present in order", () => {
    expect(fuzzy_score("xyz", "hello")).toBeNull();
    expect(fuzzy_score("ba", "abc")).toBeNull();
  });

  it("matches exact string", () => {
    const result = fuzzy_score("hello", "hello");
    expect(result).not.toBeNull();
    expect(result?.indices).toEqual([0, 1, 2, 3, 4]);
  });

  it("matches case-insensitively", () => {
    const result = fuzzy_score("hello", "Hello World");
    expect(result).not.toBeNull();
  });

  it("matches subsequence characters", () => {
    const result = fuzzy_score("tbl", "Table");
    expect(result).not.toBeNull();
    expect(result?.indices).toEqual([0, 2, 3]);
  });

  it("scores word boundary matches higher", () => {
    const boundary = fuzzy_score("tz", "Toggle Zen Mode");
    const mid = fuzzy_score("tz", "Blitzing");
    expect(boundary).not.toBeNull();
    expect(mid).not.toBeNull();
    expect(boundary?.score).toBeGreaterThan(mid?.score ?? 0);
  });

  it("scores start-of-string matches higher", () => {
    const start = fuzzy_score("to", "Toggle");
    const mid = fuzzy_score("to", "AutoToggle");
    expect(start).not.toBeNull();
    expect(mid).not.toBeNull();
    expect(start?.score).toBeGreaterThan(mid?.score ?? 0);
  });

  it("scores consecutive matches higher", () => {
    const consecutive = fuzzy_score("tab", "Table");
    const scattered = fuzzy_score("tab", "Task Blockquote");
    expect(consecutive).not.toBeNull();
    expect(scattered).not.toBeNull();
    expect(consecutive?.score).toBeGreaterThan(scattered?.score ?? 0);
  });

  it("matches camelCase boundaries", () => {
    const result = fuzzy_score("gp", "gitPush");
    expect(result).not.toBeNull();
    expect(result?.indices).toEqual([0, 3]);
  });

  it("matches path separators as boundaries", () => {
    const result = fuzzy_score("sa", "src/architecture");
    expect(result).not.toBeNull();
  });

  it("handles real command palette queries", () => {
    expect(fuzzy_score("togzen", "Toggle Zen Mode")).not.toBeNull();
    expect(fuzzy_score("newn", "Create New Note")).not.toBeNull();
    expect(fuzzy_score("gtp", "Git Push")).not.toBeNull();
    expect(fuzzy_score("bq", "Blockquote")).not.toBeNull();
  });
});

describe("fuzzy_score_multi", () => {
  it("returns null when no target matches", () => {
    expect(fuzzy_score_multi("xyz", "abc", "def")).toBeNull();
  });

  it("returns the best score across targets", () => {
    const result = fuzzy_score_multi("zen", "Toggle Zen Mode", "zenith");
    expect(result).not.toBeNull();
    const direct = fuzzy_score("zen", "zenith");
    expect(result?.score).toBe(direct?.score);
  });

  it("works with single target", () => {
    const multi = fuzzy_score_multi("tbl", "Table");
    const single = fuzzy_score("tbl", "Table");
    expect(multi).toEqual(single);
  });
});
