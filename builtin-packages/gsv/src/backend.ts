import { PackageBackendEntrypoint } from "@gsv/package/backend";
import { connectAdapter, disconnectAdapter, loadAdaptersState } from "./backend/adapters";
import {
  createDeviceNodeToken,
  loadDevicesState,
  revokeDeviceToken,
  updateDeviceDescription,
} from "./backend/devices";
import { addMcpServer, loadMcpState, refreshMcpServer, removeMcpServer } from "./backend/mcp";
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

  async loadMcpState(): Promise<unknown> {
    return loadMcpState(this.kernel);
  }

  async addMcpServer(args: unknown): Promise<unknown> {
    return addMcpServer(this.kernel, args as never);
  }

  async refreshMcpServer(args: unknown): Promise<unknown> {
    return refreshMcpServer(this.kernel, args as never);
  }

  async removeMcpServer(args: unknown): Promise<unknown> {
    return removeMcpServer(this.kernel, args as never);
  }
}
