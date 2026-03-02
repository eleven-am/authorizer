import 'reflect-metadata';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { AbilityBuilder, createMongoAbility } from '@casl/ability';

import { ABILITY_CONTEXT_KEY, USER_CONTEXT_KEY, AUTHORIZER_KEY, CAN_PERFORM_KEY } from './authorization.constants';
import { AuthorizationService } from './authorization.service';

describe('AuthorizationService', () => {
    let service: AuthorizationService;
    let mockDiscovery: { getProviders: jest.Mock };
    let mockReflector: { get: jest.Mock };
    let mockAuthenticator: { retrieveUser: jest.Mock; abilityFactory: jest.Mock };
    let mockRequest: Record<string, any>;
    let mockContext: {
        getClass: jest.Mock;
        getHandler: jest.Mock;
        switchToHttp: jest.Mock;
    };
    let testClass: any;
    let testHandler: any;

    beforeEach(() => {
        mockDiscovery = { getProviders: jest.fn().mockReturnValue([]) };
        mockReflector = { get: jest.fn() };
        mockAuthenticator = {
            retrieveUser: jest.fn(),
            abilityFactory: jest.fn(),
        };

        service = new AuthorizationService(
            mockDiscovery as any,
            mockReflector as any,
            mockAuthenticator as any,
        );

        testClass = class TestController {};
        testHandler = function testHandler () {};
        mockRequest = {};
        mockContext = {
            getClass: jest.fn().mockReturnValue(testClass),
            getHandler: jest.fn().mockReturnValue(testHandler),
            switchToHttp: jest.fn().mockReturnValue({
                getRequest: jest.fn().mockReturnValue(mockRequest),
            }),
        };
    });

    function setupAuthorizers (authorizers: Array<{ forUser: jest.Mock }>) {
        const providers = authorizers.map((instance) => ({
            metatype: class {},
            instance,
        }));

        mockDiscovery.getProviders.mockReturnValue(providers);
        mockReflector.get.mockImplementation((key: symbol) => {
            if (key === AUTHORIZER_KEY) return true;

            return null;
        });
        service.onModuleInit();
        mockReflector.get.mockReset();
    }

    function setupPermissions (classPerms: any[] | null, handlerPerms: any[] | null) {
        mockReflector.get.mockImplementation((key: symbol, target: any) => {
            if (key === CAN_PERFORM_KEY && target === testClass) return classPerms;
            if (key === CAN_PERFORM_KEY && target === testHandler) return handlerPerms;

            return null;
        });
    }

    function createAuthorizer (grantFn?: (builder: AbilityBuilder<any>) => void) {
        return {
            forUser: jest.fn().mockImplementation((_user: any, builder: any) => {
                if (grantFn) grantFn(builder);
            }),
        };
    }

    describe('onModuleInit', () => {
        it('discovers authorizers via getProviders and reflector', () => {
            const mockInstance = { forUser: jest.fn() };
            const metatype = class AuthorizerClass {};

            mockDiscovery.getProviders.mockReturnValue([
                { metatype, instance: mockInstance },
            ]);
            mockReflector.get.mockReturnValue(true);

            service.onModuleInit();

            expect(mockDiscovery.getProviders).toHaveBeenCalled();
            expect(mockReflector.get).toHaveBeenCalledWith(AUTHORIZER_KEY, metatype);
        });

        it('filters out providers without metatype', () => {
            mockDiscovery.getProviders.mockReturnValue([
                { metatype: null, instance: { forUser: jest.fn() } },
            ]);

            service.onModuleInit();

            expect(mockReflector.get).not.toHaveBeenCalled();
        });

        it('filters out providers without instance', () => {
            const metatype = class {};

            mockDiscovery.getProviders.mockReturnValue([
                { metatype, instance: null },
            ]);
            mockReflector.get.mockReturnValue(true);

            service.onModuleInit();
        });

        it('handles empty providers array', () => {
            mockDiscovery.getProviders.mockReturnValue([]);

            service.onModuleInit();

            expect(mockDiscovery.getProviders).toHaveBeenCalled();
        });

        it('filters out providers where reflector returns falsy for AUTHORIZER_KEY', () => {
            const metatype = class {};

            mockDiscovery.getProviders.mockReturnValue([
                { metatype, instance: { forUser: jest.fn() } },
            ]);
            mockReflector.get.mockReturnValue(false);

            service.onModuleInit();

            setupPermissions(null, null);
            mockAuthenticator.retrieveUser.mockResolvedValue(null);
        });
    });

    describe('authorize', () => {
        beforeEach(() => {
            mockAuthenticator.abilityFactory.mockReturnValue(
                new AbilityBuilder(createMongoAbility),
            );
        });

        it('returns true for authenticated user with no permissions', async () => {
            service.onModuleInit();
            setupPermissions(null, null);
            mockAuthenticator.retrieveUser.mockResolvedValue({ id: 1 });

            const result = await service.authorize(mockContext as any);

            expect(result).toBe(true);
        });

        it('returns true for authenticated user with valid permissions', async () => {
            const authorizer = createAuthorizer((builder) => {
                builder.can('read', 'Post');
            });

            setupAuthorizers([authorizer]);
            setupPermissions(null, [{ action: 'read', subject: 'Post' }]);
            mockAuthenticator.retrieveUser.mockResolvedValue({ id: 1 });

            const result = await service.authorize(mockContext as any);

            expect(result).toBe(true);
        });

        it('throws ForbiddenException for insufficient permissions', async () => {
            const authorizer = createAuthorizer((builder) => {
                builder.can('read', 'Post');
            });

            setupAuthorizers([authorizer]);
            setupPermissions(null, [{ action: 'delete', subject: 'Post' }]);
            mockAuthenticator.retrieveUser.mockResolvedValue({ id: 1 });

            await expect(service.authorize(mockContext as any)).rejects.toThrow(
                ForbiddenException,
            );
        });

        it('throws UnauthorizedException when no user and permissions required', async () => {
            service.onModuleInit();
            setupPermissions(null, [{ action: 'read', subject: 'Post' }]);
            mockAuthenticator.retrieveUser.mockResolvedValue(null);

            await expect(service.authorize(mockContext as any)).rejects.toThrow(
                UnauthorizedException,
            );
        });

        it('returns true when no user and no permissions (public route)', async () => {
            service.onModuleInit();
            setupPermissions(null, null);
            mockAuthenticator.retrieveUser.mockResolvedValue(null);

            const result = await service.authorize(mockContext as any);

            expect(result).toBe(true);
        });

        it('merges class and handler permissions', async () => {
            const authorizer = createAuthorizer((builder) => {
                builder.can('read', 'Post');
                builder.can('create', 'Comment');
            });

            setupAuthorizers([authorizer]);
            setupPermissions(
                [{ action: 'read', subject: 'Post' }],
                [{ action: 'create', subject: 'Comment' }],
            );
            mockAuthenticator.retrieveUser.mockResolvedValue({ id: 1 });

            const result = await service.authorize(mockContext as any);

            expect(result).toBe(true);
        });

        it('calls all authorizers during ability building', async () => {
            const authorizer1 = createAuthorizer((builder) => {
                builder.can('read', 'Post');
            });
            const authorizer2 = createAuthorizer((builder) => {
                builder.can('create', 'Comment');
            });

            setupAuthorizers([authorizer1, authorizer2]);
            setupPermissions(null, [
                { action: 'read', subject: 'Post' },
                { action: 'create', subject: 'Comment' },
            ]);
            mockAuthenticator.retrieveUser.mockResolvedValue({ id: 1 });

            const result = await service.authorize(mockContext as any);

            expect(result).toBe(true);
            expect(authorizer1.forUser).toHaveBeenCalled();
            expect(authorizer2.forUser).toHaveBeenCalled();
        });

        it('stores ability on request via ABILITY_CONTEXT_KEY', async () => {
            const authorizer = createAuthorizer((builder) => {
                builder.can('read', 'Post');
            });

            setupAuthorizers([authorizer]);
            setupPermissions(null, null);
            mockAuthenticator.retrieveUser.mockResolvedValue({ id: 1 });

            await service.authorize(mockContext as any);

            expect(mockRequest[ABILITY_CONTEXT_KEY]).toBeDefined();
            expect(mockRequest[ABILITY_CONTEXT_KEY].can('read', 'Post')).toBe(true);
        });

        it('stores user on request via USER_CONTEXT_KEY', async () => {
            const user = { id: 1, name: 'test' };

            service.onModuleInit();
            setupPermissions(null, null);
            mockAuthenticator.retrieveUser.mockResolvedValue(user);

            await service.authorize(mockContext as any);

            expect(mockRequest[USER_CONTEXT_KEY]).toBe(user);
        });

        it('handles permissions with field property', async () => {
            const authorizer = createAuthorizer((builder) => {
                builder.can('read', 'Post', ['title']);
            });

            setupAuthorizers([authorizer]);
            setupPermissions(null, [{ action: 'read', subject: 'Post', field: 'title' }]);
            mockAuthenticator.retrieveUser.mockResolvedValue({ id: 1 });

            const result = await service.authorize(mockContext as any);

            expect(result).toBe(true);
        });

        it('supports async forUser in authorizers', async () => {
            const authorizer = {
                forUser: jest.fn().mockImplementation(
                    async (_user: any, builder: any) => {
                        builder.can('read', 'Post');
                    },
                ),
            };

            setupAuthorizers([authorizer]);
            setupPermissions(null, [{ action: 'read', subject: 'Post' }]);
            mockAuthenticator.retrieveUser.mockResolvedValue({ id: 1 });

            const result = await service.authorize(mockContext as any);

            expect(result).toBe(true);
        });

        it('defaults to empty permissions when reflector returns null', async () => {
            service.onModuleInit();
            mockReflector.get.mockReturnValue(null);
            mockAuthenticator.retrieveUser.mockResolvedValue({ id: 1 });

            const result = await service.authorize(mockContext as any);

            expect(result).toBe(true);
        });

        it('calls authorize hook on authorizers that implement it', async () => {
            const authorizer = {
                forUser: jest.fn(),
                authorize: jest.fn().mockResolvedValue(true),
            };

            setupAuthorizers([authorizer]);
            setupPermissions(null, null);
            mockAuthenticator.retrieveUser.mockResolvedValue({ id: 1 });

            const result = await service.authorize(mockContext as any);

            expect(result).toBe(true);
            expect(authorizer.authorize).toHaveBeenCalledWith(
                expect.anything(),
                expect.anything(),
                expect.any(Array),
            );
        });

        it('throws ForbiddenException when authorize hook returns false', async () => {
            const authorizer = {
                forUser: jest.fn(),
                authorize: jest.fn().mockResolvedValue(false),
            };

            setupAuthorizers([authorizer]);
            setupPermissions(null, null);
            mockAuthenticator.retrieveUser.mockResolvedValue({ id: 1 });

            await expect(service.authorize(mockContext as any)).rejects.toThrow(
                ForbiddenException,
            );
        });

        it('skips authorizers without authorize hook', async () => {
            const withHook = {
                forUser: jest.fn(),
                authorize: jest.fn().mockResolvedValue(true),
            };
            const withoutHook = createAuthorizer();

            setupAuthorizers([withoutHook, withHook]);
            setupPermissions(null, null);
            mockAuthenticator.retrieveUser.mockResolvedValue({ id: 1 });

            const result = await service.authorize(mockContext as any);

            expect(result).toBe(true);
            expect(withHook.authorize).toHaveBeenCalled();
        });

        it('throws ForbiddenException with error message from CASL', async () => {
            const authorizer = createAuthorizer();

            setupAuthorizers([authorizer]);
            setupPermissions(null, [{ action: 'delete', subject: 'Post' }]);
            mockAuthenticator.retrieveUser.mockResolvedValue({ id: 1 });

            try {
                await service.authorize(mockContext as any);
                fail('Expected ForbiddenException');
            } catch (error) {
                expect(error).toBeInstanceOf(ForbiddenException);
            }
        });
    });
});
