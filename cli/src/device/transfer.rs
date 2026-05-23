use gsv::connection::Connection;
use gsv::protocol::{
    build_binary_frame, parse_binary_frame, BINARY_FRAME_DATA, BINARY_FRAME_END, BINARY_FRAME_ERROR,
};
use serde::Deserialize;
use serde_json::{json, Value};
use std::collections::{HashMap, VecDeque};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::sync::Notify;

const MAX_TRANSFER_CHUNK_BYTES: usize = 1024 * 1024;
const BINARY_TRANSFER_TIMEOUT: Duration = Duration::from_secs(30);

#[derive(Clone)]
pub struct BinaryFrameInbox {
    frames: Arc<Mutex<HashMap<u32, VecDeque<QueuedBinaryFrame>>>>,
    notify: Arc<Notify>,
}

#[derive(Clone)]
struct QueuedBinaryFrame {
    flags: u8,
    payload: Vec<u8>,
}

impl BinaryFrameInbox {
    pub fn new() -> Self {
        Self {
            frames: Arc::new(Mutex::new(HashMap::new())),
            notify: Arc::new(Notify::new()),
        }
    }

    pub fn push(&self, data: Vec<u8>) {
        let Some((stream_id, flags, payload)) = parse_binary_frame(&data) else {
            return;
        };
        {
            let mut frames = self.frames.lock().unwrap();
            frames
                .entry(stream_id)
                .or_default()
                .push_back(QueuedBinaryFrame { flags, payload });
        }
        self.notify.notify_waiters();
    }

    async fn take(&self, stream_id: u32) -> Result<QueuedBinaryFrame, String> {
        let deadline = tokio::time::Instant::now() + BINARY_TRANSFER_TIMEOUT;
        loop {
            let notified = self.notify.notified();
            tokio::pin!(notified);
            notified.as_mut().enable();

            if let Some(frame) = self.pop(stream_id) {
                return Ok(frame);
            }

            tokio::time::timeout_at(deadline, notified.as_mut())
                .await
                .map_err(|_| {
                    format!("Timed out waiting for binary transfer stream {}", stream_id)
                })?;
        }
    }

    fn pop(&self, stream_id: u32) -> Option<QueuedBinaryFrame> {
        let mut frames = self.frames.lock().unwrap();
        let queue = frames.get_mut(&stream_id)?;
        let frame = queue.pop_front();
        if queue.is_empty() {
            frames.remove(&stream_id);
        }
        frame
    }
}

pub async fn handle_transfer_syscall(
    call: &str,
    args: Value,
    workspace: &Path,
    conn: &Connection,
    binary_inbox: &BinaryFrameInbox,
) -> Option<Result<Value, String>> {
    match call {
        "fs.transfer.stat" => Some(handle_stat(args, workspace).await),
        "fs.transfer.send" => Some(handle_send(args, workspace, conn).await),
        "fs.transfer.receive" => Some(handle_receive(args, workspace, binary_inbox).await),
        _ => None,
    }
}

#[derive(Deserialize)]
struct TransferStatArgs {
    path: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct TransferSendArgs {
    path: String,
    stream_id: u32,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct TransferReceiveArgs {
    path: String,
    stream_id: u32,
    expected_size: u64,
    #[serde(default)]
    content_type: Option<String>,
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

async fn handle_send(args: Value, workspace: &Path, conn: &Connection) -> Result<Value, String> {
    let args: TransferSendArgs =
        serde_json::from_value(args).map_err(|e| format!("Invalid arguments: {}", e))?;

    let result = async {
        let path = resolve_path(&args.path, workspace);
        let mut file = tokio::fs::File::open(&path)
            .await
            .map_err(|e| format!("Failed to open '{}': {}", path.display(), e))?;
        let metadata = file
            .metadata()
            .await
            .map_err(|e| format!("Failed to stat '{}': {}", path.display(), e))?;
        if !metadata.is_file() {
            return Err(format!("Not a file: '{}'", path.display()));
        }

        let mut bytes_sent: u64 = 0;
        let mut buffer = vec![0u8; MAX_TRANSFER_CHUNK_BYTES];
        loop {
            let bytes_read = file
                .read(&mut buffer)
                .await
                .map_err(|e| format!("Failed to read '{}': {}", path.display(), e))?;
            if bytes_read == 0 {
                break;
            }
            conn.send_binary(build_binary_frame(
                args.stream_id,
                BINARY_FRAME_DATA,
                &buffer[..bytes_read],
            ))
            .await
            .map_err(|e| format!("Failed to send binary transfer data: {}", e))?;
            bytes_sent += bytes_read as u64;
        }
        conn.send_binary(build_binary_frame(args.stream_id, BINARY_FRAME_END, &[]))
            .await
            .map_err(|e| format!("Failed to finish binary transfer: {}", e))?;

        let content_type = mime_guess::from_path(&path)
            .first()
            .map(|mime| mime.essence_str().to_string());

        Ok(json!({
            "ok": true,
            "path": path.display().to_string(),
            "size": metadata.len(),
            "bytesSent": bytes_sent,
            "contentType": content_type
        }))
    }
    .await;

    if let Err(error) = &result {
        let _ = conn
            .send_binary(build_binary_frame(
                args.stream_id,
                BINARY_FRAME_ERROR | BINARY_FRAME_END,
                error.as_bytes(),
            ))
            .await;
    }

    result
}

async fn handle_receive(
    args: Value,
    workspace: &Path,
    binary_inbox: &BinaryFrameInbox,
) -> Result<Value, String> {
    let args: TransferReceiveArgs =
        serde_json::from_value(args).map_err(|e| format!("Invalid arguments: {}", e))?;
    let path = resolve_path(&args.path, workspace);
    if let Some(parent) = path.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|e| format!("Failed to create '{}': {}", parent.display(), e))?;
    }
    if let Ok(metadata) = tokio::fs::metadata(&path).await {
        if metadata.is_dir() {
            return Err(format!("Destination is a directory: '{}'", path.display()));
        }
    }

    let temp_path = transfer_temp_path(&path, args.stream_id);
    let mut file = tokio::fs::OpenOptions::new()
        .create_new(true)
        .write(true)
        .open(&temp_path)
        .await
        .map_err(|e| format!("Failed to open '{}': {}", temp_path.display(), e))?;

    let mut bytes_written: u64 = 0;
    let receive_result: Result<(), String> = async {
        loop {
            let frame = binary_inbox.take(args.stream_id).await?;
            if frame.flags & BINARY_FRAME_ERROR != 0 {
                return Err(String::from_utf8(frame.payload)
                    .unwrap_or_else(|_| "Binary transfer failed".to_string()));
            }
            if frame.flags & BINARY_FRAME_DATA != 0 {
                bytes_written += frame.payload.len() as u64;
                if bytes_written > args.expected_size {
                    return Err(format!(
                        "Transfer size mismatch for '{}': expected {}, got more than {}",
                        path.display(),
                        args.expected_size,
                        bytes_written
                    ));
                }
                file.write_all(&frame.payload)
                    .await
                    .map_err(|e| format!("Failed to write '{}': {}", temp_path.display(), e))?;
            }
            if frame.flags & BINARY_FRAME_END != 0 {
                break;
            }
        }

        file.flush()
            .await
            .map_err(|e| format!("Failed to flush '{}': {}", temp_path.display(), e))?;
        if bytes_written != args.expected_size {
            return Err(format!(
                "Transfer size mismatch for '{}': expected {}, got {}",
                path.display(),
                args.expected_size,
                bytes_written
            ));
        }
        Ok(())
    }
    .await;

    drop(file);
    if let Err(error) = receive_result {
        let _ = tokio::fs::remove_file(&temp_path).await;
        return Err(error);
    }
    if let Err(error) = tokio::fs::rename(&temp_path, &path).await {
        let _ = tokio::fs::remove_file(&temp_path).await;
        return Err(format!("Failed to replace '{}': {}", path.display(), error));
    }

    Ok(json!({
        "ok": true,
        "path": path.display().to_string(),
        "bytesWritten": bytes_written,
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

fn transfer_temp_path(path: &Path, stream_id: u32) -> PathBuf {
    let parent = path.parent().unwrap_or_else(|| Path::new("."));
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("transfer");
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or(0);
    parent.join(format!(".{}.gsv-transfer-{}-{}", file_name, stream_id, now))
}

#[cfg(test)]
mod tests {
    use super::{TransferReceiveArgs, TransferSendArgs};
    use serde_json::json;

    #[test]
    fn deserializes_transfer_stream_ids_from_camel_case_json() {
        let send: TransferSendArgs = serde_json::from_value(json!({
            "path": "source.txt",
            "streamId": 123
        }))
        .unwrap();
        assert_eq!(send.stream_id, 123);

        let receive: TransferReceiveArgs = serde_json::from_value(json!({
            "path": "dest.txt",
            "streamId": 456,
            "expectedSize": 10
        }))
        .unwrap();
        assert_eq!(receive.stream_id, 456);
        assert_eq!(receive.expected_size, 10);
    }
}
