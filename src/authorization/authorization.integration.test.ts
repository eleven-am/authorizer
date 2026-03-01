import 'reflect-metadata';
import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AbilityBuilder, createMongoAbility } from '@casl/ability';

import { ABILITY_KEY } from './authorization.constants';
import { WillAuthorize } from './authorization.contracts';
import { Authorizer, CanPerform } from './authorization.decorators';
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

    publicEndpoint () {}
}

@CanPerform({ action: 'read', subject: 'Post' })
class ProtectedController {
    @CanPerform({ action: 'create', subject: 'Comment' })
    addComment () {}
}

describe('Authorization Integration', () => {
    let service: AuthorizationService;
    let mockDiscovery: { getProviders: jest.Mock };
    let mockAuthenticator: { retrieveUser: jest.Mock; abilityFactory: jest.Mock };
    let mockRequest: Record<string | symbol, any>;

    function createContext (controller: any, handler: Function) {
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

        const ability = mockRequest[ABILITY_KEY];

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

        const ctx = createContext(PostController, PostController.prototype.publicEndpoint);
        const result = await service.authorize(ctx);

        expect(result).toBe(true);
    });

    it('stores the built ability on the request object', async () => {
        mockAuthenticator.retrieveUser.mockResolvedValue({ id: 1 });

        const ctx = createContext(PostController, PostController.prototype.findAll);

        await service.authorize(ctx);

        const ability = mockRequest[ABILITY_KEY];

        expect(ability).toBeDefined();
        expect(ability.can('read', 'Post')).toBe(true);
    });
});
