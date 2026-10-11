import { Injectable } from "../ioc/decorators";
import type { IConfigService } from "./contracts";

@Injectable()
export class ConfigService implements IConfigService {
  private config: Record<string, any>;

  constructor() {
    this.config = {
      ...(typeof process !== "undefined" ? process.env : {}),
    };
  }

  get<T = any>(key: string, defaultValue?: T): T {
    const value = this.config[key];
    return value !== undefined ? (value as T) : (defaultValue as T);
  }

  has(key: string): boolean {
    return key in this.config && this.config[key] !== undefined;
  }

  set(key: string, value: any): void {
    this.config[key] = value;
  }

  getAll(): Record<string, any> {
    return { ...this.config };
  }
}
