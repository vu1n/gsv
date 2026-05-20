use base64::Engine;
use serde::Deserialize;
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use tokio::io::{AsyncReadExt, AsyncSeekExt, AsyncWriteExt};

const MAX_TRANSFER_READ_BYTES: u64 = 1024 * 1024;

pub async fn handle_transfer_syscall(
    call: &str,
    args: Value,
    workspace: &Path,
) -> Option<Result<Value, String>> {
    match call {
        "fs.transfer.stat" => Some(handle_stat(args, workspace).await),
        "fs.transfer.read" => Some(handle_read(args, workspace).await),
        "fs.transfer.write" => Some(handle_write(args, workspace).await),
        _ => None,
    }
}

#[derive(Deserialize)]
struct TransferStatArgs {
    path: String,
}

#[derive(Deserialize)]
struct TransferReadArgs {
    path: String,
    offset: u64,
    length: u64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct TransferWriteArgs {
    path: String,
    offset: u64,
    data: String,
    expected_size: u64,
    #[serde(default)]
    content_type: Option<String>,
    #[serde(default)]
    done: bool,
}

async fn handle_stat(args: Value, workspace: &Path) -> Result<Value, String> {
    let args: TransferStatArgs =
        serde_json::from_value(args).map_err(|e| format!("Invalid arguments: {}", e))?;
    let path = resolve_path(&args.path, workspace);
    let metadata = tokio::fs::metadata(&path)
        .await
        .map_err(|e| format!("Failed to stat '{}': {}", path.display(), e))?;
    let content_type = if metadata.is_file() {
        mime_guess::from_path(&path)
            .first()
            .map(|mime| mime.essence_str().to_string())
    } else {
        None
    };

    Ok(json!({
        "ok": true,
        "path": path.display().to_string(),
        "size": metadata.len(),
        "isFile": metadata.is_file(),
        "isDirectory": metadata.is_dir(),
        "contentType": content_type
    }))
}

async fn handle_read(args: Value, workspace: &Path) -> Result<Value, String> {
    let args: TransferReadArgs =
        serde_json::from_value(args).map_err(|e| format!("Invalid arguments: {}", e))?;
    let path = resolve_path(&args.path, workspace);
    let length = args.length.min(MAX_TRANSFER_READ_BYTES) as usize;
    let mut file = tokio::fs::File::open(&path)
        .await
        .map_err(|e| format!("Failed to open '{}': {}", path.display(), e))?;
    file.seek(std::io::SeekFrom::Start(args.offset))
        .await
        .map_err(|e| format!("Failed to seek '{}': {}", path.display(), e))?;

    let mut bytes = vec![0u8; length];
    let bytes_read = file
        .read(&mut bytes)
        .await
        .map_err(|e| format!("Failed to read '{}': {}", path.display(), e))?;
    bytes.truncate(bytes_read);
    let total_size = tokio::fs::metadata(&path)
        .await
        .map_err(|e| format!("Failed to stat '{}': {}", path.display(), e))?
        .len();
    let eof = args.offset + bytes_read as u64 >= total_size;

    Ok(json!({
        "ok": true,
        "path": path.display().to_string(),
        "offset": args.offset,
        "bytesRead": bytes_read,
        "data": base64::engine::general_purpose::STANDARD.encode(&bytes),
        "eof": eof
    }))
}

async fn handle_write(args: Value, workspace: &Path) -> Result<Value, String> {
    let args: TransferWriteArgs =
        serde_json::from_value(args).map_err(|e| format!("Invalid arguments: {}", e))?;
    let path = resolve_path(&args.path, workspace);
    if let Some(parent) = path.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|e| format!("Failed to create '{}': {}", parent.display(), e))?;
    }

    let bytes = base64::engine::general_purpose::STANDARD
        .decode(args.data.as_bytes())
        .map_err(|e| format!("Invalid transfer data: {}", e))?;

    let mut options = tokio::fs::OpenOptions::new();
    options.create(true).write(true);
    if args.offset == 0 {
        options.truncate(true);
    }
    let mut file = options
        .open(&path)
        .await
        .map_err(|e| format!("Failed to open '{}': {}", path.display(), e))?;
    file.seek(std::io::SeekFrom::Start(args.offset))
        .await
        .map_err(|e| format!("Failed to seek '{}': {}", path.display(), e))?;
    file.write_all(&bytes)
        .await
        .map_err(|e| format!("Failed to write '{}': {}", path.display(), e))?;
    file.flush()
        .await
        .map_err(|e| format!("Failed to flush '{}': {}", path.display(), e))?;
    drop(file);

    if args.done {
        let metadata = tokio::fs::metadata(&path)
            .await
            .map_err(|e| format!("Failed to stat '{}': {}", path.display(), e))?;
        if metadata.len() != args.expected_size {
            return Err(format!(
                "Transfer size mismatch for '{}': expected {}, got {}",
                path.display(),
                args.expected_size,
                metadata.len()
            ));
        }
    }

    Ok(json!({
        "ok": true,
        "path": path.display().to_string(),
        "offset": args.offset,
        "bytesWritten": bytes.len(),
        "done": args.done,
        "contentType": args.content_type
    }))
}

fn resolve_path(path: &str, workspace: &Path) -> PathBuf {
    let path = PathBuf::from(path);
    if path.is_absolute() {
        path
    } else {
        workspace.join(path)
    }
}

#[cfg(test)]
mod tests {
    use super::handle_transfer_syscall;
    use base64::Engine;
    use serde_json::json;
    use std::path::PathBuf;

    fn test_root() -> PathBuf {
        std::env::temp_dir().join(format!("gsv-transfer-test-{}", uuid::Uuid::new_v4()))
    }

    #[tokio::test]
    async fn reads_file_chunks() {
        let root = test_root();
        tokio::fs::create_dir_all(&root).await.unwrap();
        tokio::fs::write(root.join("source.txt"), "hello world")
            .await
            .unwrap();

        let result = handle_transfer_syscall(
            "fs.transfer.read",
            json!({ "path": "source.txt", "offset": 6, "length": 5 }),
            &root,
        )
        .await
        .unwrap()
        .unwrap();

        let data = result["data"].as_str().unwrap();
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(data.as_bytes())
            .unwrap();
        assert_eq!(bytes, b"world");

        tokio::fs::remove_dir_all(root).await.unwrap();
    }

    #[tokio::test]
    async fn writes_chunks_and_validates_size() {
        let root = test_root();
        tokio::fs::create_dir_all(&root).await.unwrap();
        let first = base64::engine::general_purpose::STANDARD.encode(b"hello ");
        let second = base64::engine::general_purpose::STANDARD.encode(b"world");

        handle_transfer_syscall(
            "fs.transfer.write",
            json!({ "path": "dest.txt", "offset": 0, "data": first, "expectedSize": 11 }),
            &root,
        )
        .await
        .unwrap()
        .unwrap();
        handle_transfer_syscall(
            "fs.transfer.write",
            json!({ "path": "dest.txt", "offset": 6, "data": second, "expectedSize": 11, "done": true }),
            &root,
        )
        .await
        .unwrap()
        .unwrap();

        assert_eq!(
            tokio::fs::read_to_string(root.join("dest.txt"))
                .await
                .unwrap(),
            "hello world"
        );

        tokio::fs::remove_dir_all(root).await.unwrap();
    }
}
