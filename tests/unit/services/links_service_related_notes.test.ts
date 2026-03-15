import { describe, expect, it, vi } from "vitest";
import { LinksService } from "$lib/features/links/application/links_service";
import { LinksStore } from "$lib/features/links/state/links_store.svelte";
import { VaultStore } from "$lib/features/vault/state/vault_store.svelte";
import { as_note_path } from "$lib/shared/types/ids";
import { create_test_vault } from "../helpers/test_fixtures";
import type { NoteMeta } from "$lib/shared/types/note";
import type { SemanticSearchHit } from "$lib/shared/types/search";

function note(path: string): NoteMeta {
  return {
    id: as_note_path(path),
    path: as_note_path(path),
    name: path.split("/").pop()?.replace(".md", "") ?? "",
    title: path.split("/").pop()?.replace(".md", "") ?? "",
    mtime_ms: 0,
    size_bytes: 0,
  };
}

function hit(path: string, distance = 0.2): SemanticSearchHit {
  return { note: note(path), distance };
}

function make_search_port(
  find_similar_notes_impl?: () => Promise<SemanticSearchHit[]>,
) {
  return {
    search_notes: vi.fn().mockResolvedValue([]),
    suggest_wiki_links: vi.fn().mockResolvedValue([]),
    suggest_planned_links: vi.fn().mockResolvedValue([]),
    get_note_links_snapshot: vi.fn().mockResolvedValue({
      backlinks: [],
      outlinks: [],
      orphan_links: [],
    }),
    extract_local_note_links: vi.fn().mockResolvedValue({
      outlink_paths: [],
      external_links: [],
    }),
    rewrite_note_links: vi
      .fn()
      .mockImplementation((markdown: string) =>
        Promise.resolve({ markdown, changed: false }),
      ),
    resolve_note_link: vi.fn().mockResolvedValue(null),
    resolve_wiki_link: vi.fn().mockResolvedValue(null),
    semantic_search: vi.fn().mockResolvedValue([]),
    hybrid_search: vi.fn().mockResolvedValue([]),
    get_embedding_status: vi.fn().mockResolvedValue({
      total_notes: 0,
      embedded_notes: 0,
      model_version: "unavailable",
      is_embedding: false,
    }),
    find_similar_notes: find_similar_notes_impl
      ? vi.fn().mockImplementation(find_similar_notes_impl)
      : vi.fn().mockResolvedValue([]),
    rebuild_embeddings: vi.fn().mockResolvedValue(undefined),
  };
}

describe("LinksService.load_related_notes", () => {
  it("loads similar notes and updates store", async () => {
    const hits = [hit("a.md", 0.1), hit("b.md", 0.3)];
    const search_port = make_search_port(() => Promise.resolve(hits));
    const vault_store = new VaultStore();
    vault_store.set_vault(create_test_vault());
    const links_store = new LinksStore();

    const service = new LinksService(search_port, vault_store, links_store);
    await service.load_related_notes("target.md");

    expect(search_port.find_similar_notes).toHaveBeenCalledWith(
      "vault-1",
      "target.md",
      10,
      false,
    );
    expect(links_store.related_notes_status).toBe("ready");
    expect(links_store.related_notes_note_path).toBe("target.md");
    expect(links_store.related_notes).toEqual(hits);
    expect(links_store.related_notes_error).toBeNull();
  });

  it("clears related notes when no vault is selected", async () => {
    const search_port = make_search_port();
    const vault_store = new VaultStore();
    const links_store = new LinksStore();
    links_store.set_related_notes("old.md", [hit("x.md")]);

    const service = new LinksService(search_port, vault_store, links_store);
    await service.load_related_notes("target.md");

    expect(search_port.find_similar_notes).not.toHaveBeenCalled();
    expect(links_store.related_notes_status).toBe("idle");
    expect(links_store.related_notes).toEqual([]);
  });

  it("sets error status on port failure", async () => {
    const search_port = make_search_port(() =>
      Promise.reject(new Error("embedding unavailable")),
    );
    const vault_store = new VaultStore();
    vault_store.set_vault(create_test_vault());
    const links_store = new LinksStore();

    const service = new LinksService(search_port, vault_store, links_store);
    await service.load_related_notes("target.md");

    expect(links_store.related_notes_status).toBe("error");
    expect(links_store.related_notes_note_path).toBe("target.md");
    expect(links_store.related_notes_error).toMatch("embedding unavailable");
    expect(links_store.related_notes).toEqual([]);
  });

  it("ignores stale response when note path changed mid-flight", async () => {
    let resolve_first!: (hits: SemanticSearchHit[]) => void;
    let resolve_second!: (hits: SemanticSearchHit[]) => void;
    let call = 0;

    const search_port = make_search_port(() => {
      call += 1;
      if (call === 1) {
        return new Promise<SemanticSearchHit[]>((res) => {
          resolve_first = res;
        });
      }
      return new Promise<SemanticSearchHit[]>((res) => {
        resolve_second = res;
      });
    });

    const vault_store = new VaultStore();
    vault_store.set_vault(create_test_vault());
    const links_store = new LinksStore();

    const service = new LinksService(search_port, vault_store, links_store);

    const first = service.load_related_notes("a.md");
    const second = service.load_related_notes("b.md");

    resolve_second([hit("b/related.md")]);
    await second;

    resolve_first([hit("a/related.md")]);
    await first;

    expect(links_store.related_notes_note_path).toBe("b.md");
    expect(links_store.related_notes.map((h) => h.note.path)).toEqual([
      "b/related.md",
    ]);
  });

  it("clears related notes via clear_related_notes()", () => {
    const search_port = make_search_port();
    const vault_store = new VaultStore();
    vault_store.set_vault(create_test_vault());
    const links_store = new LinksStore();
    links_store.set_related_notes("target.md", [hit("x.md")]);

    const service = new LinksService(search_port, vault_store, links_store);
    service.clear_related_notes();

    expect(links_store.related_notes_status).toBe("idle");
    expect(links_store.related_notes).toEqual([]);
    expect(links_store.related_notes_note_path).toBeNull();
  });
});
