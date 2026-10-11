import { AppError } from "../errors/app-error.js";
import { Injectable } from "../ioc/decorators.js";
import type {
  CookieOptions,
  ICookieStore,
  IHttpRequestContext,
} from "./contracts.js";

@Injectable()
export class MemoryCookieStore implements ICookieStore {
  private store = new Map<string, string>();

  async get(name: string): Promise<string | null> {
    return this.store.get(name) ?? null;
  }

  async set(
    name: string,
    value: string,
    _options?: CookieOptions,
  ): Promise<void> {
    this.store.set(name, value);
  }

  async delete(name: string): Promise<void> {
    this.store.delete(name);
  }
}

@Injectable()
export class MemoryRequestContext implements IHttpRequestContext {
  private headers = new Map<string, string>();

  setHeader(name: string, value: string): void {
    this.headers.set(name.toLowerCase(), value);
  }

  async getHeader(name: string): Promise<string | null> {
    return this.headers.get(name.toLowerCase()) ?? null;
  }

  redirect(url: string): never {
    throw AppError.BadRequest(`Redirect to: ${url}`);
  }
}
