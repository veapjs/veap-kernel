import { getVeapConfig } from "./config.loader.js";
import type { IVeapConfigProvider, VeapConfig } from "./contracts.js";

/**
 * `IVeapConfigProvider` adapter backed by the jiti-based `veap.config.ts` loader.
 */
export class VeapConfigProvider implements IVeapConfigProvider {
  get(): Promise<VeapConfig> {
    return getVeapConfig();
  }
}
