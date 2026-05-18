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
env.wasm.wasmPaths = ONNX_WASM_BASE;
export const InferenceSession = ort.InferenceSession;
export const Tensor = ort.Tensor;
