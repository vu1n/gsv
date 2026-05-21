import { PackageBackendEntrypoint } from "@gsv/package/backend";
import { loadArtifact } from "./backend/api";

export default class ViewerBackend extends PackageBackendEntrypoint {
  async loadArtifact(args: unknown): Promise<unknown> {
    return loadArtifact(this.kernel, args as never);
  }
}
