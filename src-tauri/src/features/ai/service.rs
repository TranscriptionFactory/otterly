use crate::features::pipeline::service as pipeline;
use serde::{Deserialize, Serialize};
use std::path::{Component, PathBuf};
use std::process::Stdio;
use tempfile::tempdir;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiExecutionResult {
    pub success: bool,
    pub output: String,
    pub error: Option<String>,
}

impl From<pipeline::PipelineResult> for AiExecutionResult {
    fn from(res: pipeline::PipelineResult) -> Self {
        Self {
            success: res.success,
            output: res.output,
            error: res.error,
        }
    }
}

fn resolved_command(command: Option<String>, fallback: &str) -> String {
    let trimmed = command.unwrap_or_default().trim().to_string();
    if trimmed.is_empty() {
        fallback.to_string()
    } else {
        trimmed
    }
}

fn validate_note_path(vault_path: &str, note_path: &str) -> Result<(), String> {
    let vault_root = PathBuf::from(vault_path)
        .canonicalize()
        .map_err(|_| "Invalid vault path".to_string())?;
    let note_path_buf = PathBuf::from(note_path);

    if note_path_buf.is_absolute() {
        return Err("Note path must be relative to the vault".to_string());
    }

    for component in note_path_buf.components() {
        if matches!(
            component,
            Component::ParentDir | Component::RootDir | Component::Prefix(_)
        ) {
            return Err("Note path must stay inside the vault".to_string());
        }
    }

    let extension = note_path_buf
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("");
    if !extension.eq_ignore_ascii_case("md") && !extension.eq_ignore_ascii_case("markdown") {
        return Err("AI editing is only supported for markdown files".to_string());
    }

    let joined = vault_root.join(note_path_buf);
    if !joined.starts_with(&vault_root) {
        return Err("Note path must stay inside the vault".to_string());
    }

    Ok(())
}

async fn execute_ai_cli(
    _cli_name: &str,
    command: String,
    args: Vec<String>,
    stdin_input: Option<String>,
    current_dir: String,
    not_found_msg: String,
    timeout_seconds: Option<u64>,
    output_path: Option<PathBuf>,
) -> Result<AiExecutionResult, String> {
    let res =
        pipeline::execute_pipeline(command, args, stdin_input, current_dir, timeout_seconds, output_path)
            .await?;

    let mut ai_res: AiExecutionResult = res.into();
    if !ai_res.success && ai_res.error.as_deref().is_some_and(|e| e.contains("Command not found")) {
        ai_res.error = Some(not_found_msg);
    }
    Ok(ai_res)
}

fn codex_args(output_path: &str) -> Vec<String> {
    vec![
        "exec".to_string(),
        "--skip-git-repo-check".to_string(),
        "--output-last-message".to_string(),
        output_path.to_string(),
        "-".to_string(),
    ]
}

fn ollama_model_name(model: &str) -> String {
    let trimmed = model.trim();
    if trimmed.is_empty() {
        "qwen3:8b".to_string()
    } else {
        trimmed.to_string()
    }
}

#[tauri::command]
pub async fn ai_check_cli(provider: String, command: Option<String>) -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let path = pipeline::get_expanded_path();
        let default_command = match provider.as_str() {
            "claude" => "claude",
            "codex" => "codex",
            "ollama" => "ollama",
            _ => return Err(format!("Unsupported AI provider: {}", provider)),
        };
        let command = resolved_command(command, default_command);
        pipeline::check_cli_exists(&command, &path)
    })
    .await
    .map_err(|e| format!("Failed to check AI CLI: {}", e))?
}

#[tauri::command]
pub async fn ai_execute_claude(
    vault_path: String,
    note_path: String,
    prompt: String,
    command: Option<String>,
    timeout_seconds: Option<u64>,
) -> Result<AiExecutionResult, String> {
    validate_note_path(&vault_path, &note_path)?;
    let command = resolved_command(command, "claude");

    execute_ai_cli(
        "Claude",
        command,
        vec![
            "-p".to_string(),
            prompt,
            "--output-format".to_string(),
            "text".to_string(),
        ],
        None,
        vault_path,
        "Claude CLI not found. Please install it from https://code.claude.com/docs/en/quickstart"
            .to_string(),
        timeout_seconds,
        None,
    )
    .await
}

#[tauri::command]
pub async fn ai_execute_codex(
    vault_path: String,
    note_path: String,
    prompt: String,
    command: Option<String>,
    timeout_seconds: Option<u64>,
) -> Result<AiExecutionResult, String> {
    validate_note_path(&vault_path, &note_path)?;
    let command = resolved_command(command, "codex");
    let _output_dir =
        tempdir().map_err(|e| format!("Failed to create Codex output directory: {}", e))?;
    let output_path = _output_dir.path().join("codex-output.txt");

    execute_ai_cli(
        "Codex",
        command,
        codex_args(&output_path.to_string_lossy()),
        Some(prompt),
        vault_path,
        "Codex CLI not found. Please install it from https://github.com/openai/codex".to_string(),
        timeout_seconds,
        Some(output_path),
    )
    .await
}

#[tauri::command]
pub async fn ai_execute_ollama(
    vault_path: String,
    note_path: String,
    prompt: String,
    command: Option<String>,
    model: Option<String>,
    timeout_seconds: Option<u64>,
) -> Result<AiExecutionResult, String> {
    validate_note_path(&vault_path, &note_path)?;

    let model_name = ollama_model_name(model.as_deref().unwrap_or(""));
    let command = resolved_command(command, "ollama");

    if !model_name.contains("cloud") {
        let model_to_check = model_name.clone();
        let command_to_check = command.clone();
        let available = tauri::async_runtime::spawn_blocking(move || {
            let path = pipeline::get_expanded_path();
            let mut cmd = pipeline::no_window_cmd(&command_to_check);
            cmd.env("PATH", &path)
                .args(["show", &model_to_check])
                .stdout(Stdio::null())
                .stderr(Stdio::null());
            match cmd.status() {
                Ok(status) => status.success(),
                Err(_) => false,
            }
        })
        .await
        .unwrap_or(false);

        if !available {
            return Ok(AiExecutionResult {
                success: false,
                output: String::new(),
                error: Some(format!(
                    "Model '{}' is not installed. Run: ollama pull {}",
                    model_name, model_name
                )),
            });
        }
    }

    let result = execute_ai_cli(
        "Ollama",
        command,
        vec!["run".to_string(), model_name.clone()],
        Some(prompt),
        vault_path,
        "Ollama CLI not found. Please install it from https://ollama.com".to_string(),
        timeout_seconds,
        None,
    )
    .await?;

    if !result.success {
        if let Some(ref error) = result.error {
            let error_lower = error.to_lowercase();
            if error_lower.contains("model not found")
                || error_lower.contains("model does not exist")
                || error_lower.contains("pull model manifest")
                || error_lower.contains("file does not exist")
            {
                return Ok(AiExecutionResult {
                    success: false,
                    output: String::new(),
                    error: Some(format!(
                        "Model '{}' not found. Run `ollama pull {}` in your terminal to download it.",
                        model_name, model_name
                    )),
                });
            }
            if error.contains("401") || error.contains("Unauthorized") {
                return Ok(AiExecutionResult {
                    success: false,
                    output: String::new(),
                    error: Some(
                        "Authentication required. Run `ollama login` in your terminal to sign in."
                            .to_string(),
                    ),
                });
            }
        }
    }

    Ok(result)
}
