# @eleven-am/authorizer

Authorization for NestJS applications using [CASL](https://casl.js.org/). Defines permissions via decorators, checks them automatically through a guard, and exposes the built CASL ability to handlers.

## Install

```bash
npm install @eleven-am/authorizer
```

Peer dependencies:

- `@casl/ability` ^6.0.0
- `@nestjs/common` ^11.0.0
- `@nestjs/core` ^11.0.0
- `@eleven-am/pondsocket-nest` ^0.0.134 (optional, for PondSocket support)

## Setup

### 1. Register the module

Use `forRoot` with a static `Authenticator`, or `forRootAsync` when you need dependency injection.

```typescript
import { Module } from '@nestjs/common';
import { AuthorizationModule, Authenticator } from '@eleven-am/authorizer';
import { AbilityBuilder, createMongoAbility } from '@casl/ability';

const authenticator: Authenticator = {
    retrieveUser: async (context) => {
        const request = context.switchToHttp().getRequest();
        return request.user ?? null;
    },
    abilityFactory: () => new AbilityBuilder(createMongoAbility),
};

@Module({
    imports: [AuthorizationModule.forRoot(authenticator)],
})
export class AppModule {}
```

With `forRootAsync`:

```typescript
@Module({
    imports: [
        AuthorizationModule.forRootAsync({
            imports: [UserModule],
            inject: [UserService],
            useFactory: (userService: UserService): Authenticator => ({
                retrieveUser: (context) => userService.fromContext(context),
                abilityFactory: () => new AbilityBuilder(createMongoAbility),
            }),
        }),
    ],
})
export class AppModule {}
```

The module is registered globally. Feature modules do not need to import it again.

### 2. Apply the guard

Globally, or per-controller with `@UseGuards`.

```typescript
import { APP_GUARD } from '@nestjs/core';
import { AuthorizationGuard } from '@eleven-am/authorizer';

@Module({
    providers: [{ provide: APP_GUARD, useClass: AuthorizationGuard }],
})
export class AppModule {}
```

### 3. Implement the Authenticator

The `Authenticator` interface has two methods:

```typescript
interface Authenticator {
    retrieveUser(context: AuthorizableContext): Promise<ResolvedUser | null>;
    abilityFactory(): AbilityBuilder<ResolvedAbility>;
}
```

`AuthorizableContext` is a structural type satisfied by both NestJS `ExecutionContext` and PondSocket `Context`.

- `retrieveUser` — extract the current user from the request context. Return `null` for unauthenticated requests.
- `abilityFactory` — return a fresh `AbilityBuilder` that authorizers will populate with rules.

## Type Registration

By default, the user type is `unknown` and the ability type is `AnyAbility`. To get typed parameters, augment the `Register` interface:

```typescript
import { MongoAbility } from '@casl/ability';

declare module '@eleven-am/authorizer' {
    interface Register {
        user: { id: number; role: string };
        ability: MongoAbility;
    }
}
```

After this, `@CurrentAbility()` returns `MongoAbility` and authorizer `forUser` receives your user type.

## Authorizers

An authorizer is a NestJS provider that defines CASL rules for a user. Mark a class with `@Authorizer()` and implement `WillAuthorize`:

```typescript
import { Authorizer, WillAuthorize } from '@eleven-am/authorizer';
import { AbilityBuilder, MongoAbility } from '@casl/ability';

@Authorizer()
class PostAuthorizer implements WillAuthorize {
    forUser(user: { id: number; role: string }, builder: AbilityBuilder<MongoAbility>) {
        if (user.role === 'admin') {
            builder.can('manage', 'Post');
        } else {
            builder.can('read', 'Post');
            builder.can('update', 'Post', { authorId: user.id });
        }
    }
}
```

Register it as a provider in your module. The library discovers all `@Authorizer()` providers at startup and calls each one's `forUser` when building an ability. `forUser` can be async.

You can have multiple authorizers. Each one adds rules to the same builder.

## Permissions

Use `@CanPerform()` on a controller class or individual methods to require specific permissions:

```typescript
import { Controller, Get, Patch, Param, Body, UseGuards } from '@nestjs/common';
import { CanPerform, AuthorizationGuard } from '@eleven-am/authorizer';

@Controller('posts')
@UseGuards(AuthorizationGuard)
export class PostController {
    @Get()
    @CanPerform({ action: 'read', subject: 'Post' })
    findAll() {}

    @Patch(':id')
    @CanPerform({ action: 'update', subject: 'Post', field: 'content' })
    update(@Param('id') id: string, @Body() body: any) {}
}
```

The `Permission` shape:

```typescript
interface Permission {
    action: string;
    subject: string;
    field?: string;
}
```

When `@CanPerform()` is applied to both the class and a method, permissions are merged.

Routes with no `@CanPerform()` allow any authenticated user through. Unauthenticated requests to routes with permissions receive a 401. Authenticated requests that fail a permission check receive a 403.

## Accessing the Ability

Use `@CurrentAbility()` to inject the built CASL ability into a handler. The guard must run first.

```typescript
import { CurrentAbility } from '@eleven-am/authorizer';
import { MongoAbility } from '@casl/ability';

@Get(':id')
@CanPerform({ action: 'read', subject: 'Post' })
findOne(@Param('id') id: string, @CurrentAbility() ability: MongoAbility) {
    const canEdit = ability.can('update', 'Post');
}
```

## PondSocket

The library supports `@eleven-am/pondsocket-nest` via a separate entry point. Install `@eleven-am/pondsocket-nest` as a dependency, then import from `@eleven-am/authorizer/pondsocket`.

### Guard

Register `AuthorizationSocketGuard` with your PondSocket module:

```typescript
import { AuthorizationSocketGuard } from '@eleven-am/authorizer/pondsocket';

PondSocketModule.forRoot({
    guards: [AuthorizationSocketGuard],
    providers: [AuthorizationSocketGuard],
})
```

The guard delegates to the same `AuthorizationService` used by HTTP. `@CanPerform()` and `@Authorizer()` work identically — PondSocket's `Context` provides the same `getClass()` and `getHandler()` methods the reflector needs.

### Accessing the Ability

Use `@CurrentSocketAbility()` in place of `@CurrentAbility()`:

```typescript
import { CurrentSocketAbility } from '@eleven-am/authorizer/pondsocket';
import { CanPerform } from '@eleven-am/authorizer';
import { MongoAbility } from '@casl/ability';

@OnEvent('find-all')
@CanPerform({ action: 'read', subject: 'Post' })
findAll(@CurrentSocketAbility() ability: MongoAbility) {}
```

### Authenticator

Your `Authenticator.retrieveUser` receives an `AuthorizableContext`. For an implementation that handles both HTTP and PondSocket contexts:

```typescript
const authenticator: Authenticator = {
    retrieveUser: async (context) => {
        if ('switchToHttp' in context) {
            return (context as any).switchToHttp().getRequest().user ?? null;
        }

        return (context as any).getData('user') ?? null;
    },
    abilityFactory: () => new AbilityBuilder(createMongoAbility),
};
```

## API Reference

### Module

- `AuthorizationModule.forRoot(authenticator: Authenticator): DynamicModule`
- `AuthorizationModule.forRootAsync(options: AuthorizationAsyncModuleOptions): DynamicModule`

### Guard

- `AuthorizationGuard` — implements `CanActivate`, delegates to `AuthorizationService`

### Decorators

- `Authorizer()` — class decorator, marks a provider as an authorizer
- `CanPerform(...permissions: Permission[])` — class or method decorator
- `CurrentAbility()` — parameter decorator, injects the CASL ability from the request
- `CurrentSocketAbility()` — parameter decorator for PondSocket handlers (from `@eleven-am/authorizer/pondsocket`)

### PondSocket Guard

- `AuthorizationSocketGuard` — implements PondSocket's `CanActivate`, delegates to `AuthorizationService` (from `@eleven-am/authorizer/pondsocket`)

### Interfaces

- `Authenticator` — `retrieveUser(context)` and `abilityFactory()`
- `AuthorizableContext` — `{ getClass(), getHandler() }`, satisfied by both `ExecutionContext` and PondSocket `Context`
- `WillAuthorize` — `forUser(user, builder)`
- `Permission` — `{ action, subject, field? }`
- `Register` — augment to type `user` and `ability`
- `AuthorizationAsyncModuleOptions` — `{ imports?, inject?, useFactory }`

### Types

- `ResolvedUser` — resolved from `Register['user']`, defaults to `unknown`
- `ResolvedAbility` — resolved from `Register['ability']`, defaults to `AnyAbility`

### Service

- `AuthorizationService` — provided by the module, used internally by the guard

## License

[GPL-3.0](LICENSE)
