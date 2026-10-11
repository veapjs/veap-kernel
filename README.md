[![CI](https://github.com/veapjs/veap-kernel/actions/workflows/CI.yml/badge.svg)](https://github.com/veapjs/veap-kernel/actions/workflows/CI.yml)
[![Release](https://github.com/veapjs/veap-kernel/actions/workflows/RELEASE.yml/badge.svg)](https://github.com/veapjs/veap-kernel/actions/workflows/RELEASE.yml)
[![Version](https://img.shields.io/npm/v/@veap/kernel?style=flat&colorA=000000&colorB=000000)](https://www.npmjs.com/package/@veap/kernel)

# @veap/kernel

Core dependency injection container, event bus, application lifecycle, and
system contracts for the Veap ecosystem.

## Overview

`@veap/kernel` provides the foundational runtime primitives powering Veap
applications and modular packages. It is runtime-agnostic (Node.js, Bun, Edge,
and browser-safe subsets) and ships with a zero-dependency IoC container,
strongly typed event bus, centralized configuration service, error handling
utilities, and application builder abstractions.

## Features

- **Dependency injection container**: Lightweight TypeScript IoC container
  supporting singletons, transient instances, factory providers, constructor
  injection via `@Injectable()` and `@Inject()`, and resolution hooks.
- **Application lifecycle builder**: Fluent `Application.configure()` builder
  orchestrating `ServiceProvider` registration, asynchronous boot sequences,
  and concurrency-safe bootstrap deduplication.
- **Typed event bus**: High-performance asynchronous pub/sub event bus with
  wildcard matching (`user:*`) and subscription lifecycle management.
- **Result type & error handling**: Unified `Result<T, E>`, `AppError` taxonomy
  (NotFound, Unauthorized, Forbidden, Validation, Conflict), and server-action
  error formatters (`ok`, `err`, `handleActionError`).
- **Standard service contracts**: Abstract port tokens for cookies, HTTP
  request context, caching, logging, and database connections.

## Installation

```bash
# Using bun
bun add @veap/kernel

# Using pnpm
pnpm add @veap/kernel

# Using npm
npm install @veap/kernel
```

## Usage

### IoC Container & Service Providers

Define injectable classes and custom service providers using the container:

```ts
import {
  container,
  app,
  Injectable,
  Inject,
  ServiceProvider,
} from "@veap/kernel";

export const GREETING_TOKEN = Symbol.for("app:greeting");

@Injectable()
export class GreeterService {
  constructor(@Inject(GREETING_TOKEN) private readonly prefix: string) {}

  public greet(name: string): string {
    return `${this.prefix}, ${name}!`;
  }
}

export class GreeterServiceProvider extends ServiceProvider {
  register(): void {
    this.container.register({
      token: GREETING_TOKEN,
      useValue: "Hello",
    });

    this.container.register({
      token: GreeterService,
      useClass: GreeterService,
      singleton: true,
    });
  }
}
```

### Application Composition & Bootstrap

Compose multiple service providers and boot the system safely:

```ts
import { Application } from "@veap/kernel";
import { GreeterServiceProvider } from "./greeter.provider";

export const appInstance = Application.configure()
  .use(GreeterServiceProvider)
  .create();

let bootstrapPromise: Promise<void> | null = null;

export async function initializeSystem(): Promise<void> {
  if (!bootstrapPromise) {
    bootstrapPromise = (async () => {
      await appInstance.bootstrap();
    })().catch((err) => {
      bootstrapPromise = null;
      throw err;
    });
  }
  return bootstrapPromise;
}
```

### Event Bus

Publish and subscribe to typed asynchronous events:

```ts
import { eventBus } from "@veap/kernel";

// Subscribe to a specific topic
const unsubscribe = eventBus.subscribe("user:registered", async (payload) => {
  console.log("New user registered:", payload);
});

// Publish an event
await eventBus.publish("user:registered", {
  userId: "usr_123",
  email: "admin@veap.dev",
});

// Clean up listener when no longer needed
unsubscribe();
```

### Result Type & Action Error Handling

Safely wrap server actions or service boundaries with standardized results:

```ts
import { ok, err, handleActionError, type Result } from "@veap/kernel";

export async function calculateRatio(
  a: number,
  b: number,
): Promise<Result<number>> {
  try {
    if (b === 0) {
      return err("Division by zero is not allowed");
    }
    return ok(a / b);
  } catch (error) {
    return handleActionError(error, "Math:CalculateRatio");
  }
}
```

## Subpath Exports

| Export Path           | Content                                                          |
| --------------------- | ---------------------------------------------------------------- |
| `@veap/kernel`        | All core IoC, Application, events, config, cache, and error APIs |
| `@veap/kernel/server` | Server-specific entry points and CLI infrastructure              |

## Documentation

For full guides and framework architecture patterns, visit:

- **Official Website**: [https://veap.pl](https://veap.pl)
- **Documentation**: [https://veap.pl/docs](https://veap.pl/docs)
- **GitHub Repository**: [https://github.com/veapjs/veap-kernel](https://github.com/veapjs/veap-kernel)

## License

MIT
