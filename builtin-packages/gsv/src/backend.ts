import { PackageBackendEntrypoint } from "@gsv/package/backend";
import { connectAdapter, disconnectAdapter, loadAdaptersState } from "./backend/adapters";
import {
  createDeviceNodeToken,
  loadDevicesState,
  revokeDeviceToken,
  updateDeviceDescription,
} from "./backend/devices";
import { killRuntimeProcess, loadRuntimeState } from "./backend/runtime";

export default class GsvBackend extends PackageBackendEntrypoint {
  async loadRuntimeState(): Promise<unknown> {
    return loadRuntimeState(this.kernel);
  }

  async killRuntimeProcess(args: unknown): Promise<unknown> {
    return killRuntimeProcess(this.kernel, args as never);
  }

  async loadDevicesState(args: unknown): Promise<unknown> {
    return loadDevicesState(this.kernel, this, args as never);
  }

  async createDeviceNodeToken(args: unknown): Promise<unknown> {
    return createDeviceNodeToken(this.kernel, this, args as never);
  }

  async revokeDeviceToken(args: unknown): Promise<unknown> {
    return revokeDeviceToken(this.kernel, this, args as never);
  }

  async updateDeviceDescription(args: unknown): Promise<unknown> {
    return updateDeviceDescription(this.kernel, this, args as never);
  }

  async loadAdaptersState(): Promise<unknown> {
    return loadAdaptersState(this.kernel);
  }

  async connectAdapter(args: unknown): Promise<unknown> {
    return connectAdapter(this.kernel, args as never);
  }

  async disconnectAdapter(args: unknown): Promise<unknown> {
    return disconnectAdapter(this.kernel, args as never);
  }
}
