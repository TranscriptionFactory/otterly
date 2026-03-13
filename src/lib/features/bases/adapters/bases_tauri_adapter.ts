import { invoke } from "@tauri-apps/api/core";
import type { BasesPort, BaseQuery, BaseQueryResults, PropertyInfo } from "../ports";
import type { VaultId } from "$lib/shared/types/ids";

export function create_bases_tauri_adapter(): BasesPort {
  return {
    async list_properties(vault_id: VaultId): Promise<PropertyInfo[]> {
      return invoke("bases_list_properties", { vaultId: vault_id });
    },
    async query(vault_id: VaultId, query: BaseQuery): Promise<BaseQueryResults> {
      return invoke("bases_query", { vaultId: vault_id, query });
    }
  };
}
