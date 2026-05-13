import type {
  CreateNodeTokenArgs,
  CreateNodeTokenResult,
  DevicesState,
  LoadDevicesStateArgs,
  RevokeDeviceTokenArgs,
  UpdateDeviceDescriptionArgs,
} from "./features/devices/types";
import type {
  AdapterMutationResult,
  AdaptersState,
  ConnectAdapterArgs,
  DisconnectAdapterArgs,
} from "./features/integrations/types";
import type {
  KillRuntimeProcessArgs,
  KillRuntimeProcessResult,
  RuntimeState,
} from "./features/runtime/types";

export interface GsvBackend {
  loadRuntimeState(): Promise<RuntimeState>;
  killRuntimeProcess(args: KillRuntimeProcessArgs): Promise<KillRuntimeProcessResult>;
  loadDevicesState(args: LoadDevicesStateArgs): Promise<DevicesState>;
  createDeviceNodeToken(args: CreateNodeTokenArgs): Promise<CreateNodeTokenResult>;
  revokeDeviceToken(args: RevokeDeviceTokenArgs): Promise<DevicesState>;
  updateDeviceDescription(args: UpdateDeviceDescriptionArgs): Promise<DevicesState>;
  loadAdaptersState(): Promise<AdaptersState>;
  connectAdapter(args: ConnectAdapterArgs): Promise<AdapterMutationResult>;
  disconnectAdapter(args: DisconnectAdapterArgs): Promise<AdapterMutationResult>;
}
