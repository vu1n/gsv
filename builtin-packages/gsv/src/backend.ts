import { PackageBackendEntrypoint } from "@gsv/package/backend";
import { killRuntimeProcess, loadRuntimeState } from "./backend/runtime";

export default class GsvBackend extends PackageBackendEntrypoint {
  async loadRuntimeState(): Promise<unknown> {
    return loadRuntimeState(this.kernel);
  }

  async killRuntimeProcess(args: unknown): Promise<unknown> {
    return killRuntimeProcess(this.kernel, args as never);
  }
}
