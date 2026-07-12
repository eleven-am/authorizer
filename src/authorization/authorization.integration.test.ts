import 'reflect-metadata';
import { ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AbilityBuilder, createMongoAbility } from '@casl/ability';

import { ABILITY_CONTEXT_KEY, SUBJECTS_CONTEXT_KEY } from './authorization.constants';
import { AuthorizationContext } from './authorization.context';
import { WillAuthorize } from './authorization.contracts';
import { Authorizer, CanPerform, Public } from './authorization.decorators';
import { AuthorizationService } from './authorization.service';

@Authorizer()
class PostAuthorizer implements WillAuthorize {
    forUser (_user: unknown, builder: AbilityBuilder<any>) {
        builder.can('read', 'Post');
    }
}

@Authorizer()
class CommentAuthorizer implements WillAuthorize {
    forUser (_user: unknown, builder: AbilityBuilder<any>) {
        builder.can('create', 'Comment');
    }
}

class PlainProvider {
    doSomething () {}
}

class PostController {
    @CanPerform({ action: 'read', subject: 'Post' })
    findAll () {}

    @CanPerform({ action: 'delete', subject: 'Post' })
    remove () {}

    @Public()
    publicEndpoint () {}

    undecoratedEndpoint () {}
}

@CanPerform({ action: 'read', subject: 'Post' })
class ProtectedController {
    @CanPerform({ action: 'create', subject: 'Comment' })
    addComment () {}

    @Public()
    status () {}
}

class StackedController {
    @CanPerform({ action: 'read', subject: 'Post' })
    @CanPerform({ action: 'create', subject: 'Comment' })
    allowed () {}

    @CanPerform({ action: 'read', subject: 'Post' })
    @CanPerform({ action: 'delete', subject: 'Post' })
    denied () {}
}

@Public()
class OpenController {
    healthCheck () {}
}

describe('Authorization Integration', () => {
    let service: AuthorizationService;
    let mockDiscovery: { getProviders: jest.Mock };
    let mockAuthenticator: { retrieveUser: jest.Mock, abilityFactory: jest.Mock };
    let mockRequest: Record<string | symbol, any>;

    function createContext (controller: any, handler: (...args: unknown[]) => unknown) {
        return {
            getClass: () => controller,
            getHandler: () => handler,
            switchToHttp: () => ({
                getRequest: () => mockRequest,
            }),
        } as any;
    }

    beforeEach(() => {
        const realReflector = new Reflector();

        mockDiscovery = { getProviders: jest.fn() };
        mockAuthenticator = {
            retrieveUser: jest.fn(),
            abilityFactory: jest.fn(() => new AbilityBuilder(createMongoAbility)),
        };

        mockRequest = {};

        mockDiscovery.getProviders.mockReturnValue([
            { metatype: PostAuthorizer, instance: new PostAuthorizer() },
            { metatype: CommentAuthorizer, instance: new CommentAuthorizer() },
            { metatype: PlainProvider, instance: new PlainProvider() },
        ]);

        service = new AuthorizationService(
            mockDiscovery as any,
            realReflector,
            mockAuthenticator as any,
        );

        service.onModuleInit();
    });

    it('discovers only @Authorizer() decorated classes, ignoring plain providers', async () => {
        mockAuthenticator.retrieveUser.mockResolvedValue({ id: 1 });

        const ctx = createContext(PostController, PostController.prototype.findAll);

        await service.authorize(ctx);

        const ability = mockRequest[ABILITY_CONTEXT_KEY];

        expect(ability.can('read', 'Post')).toBe(true);
        expect(ability.can('create', 'Comment')).toBe(true);
        expect(ability.can('delete', 'Post')).toBe(false);
    });

    it('reads @CanPerform() permissions via real Reflector and grants access', async () => {
        mockAuthenticator.retrieveUser.mockResolvedValue({ id: 1 });

        const ctx = createContext(PostController, PostController.prototype.findAll);
        const result = await service.authorize(ctx);

        expect(result).toBe(true);
    });

    it('reads @CanPerform() permissions via real Reflector and denies access', async () => {
        mockAuthenticator.retrieveUser.mockResolvedValue({ id: 1 });

        const ctx = createContext(PostController, PostController.prototype.remove);

        await expect(service.authorize(ctx)).rejects.toThrow(ForbiddenException);
    });

    it('merges class-level and method-level @CanPerform via real Reflector', async () => {
        mockAuthenticator.retrieveUser.mockResolvedValue({ id: 1 });

        const ctx = createContext(ProtectedController, ProtectedController.prototype.addComment);
        const result = await service.authorize(ctx);

        expect(result).toBe(true);
    });

    it('allows access to non-decorated handler when user is authenticated', async () => {
        mockAuthenticator.retrieveUser.mockResolvedValue({ id: 1 });

        const ctx = createContext(PostController, PostController.prototype.undecoratedEndpoint);
        const result = await service.authorize(ctx);

        expect(result).toBe(true);
    });

    it('denies anonymous access to non-decorated handlers', async () => {
        mockAuthenticator.retrieveUser.mockResolvedValue(null);

        const ctx = createContext(PostController, PostController.prototype.undecoratedEndpoint);

        await expect(service.authorize(ctx)).rejects.toThrow(UnauthorizedException);
    });

    it('allows anonymous access to @Public() handlers', async () => {
        mockAuthenticator.retrieveUser.mockResolvedValue(null);

        const ctx = createContext(PostController, PostController.prototype.publicEndpoint);
        const result = await service.authorize(ctx);

        expect(result).toBe(true);
    });

    it('allows anonymous access to handlers of @Public() classes', async () => {
        mockAuthenticator.retrieveUser.mockResolvedValue(null);

        const ctx = createContext(OpenController, OpenController.prototype.healthCheck);
        const result = await service.authorize(ctx);

        expect(result).toBe(true);
    });

    it('allows anonymous access to @Public() handlers inside @CanPerform classes', async () => {
        mockAuthenticator.retrieveUser.mockResolvedValue(null);

        const ctx = createContext(ProtectedController, ProtectedController.prototype.status);
        const result = await service.authorize(ctx);

        expect(result).toBe(true);
    });

    it('enforces every permission from stacked @CanPerform decorators', async () => {
        mockAuthenticator.retrieveUser.mockResolvedValue({ id: 1 });

        const allowed = await service.authorize(
            createContext(StackedController, StackedController.prototype.allowed),
        );

        expect(allowed).toBe(true);

        await expect(service.authorize(
            createContext(StackedController, StackedController.prototype.denied),
        )).rejects.toThrow(ForbiddenException);
    });

    it('allows anonymous access to non-decorated handlers when defaultPolicy is public', async () => {
        const permissiveService = new AuthorizationService(
            mockDiscovery as any,
            new Reflector(),
            mockAuthenticator as any,
            { defaultPolicy: 'public' },
        );

        permissiveService.onModuleInit();
        mockAuthenticator.retrieveUser.mockResolvedValue(null);

        const ctx = createContext(PostController, PostController.prototype.undecoratedEndpoint);
        const result = await permissiveService.authorize(ctx);

        expect(result).toBe(true);
    });

    it('stores the built ability on the request object', async () => {
        mockAuthenticator.retrieveUser.mockResolvedValue({ id: 1 });

        const ctx = createContext(PostController, PostController.prototype.findAll);

        await service.authorize(ctx);

        const ability = mockRequest[ABILITY_CONTEXT_KEY];

        expect(ability).toBeDefined();
        expect(ability.can('read', 'Post')).toBe(true);
    });

    describe('subject resolution with nested resources', () => {
        const posts: Record<string, { id: string, authorId: number }> = {
            p1: { id: 'p1', authorId: 1 },
        };
        const comments = [
            { id: 'c1', postId: 'p1', authorId: 1 },
            { id: 'c2', postId: 'p2', authorId: 2 },
        ];

        @Authorizer('Post')
        class ScopedPostAuthorizer implements WillAuthorize {
            forUser (_user: unknown, builder: AbilityBuilder<any>) {
                builder.can('read', 'Post');
            }

            resolveSubject (context: AuthorizationContext) {
                const params = (context.getRequestLike() as any)?.params ?? {};

                return posts[params.postId] ?? null;
            }
        }

        @Authorizer('Comment')
        class ScopedCommentAuthorizer implements WillAuthorize {
            forUser (user: any, builder: AbilityBuilder<any>) {
                builder.can('update', 'Comment', { authorId: user.id });
            }

            resolveSubject (context: AuthorizationContext) {
                const params = (context.getRequestLike() as any)?.params ?? {};

                return comments.find(
                    (comment) => comment.id === params.commentId && comment.postId === params.postId,
                ) ?? null;
            }
        }

        class CommentController {
            @CanPerform(
                { action: 'read', subject: 'Post' },
                { action: 'update', subject: 'Comment' },
            )
            update () {}
        }

        let nestedService: AuthorizationService;

        beforeEach(() => {
            const discovery = {
                getProviders: jest.fn().mockReturnValue([
                    { metatype: ScopedPostAuthorizer, instance: new ScopedPostAuthorizer() },
                    { metatype: ScopedCommentAuthorizer, instance: new ScopedCommentAuthorizer() },
                ]),
            };

            nestedService = new AuthorizationService(
                discovery as any,
                new Reflector(),
                mockAuthenticator as any,
            );

            nestedService.onModuleInit();
        });

        it('authorizes the owner and stashes both subjects', async () => {
            mockAuthenticator.retrieveUser.mockResolvedValue({ id: 1 });
            mockRequest.params = { postId: 'p1', commentId: 'c1' };

            const ctx = createContext(CommentController, CommentController.prototype.update);
            const result = await nestedService.authorize(ctx);

            expect(result).toBe(true);
            expect(mockRequest[SUBJECTS_CONTEXT_KEY]).toEqual({
                Post: posts.p1,
                Comment: comments[0],
            });
        });

        it('denies a non-owner via the instance condition', async () => {
            mockAuthenticator.retrieveUser.mockResolvedValue({ id: 2 });
            mockRequest.params = { postId: 'p1', commentId: 'c1' };

            const ctx = createContext(CommentController, CommentController.prototype.update);

            await expect(nestedService.authorize(ctx)).rejects.toThrow(ForbiddenException);
        });

        it('returns 404 for a comment that belongs to a different post', async () => {
            mockAuthenticator.retrieveUser.mockResolvedValue({ id: 2 });
            mockRequest.params = { postId: 'p1', commentId: 'c2' };

            const ctx = createContext(CommentController, CommentController.prototype.update);

            await expect(nestedService.authorize(ctx)).rejects.toThrow(NotFoundException);
        });

        it('returns 404 for a missing parent', async () => {
            mockAuthenticator.retrieveUser.mockResolvedValue({ id: 1 });
            mockRequest.params = { postId: 'p9', commentId: 'c1' };

            const ctx = createContext(CommentController, CommentController.prototype.update);

            await expect(nestedService.authorize(ctx)).rejects.toThrow(NotFoundException);
        });
    });

    describe('with GraphQL execution contexts', () => {
        function createGraphQLContext (controller: any, handler: (...args: unknown[]) => unknown) {
            return {
                getClass: () => controller,
                getHandler: () => handler,
                getType: () => 'graphql',
                getArgs: () => [{}, {}, { req: mockRequest }, {}],
                switchToHttp: () => ({
                    getRequest: () => ({}),
                }),
            } as any;
        }

        it('grants access and stores the ability on the request behind the GraphQL context', async () => {
            mockAuthenticator.retrieveUser.mockResolvedValue({ id: 1 });

            const ctx = createGraphQLContext(PostController, PostController.prototype.findAll);
            const result = await service.authorize(ctx);

            const ability = mockRequest[ABILITY_CONTEXT_KEY];

            expect(result).toBe(true);
            expect(ability.can('read', 'Post')).toBe(true);
        });

        it('denies access via real Reflector permissions', async () => {
            mockAuthenticator.retrieveUser.mockResolvedValue({ id: 1 });

            const ctx = createGraphQLContext(PostController, PostController.prototype.remove);

            await expect(service.authorize(ctx)).rejects.toThrow(ForbiddenException);
        });

        it('exposes the GraphQL request to the authenticator via getRequestLike', async () => {
            mockRequest.user = { id: 7 };
            mockAuthenticator.retrieveUser.mockImplementation(
                (context: any) => Promise.resolve((context.getRequestLike() as any)?.user ?? null),
            );

            const ctx = createGraphQLContext(PostController, PostController.prototype.findAll);
            const result = await service.authorize(ctx);

            expect(result).toBe(true);
            expect(mockRequest[ABILITY_CONTEXT_KEY]).toBeDefined();
        });
    });
});
