import { PackageBackendEntrypoint } from "@gsv/package/backend";
import { connectAdapter, disconnectAdapter, loadAdaptersState } from "./backend/adapters";
import {
  createDeviceNodeToken,
  loadDevicesState,
  revokeDeviceToken,
  updateDeviceDescription,
} from "./backend/devices";
import { addMcpServer, loadMcpState, refreshMcpServer, removeMcpServer } from "./backend/mcp";
import {
  approvePackageReview,
  disablePackage,
  enablePackage,
  loadPackagesState,
  pullPackage,
  pullPackageSource,
  refreshPackage,
  setPackagePublic,
  startPackageReview,
  syncPackages,
} from "./backend/packages";
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

  async loadPackagesState(args: unknown): Promise<unknown> {
    return loadPackagesState(args as never, this.kernel, this);
  }

  async syncPackages(): Promise<unknown> {
    return syncPackages(this.kernel, this);
  }

  async enablePackage(args: unknown): Promise<unknown> {
    return enablePackage(this.kernel, args as never);
  }

  async disablePackage(args: unknown): Promise<unknown> {
    return disablePackage(this.kernel, args as never);
  }

  async approvePackageReview(args: unknown): Promise<unknown> {
    return approvePackageReview(this.kernel, args as never);
  }

  async refreshPackage(args: unknown): Promise<unknown> {
    return refreshPackage(this.kernel, args as never);
  }

  async pullPackage(args: unknown): Promise<unknown> {
    return pullPackage(this.kernel, args as never);
  }

  async pullPackageSource(args: unknown): Promise<unknown> {
    return pullPackageSource(this.kernel, args as never);
  }

  async setPackagePublic(args: unknown): Promise<unknown> {
    return setPackagePublic(this.kernel, args as never);
  }

  async startPackageReview(args: unknown): Promise<unknown> {
    return startPackageReview(this.kernel, args as never);
  }
}
