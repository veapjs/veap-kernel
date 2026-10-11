import type { Token } from "../ioc/tokens.js";

export interface SystemEventsMap {
  [key: string]: any;
}

export interface SystemEvent<T = any> {
  type: string;
  payload: T;
  timestamp: number;
  source: string;
}

export type EventHandler<T = any> = (
  event: SystemEvent<T>,
) => Promise<void> | void;

export interface PublishOptions {
  strict?: boolean;
}

export interface IEventBus {
  /**
   * Subscribes a handler to an event type.
   * Returns an unsubscribe function for convenient cleanup.
   */
  subscribe<K extends keyof SystemEventsMap>(
    eventType: K | (string & {}),
    subscriberId: string,
    handler: EventHandler<SystemEventsMap[K]>,
  ): () => void;

  unsubscribe(eventType: string, subscriberId: string): void;

  clearAll(): void;

  publish<K extends keyof SystemEventsMap>(
    eventType: K | (string & {}),
    payload: SystemEventsMap[K],
    source?: string,
    options?: PublishOptions,
  ): Promise<void>;

  publishStrict<K extends keyof SystemEventsMap>(
    eventType: K | (string & {}),
    payload: SystemEventsMap[K],
    source?: string,
  ): Promise<void>;

  /**
   * Subscribes a one-time handler that automatically unsubscribes after being invoked once.
   * Returns an unsubscribe function.
   */
  once<K extends keyof SystemEventsMap>(
    eventType: K | (string & {}),
    handler: EventHandler<SystemEventsMap[K]>,
    subscriberIdPrefix?: string,
  ): () => void;
}

export const EVENT_BUS: Token<IEventBus> = Symbol.for("veap:kernel:event-bus");
