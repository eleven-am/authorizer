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

## Example

A blog API with role-based access control, custom authorization, and PondSocket real-time updates.

### Type registration

```typescript
import { MongoAbility } from '@casl/ability';

interface User {
    id: number;
    role: 'admin' | 'editor' | 'viewer';
    email: string;
}

declare module '@eleven-am/authorizer' {
    interface Register {
        user: User;
        ability: MongoAbility;
    }
}
```

### Module setup

```typescript
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthorizationModule, AuthorizationGuard, Authenticator } from '@eleven-am/authorizer';
import { AbilityBuilder, createMongoAbility } from '@casl/ability';

@Module({
    imports: [
        AuthorizationModule.forRootAsync({
            imports: [UserModule],
            inject: [UserService],
            useFactory: (userService: UserService): Authenticator => ({
                retrieveUser: async (context) => {
                    if (context.isHttp) {
                        const request = context.getHttpContext().switchToHttp().getRequest();
                        return userService.fromToken(request.headers.authorization);
                    }

                    return context.getSocketContext().getData('user') ?? null;
                },
                abilityFactory: () => new AbilityBuilder(createMongoAbility),
            }),
        }),
    ],
    providers: [
        { provide: APP_GUARD, useClass: AuthorizationGuard },
    ],
})
export class AppModule {}
```

### Authorizer with custom hook

```typescript
import { Authorizer, WillAuthorize, AuthorizationContext, Permission } from '@eleven-am/authorizer';
import { AbilityBuilder, MongoAbility } from '@casl/ability';

@Authorizer()
class PostAuthorizer implements WillAuthorize {
    constructor(private readonly postService: PostService) {}

    forUser(user: User, builder: AbilityBuilder<MongoAbility>) {
        builder.can('read', 'Post');

        if (user.role === 'admin') {
            builder.can('manage', 'Post');
        } else if (user.role === 'editor') {
            builder.can('create', 'Post');
            builder.can('update', 'Post', { authorId: user.id });
            builder.can('delete', 'Post', { authorId: user.id });
        }
    }

    async authorize(context: AuthorizationContext, ability: MongoAbility, permissions: Permission[]) {
        if (context.isHttp) {
            const request = context.getHttpContext().switchToHttp().getRequest();
            const postId = request.params?.id;
            if (!postId) return true;

            const post = await this.postService.findOne(postId);
            return ability.can('update', post);
        }

        return true;
    }
}
```

### Controller

```typescript
import { Controller, Get, Post, Patch, Delete, Param, Body } from '@nestjs/common';
import { CanPerform, CurrentAbility, CurrentUser } from '@eleven-am/authorizer';
import { MongoAbility } from '@casl/ability';

@Controller('posts')
export class PostController {
    constructor(private readonly postService: PostService) {}

    @Get()
    @CanPerform({ action: 'read', subject: 'Post' })
    findAll(@CurrentUser.HTTP() user: User) {
        return this.postService.findAll(user);
    }

    @Get(':id')
    @CanPerform({ action: 'read', subject: 'Post' })
    findOne(@Param('id') id: string) {
        return this.postService.findOne(id);
    }

    @Post()
    @CanPerform({ action: 'create', subject: 'Post' })
    create(@Body() body: CreatePostDto, @CurrentUser.HTTP() user: User) {
        return this.postService.create(body, user);
    }

    @Patch(':id')
    @CanPerform({ action: 'update', subject: 'Post' })
    update(
        @Param('id') id: string,
        @Body() body: UpdatePostDto,
        @CurrentAbility.HTTP() ability: MongoAbility,
    ) {
        return this.postService.update(id, body, ability);
    }

    @Delete(':id')
    @CanPerform({ action: 'delete', subject: 'Post' })
    remove(@Param('id') id: string) {
        return this.postService.remove(id);
    }
}
```

### Custom parameter decorator

```typescript
import { createParamDecorator, AuthorizationContext } from '@eleven-am/authorizer';

interface Session {
    id: string;
    expiresAt: Date;
}

const CurrentSession = createParamDecorator((context: AuthorizationContext) => {
    return context.getData<Session>('session');
});

@Get('profile')
getProfile(
    @CurrentUser.HTTP() user: User,
    @CurrentSession.HTTP() session: Session,
) {
    return { user, session };
}
```

### PondSocket real-time handler

```typescript
import { AuthorizationSocketGuard } from '@eleven-am/authorizer/pondsocket';
import { CanPerform, CurrentAbility, CurrentUser } from '@eleven-am/authorizer';
import { MongoAbility } from '@casl/ability';
import { Channel, OnEvent, PondSocketModule } from '@eleven-am/pondsocket-nest';

PondSocketModule.forRoot({
    guards: [AuthorizationSocketGuard],
    providers: [AuthorizationSocketGuard],
});

@Channel('posts')
export class PostChannel {
    @OnEvent('find-all')
    @CanPerform({ action: 'read', subject: 'Post' })
    findAll(
        @CurrentAbility.WS() ability: MongoAbility,
        @CurrentUser.WS() user: User,
    ) {
        return this.postService.findAllForUser(user, ability);
    }

    @OnEvent('update')
    @CanPerform({ action: 'update', subject: 'Post' })
    update(
        @CurrentUser.WS() user: User,
    ) {
        return this.postService.updateForUser(user);
    }
}
```

## Setup

### 1. Register the module

Use `forRoot` with a static `Authenticator`, or `forRootAsync` when you need dependency injection.

```typescript
import { Module } from '@nestjs/common';
import { AuthorizationModule, Authenticator } from '@eleven-am/authorizer';
import { AbilityBuilder, createMongoAbility } from '@casl/ability';

const authenticator: Authenticator = {
    retrieveUser: async (context) => {
        const request = context.getHttpContext().switchToHttp().getRequest();
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
    retrieveUser(context: AuthorizationContext): Promise<ResolvedUser | null>;
    abilityFactory(): AbilityBuilder<ResolvedAbility>;
}
```

`retrieveUser` receives an `AuthorizationContext` that wraps the underlying context. Use `context.isHttp` / `context.isSocket` to detect the context type, and `context.getHttpContext()` / `context.getSocketContext()` to access the typed underlying context.

- `retrieveUser` — extract the current user from the request context. Return `null` for unauthenticated requests.
- `abilityFactory` — return a fresh `AbilityBuilder` that authorizers will populate with rules.

For an authenticator that handles both HTTP and PondSocket:

```typescript
const authenticator: Authenticator = {
    retrieveUser: async (context) => {
        if (context.isHttp) {
            return context.getHttpContext().switchToHttp().getRequest().user ?? null;
        }

        return context.getSocketContext().getData('user') ?? null;
    },
    abilityFactory: () => new AbilityBuilder(createMongoAbility),
};
```

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

After this, `@CurrentAbility.HTTP()` returns `MongoAbility` and authorizer `forUser` receives your user type.

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

### Custom authorize hook

Authorizers can implement an optional `authorize` method for custom authorization logic beyond CASL rules. It runs after CASL permission checks pass. Return `false` to deny access.

```typescript
@Authorizer()
class PostAuthorizer implements WillAuthorize {
    forUser(user: User, builder: AbilityBuilder<MongoAbility>) {
        builder.can('read', 'Post');
    }

    async authorize(context: AuthorizationContext, ability: MongoAbility, permissions: Permission[]) {
        const post = await this.postService.findOne(context);
        return post.isPublished;
    }
}
```

All authorizers with an `authorize` method are called. If any returns `false`, the request receives a 403.

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

## Accessing the Ability and User

Use `@CurrentAbility.HTTP()` and `@CurrentUser.HTTP()` to inject the built CASL ability and authenticated user into a handler. The guard must run first.

```typescript
import { CurrentAbility, CurrentUser } from '@eleven-am/authorizer';
import { MongoAbility } from '@casl/ability';

@Get(':id')
@CanPerform({ action: 'read', subject: 'Post' })
findOne(
    @Param('id') id: string,
    @CurrentAbility.HTTP() ability: MongoAbility,
    @CurrentUser.HTTP() user: User,
) {
    const canEdit = ability.can('update', 'Post');
}
```

## Custom Parameter Decorators

Use `createParamDecorator` to build your own parameter decorators that work across both HTTP and PondSocket contexts:

```typescript
import { createParamDecorator, AuthorizationContext } from '@eleven-am/authorizer';

const CurrentSession = createParamDecorator((context: AuthorizationContext) => {
    return context.getData<Session>('session');
});

// HTTP handler
findAll(@CurrentSession.HTTP() session: Session) {}

// PondSocket handler
findAll(@CurrentSession.WS() session: Session) {}
```

The mapper receives an `AuthorizationContext` with unified `getData` / `addData` methods. The returned object has `HTTP` and `WS` properties, each producing a `ParameterDecorator`.

## PondSocket

The library supports `@eleven-am/pondsocket-nest` via a separate entry point. Install `@eleven-am/pondsocket-nest` as a dependency, then import `AuthorizationSocketGuard` from `@eleven-am/authorizer/pondsocket`.

### Guard

Register `AuthorizationSocketGuard` with your PondSocket module:

```typescript
import { AuthorizationSocketGuard } from '@eleven-am/authorizer/pondsocket';

PondSocketModule.forRoot({
    guards: [AuthorizationSocketGuard],
    providers: [AuthorizationSocketGuard],
})
```

The guard delegates to the same `AuthorizationService` used by HTTP. `@CanPerform()` and `@Authorizer()` work identically.

### Accessing the Ability and User

Use the `.WS()` variant of the same decorators:

```typescript
import { CanPerform, CurrentAbility, CurrentUser } from '@eleven-am/authorizer';
import { MongoAbility } from '@casl/ability';

@OnEvent('find-all')
@CanPerform({ action: 'read', subject: 'Post' })
findAll(@CurrentAbility.WS() ability: MongoAbility, @CurrentUser.WS() user: User) {}
```

## API Reference

### Module

- `AuthorizationModule.forRoot(authenticator: Authenticator): DynamicModule`
- `AuthorizationModule.forRootAsync(options: AuthorizationAsyncModuleOptions): DynamicModule`

### Guards

- `AuthorizationGuard` — HTTP guard, implements NestJS `CanActivate`
- `AuthorizationSocketGuard` — PondSocket guard (from `@eleven-am/authorizer/pondsocket`)

### Decorators

- `Authorizer()` — class decorator, marks a provider as an authorizer
- `CanPerform(...permissions: Permission[])` — class or method decorator
- `CurrentAbility` — `{ HTTP: () => ParameterDecorator, WS: () => ParameterDecorator }`
- `CurrentUser` — `{ HTTP: () => ParameterDecorator, WS: () => ParameterDecorator }`
- `createParamDecorator(mapper)` — build custom dual-context param decorators

### Classes

- `AuthorizationContext` — wraps `ExecutionContext` or PondSocket `Context`
  - `isHttp` / `isSocket` — boolean getters
  - `getHttpContext()` — returns `ExecutionContext`
  - `getSocketContext()` — returns PondSocket `Context`
  - `getClass()` / `getHandler()` — delegates to underlying context
  - `addData(key, value)` / `getData(key)` — unified data access

### Interfaces

- `Authenticator` — `retrieveUser(context: AuthorizationContext)` and `abilityFactory()`
- `WillAuthorize` — `forUser(user, builder)` and optional `authorize(context, ability, permissions)`
- `Permission` — `{ action, subject, field? }`
- `Register` — augment to type `user` and `ability`
- `AuthorizationAsyncModuleOptions` — `{ imports?, inject?, useFactory }`

### Types

- `ResolvedUser` — resolved from `Register['user']`, defaults to `unknown`
- `ResolvedAbility` — resolved from `Register['ability']`, defaults to `AnyAbility`
- `ContextMapper<T>` — `(context: AuthorizationContext) => T`

### Service

- `AuthorizationService` — provided by the module, used internally by the guards

## License

[GPL-3.0](LICENSE)
