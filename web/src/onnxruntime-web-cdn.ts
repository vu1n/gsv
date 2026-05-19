type OnnxRuntimeModule = {
  env: {
    wasm: {
      numThreads?: number;
      wasmPaths?: string;
    };
  };
  InferenceSession: unknown;
  Tensor: unknown;
};

const ONNX_RUNTIME_VERSION = "1.26.0";
const ONNX_RUNTIME_URL = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ONNX_RUNTIME_VERSION}/dist/ort.min.mjs`;
const ONNX_WASM_BASE = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ONNX_RUNTIME_VERSION}/dist/`;
const ort = await import(
  /* @vite-ignore */
  ONNX_RUNTIME_URL
) as OnnxRuntimeModule;

export const env = ort.env;
configureWasmThreads(env.wasm);
env.wasm.wasmPaths = ONNX_WASM_BASE;
export const InferenceSession = ort.InferenceSession;
export const Tensor = ort.Tensor;

function configureWasmThreads(wasm: OnnxRuntimeModule["env"]["wasm"]): void {
  const supportsThreads = (globalThis as { crossOriginIsolated?: boolean }).crossOriginIsolated === true;
  const defaultThreads = supportsThreads ? normalizeThreadCount(navigator.hardwareConcurrency) : 1;
  let numThreads = defaultThreads;

  try {
    Object.defineProperty(wasm, "numThreads", {
      configurable: true,
      enumerable: true,
      get() {
        return numThreads;
      },
      set(value: unknown) {
        numThreads = supportsThreads ? normalizeThreadCount(value) : 1;
      },
    });
  } catch {
    // Some runtimes may make env.wasm immutable. Best effort still avoids our own bad value.
  }

  wasm.numThreads = defaultThreads;
}

function normalizeThreadCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.max(1, Math.floor(value))
    : 1;
}
