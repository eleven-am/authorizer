# @eleven-am/authorizer

Authorization for NestJS applications using [CASL](https://casl.js.org/). Defines permissions via decorators, checks them automatically through a guard, and exposes the built CASL ability to handlers. Works across HTTP, GraphQL, and PondSocket transports through a pluggable transport registry, and ships a Prisma port that turns CASL rules into `where` clauses.

## Install

```bash
npm install @eleven-am/authorizer
```

Peer dependencies:

| Package | Range | Required |
| --- | --- | --- |
| `@casl/ability` | `^7.0.0` | yes |
| `@nestjs/common` | `^11.0.0` | yes |
| `@nestjs/core` | `^11.0.0` | yes |
| `@nestjs/graphql` | `^13.0.0` | only for GraphQL contexts |
| `@eleven-am/pondsocket-nest` | `^0.0.138` | only for PondSocket support |
| `@casl/prisma` | `^2.0.0` | only for the `./prisma` port |
| `@prisma/client` | `^4.16.0 \|\| ^5.0.0 \|\| ^6.0.0 \|\| ^7.0.0` | only for the `./prisma` port |

## Example

A blog API with role-based access control, custom authorization, and PondSocket real-time updates.

### Type registration

```typescript
import { PrismaAbility } from '@casl/prisma';

interface User {
    id: number;
    role: 'admin' | 'editor' | 'viewer';
    email: string;
}

type Action = 'read' | 'create' | 'update' | 'delete' | 'manage';
type Subject = 'Post' | 'Comment';

type AppAbility = PrismaAbility<[Action, Subject]>;

declare module '@eleven-am/authorizer' {
    interface Register {
        user: User;
        ability: AppAbility;
    }
}
```

### Module setup

```typescript
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthorizationModule, AuthorizationGuard, Authenticator } from '@eleven-am/authorizer';
import { AbilityBuilder } from '@casl/ability';
import { createPrismaAbility } from '@casl/prisma';

@Module({
    imports: [
        AuthorizationModule.forRootAsync({
            imports: [UserModule],
            inject: [UserService],
            useFactory: (userService: UserService): Authenticator => ({
                retrieveUser: async (context) => {
                    if (context.isSocket) {
                        return context.getSocketContext().getData('user') ?? null;
                    }

                    const request = context.getRequestLike() as { headers: Record<string, string> } | null;

                    return request ? userService.fromToken(request.headers.authorization) : null;
                },
                abilityFactory: () => new AbilityBuilder<AppAbility>(createPrismaAbility),
            }),
        }),
    ],
    providers: [
        { provide: APP_GUARD, useClass: AuthorizationGuard },
    ],
})
export class AppModule {}
```

`getRequestLike()` returns the request object for both HTTP and GraphQL contexts, so one authenticator covers both without branching on the transport.

### Authorizer with custom hook

```typescript
import { Authorizer, WillAuthorize, AuthorizationContext, Permission } from '@eleven-am/authorizer';
import { AbilityBuilder } from '@casl/ability';

@Authorizer()
class PostAuthorizer implements WillAuthorize {
    constructor(private readonly postService: PostService) {}

    forUser(user: User, builder: AbilityBuilder<AppAbility>) {
        builder.can('read', 'Post');

        if (user.role === 'admin') {
            builder.can('manage', 'Post');
        } else if (user.role === 'editor') {
            builder.can('create', 'Post');
            builder.can('update', 'Post', { authorId: user.id });
            builder.can('delete', 'Post', { authorId: user.id });
        }
    }

    async authorize(context: AuthorizationContext, ability: AppAbility, permissions: Permission[]) {
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

@Controller('posts')
export class PostController {
    constructor(private readonly postService: PostService) {}

    @Get()
    @CanPerform({ action: 'read', subject: 'Post' })
    findAll(@CurrentUser() user: User) {
        return this.postService.findAll(user);
    }

    @Patch(':id')
    @CanPerform({ action: 'update', subject: 'Post' })
    update(
        @Param('id') id: string,
        @Body() body: UpdatePostDto,
        @CurrentAbility() ability: AppAbility,
    ) {
        return this.postService.update(id, body, ability);
    }
}
```

## Setup

### 1. Register the module

Use `forRoot` with a static `Authenticator`, or `forRootAsync` when you need dependency injection.

```typescript
import { Module } from '@nestjs/common';
import { AuthorizationModule, Authenticator } from '@eleven-am/authorizer';
import { AbilityBuilder } from '@casl/ability';
import { createPrismaAbility } from '@casl/prisma';

const authenticator: Authenticator = {
    retrieveUser: async (context) => {
        const request = context.getRequestLike() as { user?: User } | null;
        return request?.user ?? null;
    },
    abilityFactory: () => new AbilityBuilder<AppAbility>(createPrismaAbility),
};

@Module({
    imports: [AuthorizationModule.forRoot(authenticator)],
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

```typescript
interface Authenticator {
    retrieveUser(context: AuthorizationContext): Promise<ResolvedUser | null>;
    abilityFactory(): AbilityBuilder<ResolvedAbility>;
}
```

- `retrieveUser` — extract the current user from the request context. Return `null` for unauthenticated requests.
- `abilityFactory` — return a fresh `AbilityBuilder` that authorizers will populate with rules.

`retrieveUser` receives an `AuthorizationContext`. Use `context.getRequestLike()` for a transport-agnostic view of the request (HTTP request object, GraphQL request object, or the PondSocket `Context`), or branch on `context.type` / `context.isHttp` / `context.isSocket` when you need the typed underlying context via `getHttpContext()` / `getGraphQLContext()` / `getSocketContext()`.

## Transports

Every incoming context is resolved through a transport registry. Three adapters ship built in:

- **http** — any NestJS `ExecutionContext`; data is stored on the request object
- **graphql** — `ExecutionContext`s created by `@nestjs/graphql` resolvers (`context.getType() === 'graphql'`); the request is resolved via `GqlExecutionContext`, so `@CanPerform`, `@CurrentUser()`, and the guard work in resolvers exactly as they do in controllers
- **pondsocket** — PondSocket `Context` objects, detected structurally

Adapters are matched in order: graphql, http, pondsocket, then any custom adapters.

**GraphQL subscriptions caveat**: when the GraphQL context has no `req`/`request`, per-request data (including the cached user and ability) is stored on the context object itself. With `graphql-ws`, that object is per-*connection* by default, so the ability would be cached across operations — a revoked user keeps their old ability until they disconnect. Subscription setups must either include `req` in the context or build a fresh context object per operation (`graphql-ws` `context` as a function).

### Custom transport adapters

Register an adapter for any other context type (gRPC, another websocket library):

```typescript
import { registerTransportAdapter, TransportAdapter } from '@eleven-am/authorizer';

const grpcAdapter: TransportAdapter = {
    type: 'grpc',
    matches: (context) => /* detect your context */,
    create: (context) => ({
        type: 'grpc',
        getClass: () => /* ... */,
        getHandler: () => /* ... */,
        getData: (key) => /* ... */,
        setData: (key, value) => /* ... */,
        getRequestLike: () => /* ... */,
    }),
};

registerTransportAdapter(grpcAdapter, { prepend: true });
```

`prepend: true` places the adapter ahead of the built-ins; omit it to append.

## Type Registration

By default, the user type is `unknown` and the ability type is `AnyAbility`. To get typed parameters, augment the `Register` interface:

```typescript
import { PrismaAbility } from '@casl/prisma';

type Action = 'read' | 'create' | 'update' | 'delete' | 'manage';
type Subject = 'Post' | 'Comment';

type AppAbility = PrismaAbility<[Action, Subject]>;

declare module '@eleven-am/authorizer' {
    interface Register {
        user: { id: number; role: string };
        ability: AppAbility;
    }
}
```

After this, `@CurrentAbility()` returns `AppAbility`, authorizer `forUser` receives your user type, and `@CanPerform` actions and subjects are checked at compile time.

### Choosing the ability flavor

The registered ability, the `abilityFactory`, and the condition syntax in your authorizers must agree — the library runs whatever builder you supply and does not translate between flavors:

| You use | Register | `abilityFactory` | Rule condition syntax |
| --- | --- | --- | --- |
| Prisma (the default for this library, required for `./prisma`) | `PrismaAbility` (from `@casl/prisma`) | `createPrismaAbility` | Prisma `WhereInput` (`{ authorId: { not: 1 } }`) |
| gate checks only, no Prisma anywhere | `MongoAbility` (from `@casl/ability`) | `createMongoAbility` | MongoDB query language (`{ authorId: { $ne: 1 } }`) |

Every example in this README uses the Prisma flavor. `MongoAbility` refers to MongoDB's query *language* for in-memory condition matching, not the database — it works against any storage for gate checks, and is only appropriate when nothing in the application will ever call `constrain`. `constrain` copies rule conditions into Prisma `where` clauses verbatim, so Mongo-syntax conditions (`$ne`, `$in`) would reach Prisma unchanged and fail at query time. With `createPrismaAbility`, the `prismaQuery` interpreter evaluates the same Prisma-shaped conditions in memory for `ability.can(...)` checks, so one flavor serves both directions — and `PrismaAbility` types conditions against your generated `Prisma.TypeMap`, making a condition on a nonexistent model field a compile error.

## Authorizers

An authorizer is a NestJS provider that defines CASL rules for a user. Mark a class with `@Authorizer()` and implement `WillAuthorize`:

```typescript
import { Authorizer, WillAuthorize } from '@eleven-am/authorizer';
import { AbilityBuilder } from '@casl/ability';

@Authorizer()
class PostAuthorizer implements WillAuthorize {
    forUser(user: { id: number; role: string }, builder: AbilityBuilder<AppAbility>) {
        if (user.role === 'admin') {
            builder.can('manage', 'Post');
        } else {
            builder.can('read', 'Post');
            builder.can('update', 'Post', { authorId: user.id });
        }
    }
}
```

Register it as a provider in your module. The library discovers all `@Authorizer()` providers at startup and calls each one's `forUser` when building an ability. `forUser` can be async. You can have multiple authorizers; each one adds rules to the same builder.

### Subject resolution

A scoped authorizer can declare how to load the entity a route is about. The guard then loads it, evaluates conditional rules against the real record, and hands the pre-authorized entity to the handler:

```typescript
@Authorizer('Comment')
export class CommentAuthorizer implements WillAuthorize<Comment> {
    constructor(private readonly comments: CommentService) {}

    forUser(user: User, { can }: AbilityBuilder<AppAbility>) {
        can('update', 'Comment', { authorId: user.id });
    }

    resolveSubject(context: AuthorizationContext) {
        const { postId, commentId } = (context.getRequestLike() as Request)?.params ?? {};

        return commentId ? this.comments.findFirst({ where: { id: commentId, postId } }) : null;
    }
}
```

```typescript
@Patch('posts/:postId/comments/:commentId')
@CanPerform(
    { action: 'read', subject: 'Post' },
    { action: 'update', subject: 'Comment' },
)
update(
    @CurrentSubject('Comment') comment: Comment,
    @Body() body: UpdateCommentDto,
) {}
```

The semantics:

- **Permission-driven** — a resolver runs only when a route permission names its subject. Routes without that permission never trigger it.
- Resolvers for different subjects run in parallel and are independent of each other.
- `null` from a resolver → 404 naming the subject. A failed instance check (`ability.can(action, entity)` against the resolved record) → 403. A throwing resolver propagates as-is.
- Resolved entities are stashed per subject name; `authorize` hooks run after resolution and can read them via `context.getData`.
- `@CurrentSubject('Comment')` injects the named entity — the same instance that was authorized, so handlers do not re-fetch. The bare form `@CurrentSubject()` works when exactly one subject was resolved and throws otherwise.
- **Parent–child containment belongs in the child's resolver**: resolving the comment through both `commentId` and `postId` (as above) makes a comment under a different post indistinguishable from a missing one — a 404, decided in one place, before any handler runs.
- Two authorizers declaring `resolveSubject` for the same subject fail at startup — one owner per subject.

For list endpoints and query-level filtering, prefer the `./prisma` port's `constrain` — subject resolution is for single-entity routes where the decision should happen at the guard.

### Custom authorize hook

Authorizers can implement an optional `authorize` method for custom authorization logic beyond CASL rules. It runs after CASL permission checks pass. Return `false` to deny access.

All authorizers with an `authorize` method are called on every guarded request. If any returns `false`, the request receives a 403.

## Permissions

Use `@CanPerform()` on a controller class or individual methods to require specific permissions, and `@Public()` to open a route to unauthenticated requests:

```typescript
@Controller('posts')
export class PostController {
    @Get()
    @CanPerform({ action: 'read', subject: 'Post' })
    findAll() {}

    @Patch(':id')
    @CanPerform({ action: 'update', subject: 'Post', field: 'content' })
    update(@Param('id') id: string, @Body() body: any) {}

    @Get('health')
    @Public()
    health() {}
}
```

When `@CanPerform()` is applied to both the class and a method, permissions are merged. `@Public()` on a class applies to all of its handlers.

Guarded routes are secure by default:

| Route | Anonymous request | Authenticated request |
| --- | --- | --- |
| `@CanPerform(...)` | 401 | permissions checked, 403 on failure |
| undecorated | 401 | allowed |
| `@Public()` | allowed | allowed |
| `@Public()` + `@CanPerform(...)` on the same handler | 401 — permissions win | permissions checked |
| `@Public()` handler inside a `@CanPerform` class | allowed — the handler is exempt from class-level permissions | allowed, class permissions not checked |

Stacked `@CanPerform` decorators on one handler or class accumulate — every permission from every decorator is enforced.

A failing authenticator (for example an expired token that makes `retrieveUser` throw) does not block public routes: the request proceeds anonymously. On protected routes the failure propagates.

To restore the pre-2.0 behavior where undecorated routes allow anonymous requests, set `defaultPolicy`:

```typescript
AuthorizationModule.forRoot(authenticator, { defaultPolicy: 'public' })

AuthorizationModule.forRootAsync({ defaultPolicy: 'public', /* ... */ })
```

### Typed permissions

Register your CASL ability with explicit action and subject tuples — as in the [Type Registration](#type-registration) example — and `@CanPerform` becomes fully typed: `@CanPerform({ action: 'raed', subject: 'Post' })` is a compile error. The typing derives from the ability's generics, so it works with any flavor (`PrismaAbility<[Action, Subject]>` and `MongoAbility<[Action, Subject]>` alike). Without the registration, `action` and `subject` accept any string.

## Accessing the Ability and User

Use `@CurrentAbility()` and `@CurrentUser()` to inject the built CASL ability and authenticated user into a handler. One decorator covers controllers, GraphQL resolvers, and PondSocket handlers — the transport is resolved internally. The guard must run first.

On `@Public()` routes where the user may be anonymous, pass `{ optional: true }` to receive `null` instead of a 401:

```typescript
@Get('feed')
@Public()
feed(@CurrentUser({ optional: true }) user: User | null) {
    return this.postService.feedFor(user);
}
```

## Custom Parameter Decorators

Use `createParamDecorator` to build your own parameter decorators that work across transports:

```typescript
import { createParamDecorator, AuthorizationContext } from '@eleven-am/authorizer';

const CurrentSession = createParamDecorator((context: AuthorizationContext) => {
    return context.getData<Session>('session');
});

findAll(@CurrentSession() session: Session) {}
```

The returned factory produces a decorator registered with both the Nest and PondSocket parameter systems, so the same decorator works in any handler; each framework reads only its own registration.

## PondSocket

Install `@eleven-am/pondsocket-nest`, then import `AuthorizationSocketGuard` from `@eleven-am/authorizer/pondsocket`:

```typescript
import { AuthorizationSocketGuard } from '@eleven-am/authorizer/pondsocket';

PondSocketModule.forRoot({
    guards: [AuthorizationSocketGuard],
    providers: [AuthorizationSocketGuard],
})
```

The guard delegates to the same `AuthorizationService` used by HTTP. `@CanPerform()`, `@Authorizer()`, and all parameter decorators work identically in channel handlers.

## Prisma

The `./prisma` subpath turns CASL rules into Prisma `where` clauses via [`@casl/prisma`](https://casl.js.org/v6/en/package/casl-prisma). Install `@casl/prisma` and `@prisma/client`, register the `PrismaAbility` type and build abilities with `createPrismaAbility` (as shown in [Type Registration](#type-registration)), then provide `PrismaAuthorizationService` in any module:

```typescript
import { PrismaAuthorizationService } from '@eleven-am/authorizer/prisma';

@Module({
    providers: [PrismaAuthorizationService],
})
export class CrudModule {}
```

```typescript
@Injectable()
export class PostCrudService {
    constructor(private readonly prismaAuthorization: PrismaAuthorizationService) {}

    async findAll(context: ExecutionContext) {
        await this.prismaAuthorization.authorize('read', 'Post', context);

        const where = await this.prismaAuthorization.constrain('read', 'Post', context);

        return this.prisma.post.findMany({ where });
    }
}
```

- `authorize(action, model, context)` — gate check; throws `UnauthorizedException` (401) when no user can be resolved, `ForbiddenException` (403) when the ability denies the action on the model.
- `constrain(action, model, context)` — returns the Prisma `where` clause for the rows the user can act on. Unconditional rules produce `{}` (match all), conditional rules produce an `OR` clause, and `cannot` rules produce negated `AND` conditions. A fully denied action throws `ForbiddenException` — the `{ OR: [] }` clause is never emitted, because Prisma has historically mishandled empty `OR` (prisma/prisma#17367) and a deny-all that silently returns every row is the worst possible failure mode.

Both methods resolve the ability once per request: if the guard already ran, its ability is reused; repeated calls on the same request hit the cache.

The ability can also be resolved directly from the core service:

```typescript
const ability = await this.authorizationService.getAbility(context);
```

## API Reference

### Module

- `AuthorizationModule.forRoot(authenticator: Authenticator, options?: AuthorizationModuleOptions): DynamicModule`
- `AuthorizationModule.forRootAsync(options: AuthorizationAsyncModuleOptions): DynamicModule`
- `AuthorizationModuleOptions` — `{ defaultPolicy?: 'authenticated' | 'public' }`, defaults to `'authenticated'`

### Guards

- `AuthorizationGuard` — HTTP/GraphQL guard, implements NestJS `CanActivate`
- `AuthorizationSocketGuard` — PondSocket guard (from `@eleven-am/authorizer/pondsocket`)

### Decorators

- `Authorizer(subject?)` — class decorator, marks a provider as an authorizer, optionally scoped to a subject for `resolveSubject`
- `CanPerform(...permissions: Permission[])` — class or method decorator; stacked decorators accumulate
- `Public()` — class or method decorator, allows unauthenticated access
- `CurrentAbility` / `CurrentUser` — `(options?: { optional?: boolean }) => ParameterDecorator`, works on any transport
- `CurrentSubject` — `(subject?: string) => ParameterDecorator`, injects a resolved subject entity on any transport
- `createParamDecorator(mapper)` — build custom dual-context param decorators

### Transports

- `registerTransportAdapter(adapter: TransportAdapter, options?: { prepend?: boolean })`
- `TransportAdapter` — `{ type, matches(context), create(context) }`
- `TransportContext` — `{ type, getClass(), getHandler(), getData(key), setData(key, value), getRequestLike() }`

### Classes

- `AuthorizationContext` — facade over the matched transport
  - `type` — `'http' | 'graphql' | 'pondsocket'` or a custom adapter type
  - `isHttp` / `isSocket` — boolean getters
  - `getHttpContext()` / `getGraphQLContext()` — the underlying `ExecutionContext`; each throws when the transport does not match
  - `getSocketContext()` — the underlying PondSocket `Context`
  - `getClass()` / `getHandler()` — delegates to the transport
  - `getRequestLike()` — the request object (HTTP/GraphQL) or socket context
  - `addData(key, value)` / `getData(key)` — unified per-request data access

### Services

- `AuthorizationService`
  - `authorize(context)` — used internally by the guards
  - `getAbility(context)` — resolve (and cache) the ability for a request; throws 401 when unauthenticated
- `PrismaAuthorizationService` (from `@eleven-am/authorizer/prisma`)
  - `authorize(action, model, context)` — gate check
  - `constrain(action, model, context)` — Prisma `where` clause

### Interfaces

- `Authenticator` — `retrieveUser(context)` and `abilityFactory()`
- `WillAuthorize` — `forUser(user, builder)` and optional `authorize(context, ability, permissions)`
- `Permission` — `{ action, subject, field? }`
- `Register` — augment to type `user` and `ability`
- `AuthorizationAsyncModuleOptions` — `{ imports?, inject?, useFactory }`

## Migrating from 1.x

- **Undecorated routes now require authentication.** In 1.x, a guarded route without `@CanPerform()` allowed anonymous requests through; in 2.0 they receive a 401. Add `@Public()` to intentionally open routes, or set `defaultPolicy: 'public'` on the module to keep the 1.x behavior while migrating. This applies to PondSocket channels guarded by `AuthorizationSocketGuard` too — anonymous socket events on non-public handlers are now rejected.
- **Socket denials are now protocol-level rejections.** `AuthorizationSocketGuard` returns `false` on authorization failures instead of letting Nest exceptions escape into PondSocket's internal-error path.
- **Stacked `@CanPerform` decorators accumulate.** In 1.x only the last decorator's permissions survived; all are now enforced.
- **Authorizers registered as custom providers are now discovered.** In 1.x, `@Authorizer()` classes provided via `useFactory`/`useValue` were silently ignored.
- **`constrain` throws on fully denied actions** instead of returning `{ OR: [] }`.
- **Falsy values round-trip through `context.getData`.** In 1.x, storing `0`, `''`, or `false` returned `null`.
- **Parameter decorators are unified.** `@CurrentUser.HTTP()` / `@CurrentUser.WS()` become `@CurrentUser()` (same for `CurrentAbility` and decorators built with `createParamDecorator`); one decorator registers with both Nest and PondSocket.
- `@casl/ability` peer requirement moved from `^6.0.0` to `^7.0.0`.
- `Permission.action` / `Permission.subject` narrow to your registered ability's action and subject types. Code with permission typos that previously compiled will now fail to compile; without `Register` augmentation nothing changes.
- GraphQL execution contexts are now detected as their own transport. `context.isHttp` returns `false` and `getHttpContext()` throws for them; use `getRequestLike()` or `getGraphQLContext()` instead. In 1.x these contexts were misclassified as HTTP and user resolution silently failed.
- Contexts no adapter recognizes now throw a descriptive error instead of being treated as socket contexts.
- `@eleven-am/pondsocket-nest` peer requirement moved to `^0.0.138`.
- The published package now nests code under `dist/`; the import specifiers (`@eleven-am/authorizer`, `/pondsocket`, `/prisma`) are unchanged.

## License

[GPL-3.0](LICENSE)
