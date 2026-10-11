import { Injectable } from "../ioc/decorators";
import type { ILogger } from "../logging/logger";
import type {
  EventHandler,
  IEventBus,
  PublishOptions,
  SystemEvent,
  SystemEventsMap,
} from "./contracts";

@Injectable()
export class EventBus implements IEventBus {
  private handlers: Map<string, Map<string, EventHandler>> = new Map();
  private _logger: ILogger | null = null;

  public setLogger(logger: ILogger): void {
    this._logger = logger;
  }

  private get log(): ILogger {
    return (
      this._logger ?? {
        debug: () => {},
        info: () => {},
        warn: () => {},
        error: () => {},
      }
    );
  }

  public subscribe<K extends keyof SystemEventsMap>(
    eventType: K | (string & {}),
    subscriberId: string,
    handler: EventHandler<SystemEventsMap[K]>,
  ): void {
    const type = eventType as string;
    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Map());
    }
    const eventHandlers = this.handlers.get(type);

    if (eventHandlers?.has(subscriberId)) {
      return;
    }

    eventHandlers?.set(subscriberId, handler as EventHandler);
    this.log.debug(
      "veap:event",
      `Subscriber "${subscriberId}" added for "${String(eventType)}"`,
    );
  }

  public unsubscribe(eventType: string, subscriberId: string): void {
    const eventHandlers = this.handlers.get(eventType);
    if (eventHandlers) {
      eventHandlers.delete(subscriberId);
      this.log.debug(
        "veap:event",
        `Subscriber "${subscriberId}" removed from "${eventType}"`,
      );
    }
  }

  public clearAll(): void {
    this.handlers.clear();
    this.log.debug("veap:event", "Resetting all listeners...");
  }

  public async publish<K extends keyof SystemEventsMap>(
    eventType: K | (string & {}),
    payload: SystemEventsMap[K],
    source = "system",
    options?: PublishOptions,
  ): Promise<void> {
    const type = eventType as string;
    const eventHandlers = this.handlers.get(type);

    if (!eventHandlers) return;

    const handlers = Array.from(eventHandlers.values());

    if (
      process.env.NODE_ENV !== "production" &&
      !type.startsWith("system:plugins:")
    ) {
      this.log.debug(
        "veap:event",
        `Publishing "${String(eventType)}" to ${handlers.length} subscribers`,
      );
    }

    const event: SystemEvent<SystemEventsMap[K]> = {
      type,
      payload,
      timestamp: Date.now(),
      source,
    };

    const errors: any[] = [];

    await Promise.all(
      handlers.map(async (handler) => {
        try {
          await handler(event);
        } catch (error: any) {
          if (
            error?.digest?.startsWith("NEXT_REDIRECT") ||
            error?.digest?.startsWith("NEXT_NOT_FOUND")
          ) {
            throw error;
          }
          this.log.error(
            "veap:event",
            `Handler Error for ${String(eventType)}:`,
            error,
          );
          if (options?.strict) {
            errors.push(error);
          }
        }
      }),
    );

    if (errors.length > 0) {
      if (errors.length === 1) {
        throw errors[0];
      }
      throw new AggregateError(
        errors,
        `Multiple handler errors (${errors.length}) occurred for event "${String(eventType)}"`,
      );
    }
  }

  public async publishStrict<K extends keyof SystemEventsMap>(
    eventType: K | (string & {}),
    payload: SystemEventsMap[K],
    source = "system",
  ): Promise<void> {
    return this.publish(eventType, payload, source, { strict: true });
  }
}

const globalForEventBus = globalThis as unknown as {
  __VEAP_EVENT_BUS__: EventBus | undefined;
};

export const eventBus = globalForEventBus.__VEAP_EVENT_BUS__ ?? new EventBus();

globalForEventBus.__VEAP_EVENT_BUS__ = eventBus;
