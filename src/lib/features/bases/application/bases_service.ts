import type { VaultId } from "$lib/shared/types/ids";
import type { BasesPort, BaseQuery } from "../ports";
import type { BasesStore } from "../state/bases_store.svelte";

export class BasesService {
  constructor(
    private port: BasesPort,
    private store: BasesStore
  ) {}

  async refresh_properties(vault_id: VaultId) {
    try {
      const props = await this.port.list_properties(vault_id);
      this.store.available_properties = props;
    } catch (e) {
      this.store.error = String(e);
    }
  }

  async run_query(vault_id: VaultId, query?: BaseQuery) {
    const q = query ?? this.store.query;
    this.store.loading = true;
    this.store.error = null;
    try {
      const results = await this.port.query(vault_id, q);
      this.store.set_results(results);
    } catch (e) {
      this.store.error = String(e);
    } finally {
      this.store.loading = false;
    }
  }
}
