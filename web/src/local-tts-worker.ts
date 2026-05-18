import { TtsSession } from "@mintplex-labs/piper-tts-web";

type PiperProgress = {
  url: string;
  total: number;
  loaded: number;
};

type LocalSpeechProgress = {
  phase: "loading" | "downloading" | "generating";
  message: string;
};

type WorkerRequest = {
  id: number;
  text: string;
  voiceId: string;
};

type WorkerResponse =
  | { type: "progress"; id: number; progress: LocalSpeechProgress }
  | { type: "result"; id: number; audio: Blob }
  | { type: "error"; id: number; error: string };

const ONNX_RUNTIME_VERSION = "1.26.0";
const ONNX_WASM_BASE = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ONNX_RUNTIME_VERSION}/dist/`;
const PIPER_WASM_BASE = "https://cdn.jsdelivr.net/npm/@diffusionstudio/piper-wasm@1.0.0/build/piper_phonemize";

function post(response: WorkerResponse): void {
  self.postMessage(response);
}

self.addEventListener("message", (event: MessageEvent<WorkerRequest>) => {
  void handleRequest(event.data);
});

async function handleRequest(request: WorkerRequest): Promise<void> {
  try {
    post({
      type: "progress",
      id: request.id,
      progress: { phase: "loading", message: "Loading local voice engine" },
    });
    const session = await TtsSession.create({
      voiceId: request.voiceId,
      progress: (progress: PiperProgress) => post({
        type: "progress",
        id: request.id,
        progress: formatPiperProgress(progress),
      }),
      wasmPaths: {
        onnxWasm: ONNX_WASM_BASE,
        piperData: `${PIPER_WASM_BASE}.data`,
        piperWasm: `${PIPER_WASM_BASE}.wasm`,
      },
    });

    post({
      type: "progress",
      id: request.id,
      progress: { phase: "generating", message: `Generating ${voiceLabel(request.voiceId)}` },
    });
    const audio = await session.predict(request.text);
    post({ type: "result", id: request.id, audio });
  } catch (error) {
    post({
      type: "error",
      id: request.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function formatPiperProgress(progress: PiperProgress): LocalSpeechProgress {
  const total = Number.isFinite(progress.total) && progress.total > 0 ? progress.total : 0;
  const percent = total > 0 ? Math.min(100, Math.max(0, Math.round((progress.loaded / total) * 100))) : 0;
  const filename = progress.url.split("/").pop() || "voice model";
  return {
    phase: "downloading",
    message: total > 0 ? `Downloading ${filename} ${percent}%` : `Downloading ${filename}`,
  };
}

function voiceLabel(voiceId: string): string {
  return voiceId
    .replace(/^en_US-/, "")
    .replace(/-/g, " ");
}
