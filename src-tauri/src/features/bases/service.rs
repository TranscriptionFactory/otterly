use crate::features::search::db as search_db;
use crate::features::search::model::{BaseQuery, BaseQueryResults, PropertyInfo};
use crate::features::search::service as search_service;
use tauri::{AppHandle, Manager};

#[tauri::command]
pub fn bases_list_properties(app: AppHandle, vault_id: String) -> Result<Vec<PropertyInfo>, String> {
    search_service::with_read_conn(&app, &vault_id, |conn| {
        search_db::list_all_properties(conn)
    })
}

#[tauri::command]
pub fn bases_query(
    app: AppHandle,
    vault_id: String,
    query: BaseQuery,
) -> Result<BaseQueryResults, String> {
    search_service::with_read_conn(&app, &vault_id, |conn| {
        search_db::query_bases(conn, query)
    })
}
