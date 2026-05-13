import type {
  KillRuntimeProcessArgs,
  KillRuntimeProcessResult,
  RuntimeState,
} from "./features/runtime/types";

export interface GsvBackend {
  loadRuntimeState(): Promise<RuntimeState>;
  killRuntimeProcess(args: KillRuntimeProcessArgs): Promise<KillRuntimeProcessResult>;
}
