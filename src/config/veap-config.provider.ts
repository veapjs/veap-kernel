import { getVeapConfig } from "./config.loader";
import type { IVeapConfigProvider, VeapConfig } from "./contracts";

/**
 * `IVeapConfigProvider` adapter backed by the jiti-based `veap.config.ts` loader.
 */
export class VeapConfigProvider implements IVeapConfigProvider {
  get(): Promise<VeapConfig> {
    return getVeapConfig();
  }
}
