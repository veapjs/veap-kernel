import type { Token } from "../ioc/tokens";

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
  subscribe<K extends keyof SystemEventsMap>(
    eventType: K | (string & {}),
    subscriberId: string,
    handler: EventHandler<SystemEventsMap[K]>,
  ): void;

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
}

export const EVENT_BUS: Token<IEventBus> = Symbol.for("veap:kernel:event-bus");
