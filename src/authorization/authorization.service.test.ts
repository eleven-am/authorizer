import 'reflect-metadata';
import { ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { AbilityBuilder, createMongoAbility } from '@casl/ability';

import { ABILITY_CONTEXT_KEY, USER_CONTEXT_KEY, SUBJECTS_CONTEXT_KEY, AUTHORIZER_KEY, AUTHORIZER_SUBJECT_KEY, CAN_PERFORM_KEY, PUBLIC_KEY } from './authorization.constants';
import { AuthorizationContext } from './authorization.context';
import { AuthorizationService } from './authorization.service';

describe('AuthorizationService', () => {
    let service: AuthorizationService;
    let mockDiscovery: { getProviders: jest.Mock };
    let mockReflector: { get: jest.Mock };
    let mockAuthenticator: { retrieveUser: jest.Mock, abilityFactory: jest.Mock };
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
            if (key === AUTHORIZER_KEY) {
                return true;
            }

            return null;
        });
        service.onModuleInit();
        mockReflector.get.mockReset();
    }

    function setupPermissions (classPerms: any[] | null, handlerPerms: any[] | null, publicTargets: any[] = []) {
        mockReflector.get.mockImplementation((key: symbol, target: any) => {
            if (key === CAN_PERFORM_KEY && target === testClass) {
                return classPerms;
            }

            if (key === CAN_PERFORM_KEY && target === testHandler) {
                return handlerPerms;
            }

            if (key === PUBLIC_KEY && publicTargets.includes(target)) {
                return true;
            }

            return null;
        });
    }

    function createAuthorizer (grantFn?: (builder: AbilityBuilder<any>) => void) {
        return {
            forUser: jest.fn().mockImplementation((_user: any, builder: any) => {
                if (grantFn) {
                    grantFn(builder);
                }
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

        it('discovers authorizers registered via custom providers through instance.constructor', async () => {
            class CustomAuthorizer {
                forUser = jest.fn();
            }

            const instance = new CustomAuthorizer();

            mockDiscovery.getProviders.mockReturnValue([
                { metatype: null, instance },
            ]);
            mockReflector.get.mockImplementation(
                (key: symbol, target: any) => (key === AUTHORIZER_KEY && target === CustomAuthorizer ? true : null),
            );

            service.onModuleInit();
            mockReflector.get.mockReset();

            setupPermissions(null, null);
            mockAuthenticator.abilityFactory.mockReturnValue(new AbilityBuilder(createMongoAbility));
            mockAuthenticator.retrieveUser.mockResolvedValue({ id: 1 });

            await service.authorize(mockContext as any);

            expect(instance.forUser).toHaveBeenCalled();
        });

        it('excludes providers without authorizer metadata on metatype or constructor', async () => {
            const instance = { forUser: jest.fn() };

            mockDiscovery.getProviders.mockReturnValue([
                { metatype: null, instance },
            ]);
            mockReflector.get.mockReturnValue(null);

            service.onModuleInit();
            mockReflector.get.mockReset();

            setupPermissions(null, null);
            mockAuthenticator.abilityFactory.mockReturnValue(new AbilityBuilder(createMongoAbility));
            mockAuthenticator.retrieveUser.mockResolvedValue({ id: 1 });

            await service.authorize(mockContext as any);

            expect(instance.forUser).not.toHaveBeenCalled();
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

        it('throws UnauthorizedException when no user and route is not public', async () => {
            service.onModuleInit();
            setupPermissions(null, null);
            mockAuthenticator.retrieveUser.mockResolvedValue(null);

            await expect(service.authorize(mockContext as any)).rejects.toThrow(
                UnauthorizedException,
            );
        });

        it('returns true when no user and handler is decorated with Public', async () => {
            service.onModuleInit();
            setupPermissions(null, null, [testHandler]);
            mockAuthenticator.retrieveUser.mockResolvedValue(null);

            const result = await service.authorize(mockContext as any);

            expect(result).toBe(true);
        });

        it('returns true when no user and class is decorated with Public', async () => {
            service.onModuleInit();
            setupPermissions(null, null, [testClass]);
            mockAuthenticator.retrieveUser.mockResolvedValue(null);

            const result = await service.authorize(mockContext as any);

            expect(result).toBe(true);
        });

        it('throws UnauthorizedException when no user on a Public route with permissions', async () => {
            service.onModuleInit();
            setupPermissions(null, [{ action: 'read', subject: 'Post' }], [testHandler]);
            mockAuthenticator.retrieveUser.mockResolvedValue(null);

            await expect(service.authorize(mockContext as any)).rejects.toThrow(
                UnauthorizedException,
            );
        });

        it('returns true when no user and defaultPolicy is public', async () => {
            const permissiveService = new AuthorizationService(
                mockDiscovery as any,
                mockReflector as any,
                mockAuthenticator as any,
                { defaultPolicy: 'public' },
            );

            permissiveService.onModuleInit();
            setupPermissions(null, null);
            mockAuthenticator.retrieveUser.mockResolvedValue(null);

            const result = await permissiveService.authorize(mockContext as any);

            expect(result).toBe(true);
        });

        it('still enforces permissions when defaultPolicy is public', async () => {
            const permissiveService = new AuthorizationService(
                mockDiscovery as any,
                mockReflector as any,
                mockAuthenticator as any,
                { defaultPolicy: 'public' },
            );

            permissiveService.onModuleInit();
            setupPermissions(null, [{ action: 'read', subject: 'Post' }]);
            mockAuthenticator.retrieveUser.mockResolvedValue(null);

            await expect(permissiveService.authorize(mockContext as any)).rejects.toThrow(
                UnauthorizedException,
            );
        });

        it('exempts Public handlers from class-level permissions', async () => {
            service.onModuleInit();
            setupPermissions([{ action: 'read', subject: 'Post' }], null, [testHandler]);
            mockAuthenticator.retrieveUser.mockResolvedValue(null);

            const result = await service.authorize(mockContext as any);

            expect(result).toBe(true);
        });

        it('allows anonymous access to Public routes when retrieveUser throws', async () => {
            service.onModuleInit();
            setupPermissions(null, null, [testHandler]);
            mockAuthenticator.retrieveUser.mockRejectedValue(new Error('bad token'));

            const result = await service.authorize(mockContext as any);

            expect(result).toBe(true);
        });

        it('propagates retrieveUser failures on protected routes', async () => {
            service.onModuleInit();
            setupPermissions(null, null);
            mockAuthenticator.retrieveUser.mockRejectedValue(new Error('bad token'));

            await expect(service.authorize(mockContext as any)).rejects.toThrow('bad token');
        });

        it('checks permissions for authenticated users on Public routes', async () => {
            const authorizer = createAuthorizer((builder) => {
                builder.can('read', 'Post');
            });

            setupAuthorizers([authorizer]);
            setupPermissions(null, [{ action: 'delete', subject: 'Post' }], [testHandler]);
            mockAuthenticator.retrieveUser.mockResolvedValue({ id: 1 });

            await expect(service.authorize(mockContext as any)).rejects.toThrow(
                ForbiddenException,
            );
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
                    (_user: any, builder: any) => {
                        builder.can('read', 'Post');

                        return Promise.resolve();
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

    describe('subject resolution', () => {
        beforeEach(() => {
            mockAuthenticator.abilityFactory.mockReturnValue(
                new AbilityBuilder(createMongoAbility),
            );
            mockAuthenticator.retrieveUser.mockResolvedValue({ id: 1 });
        });

        function setupSubjectAuthorizers (entries: Array<{ instance: any, subject?: string }>) {
            const metatypes = entries.map(() => class {});

            mockDiscovery.getProviders.mockReturnValue(
                entries.map(({ instance }, index) => ({ metatype: metatypes[index], instance })),
            );
            mockReflector.get.mockImplementation((key: symbol, target: any) => {
                const index = metatypes.indexOf(target);

                if (index === -1) {
                    return null;
                }

                if (key === AUTHORIZER_KEY) {
                    return true;
                }

                if (key === AUTHORIZER_SUBJECT_KEY) {
                    return entries[index].subject ?? null;
                }

                return null;
            });
            service.onModuleInit();
            mockReflector.get.mockReset();
        }

        function createScopedAuthorizer (grantFn: (builder: AbilityBuilder<any>) => void, entity: unknown) {
            return {
                forUser: jest.fn().mockImplementation((_user: any, builder: any) => grantFn(builder)),
                resolveSubject: jest.fn().mockResolvedValue(entity),
            };
        }

        it('resolves the subject, checks the instance, and stashes it', async () => {
            const post = { id: 'p1', authorId: 1 };
            const authorizer = createScopedAuthorizer((builder) => {
                builder.can('update', 'Post', { authorId: 1 });
            }, post);

            setupSubjectAuthorizers([{ instance: authorizer, subject: 'Post' }]);
            setupPermissions(null, [{ action: 'update', subject: 'Post' }]);

            const result = await service.authorize(mockContext as any);

            expect(result).toBe(true);
            expect(authorizer.resolveSubject).toHaveBeenCalled();
            expect(mockRequest[SUBJECTS_CONTEXT_KEY]).toEqual({ Post: post });
        });

        it('throws ForbiddenException when the instance check fails', async () => {
            const authorizer = createScopedAuthorizer((builder) => {
                builder.can('update', 'Post', { authorId: 1 });
            }, { id: 'p1', authorId: 99 });

            setupSubjectAuthorizers([{ instance: authorizer, subject: 'Post' }]);
            setupPermissions(null, [{ action: 'update', subject: 'Post' }]);

            await expect(service.authorize(mockContext as any)).rejects.toThrow(ForbiddenException);
        });

        it('throws NotFoundException when the subject resolves to null', async () => {
            const authorizer = createScopedAuthorizer((builder) => {
                builder.can('update', 'Post');
            }, null);

            setupSubjectAuthorizers([{ instance: authorizer, subject: 'Post' }]);
            setupPermissions(null, [{ action: 'update', subject: 'Post' }]);

            await expect(service.authorize(mockContext as any)).rejects.toThrow(NotFoundException);
        });

        it('does not invoke resolvers for subjects not named in permissions', async () => {
            const authorizer = createScopedAuthorizer((builder) => {
                builder.can('read', 'Comment');
            }, { id: 'p1' });

            setupSubjectAuthorizers([{ instance: authorizer, subject: 'Post' }]);
            setupPermissions(null, [{ action: 'read', subject: 'Comment' }]);

            const result = await service.authorize(mockContext as any);

            expect(result).toBe(true);
            expect(authorizer.resolveSubject).not.toHaveBeenCalled();
        });

        it('resolves multiple subjects in one request', async () => {
            const post = { id: 'p1' };
            const comment = { id: 'c1' };
            const postAuthorizer = createScopedAuthorizer((builder) => {
                builder.can('read', 'Post');
            }, post);
            const commentAuthorizer = createScopedAuthorizer((builder) => {
                builder.can('update', 'Comment');
            }, comment);

            setupSubjectAuthorizers([
                { instance: postAuthorizer, subject: 'Post' },
                { instance: commentAuthorizer, subject: 'Comment' },
            ]);
            setupPermissions(null, [
                { action: 'read', subject: 'Post' },
                { action: 'update', subject: 'Comment' },
            ]);

            const result = await service.authorize(mockContext as any);

            expect(result).toBe(true);
            expect(mockRequest[SUBJECTS_CONTEXT_KEY]).toEqual({ Post: post, Comment: comment });
        });

        it('throws at startup when two authorizers resolve the same subject', () => {
            const first = { forUser: jest.fn(), resolveSubject: jest.fn() };
            const second = { forUser: jest.fn(), resolveSubject: jest.fn() };

            expect(() => setupSubjectAuthorizers([
                { instance: first, subject: 'Post' },
                { instance: second, subject: 'Post' },
            ])).toThrow('Multiple authorizers declare resolveSubject for the subject "Post"');
        });

        it('exposes resolved subjects to authorize hooks', async () => {
            const post = { id: 'p1' };
            const seen: unknown[] = [];
            const authorizer = {
                forUser: jest.fn().mockImplementation((_user: any, builder: any) => {
                    builder.can('read', 'Post');
                }),
                resolveSubject: jest.fn().mockResolvedValue(post),
                authorize: jest.fn().mockImplementation((context: any) => {
                    seen.push(context.getData(SUBJECTS_CONTEXT_KEY));

                    return true;
                }),
            };

            setupSubjectAuthorizers([{ instance: authorizer, subject: 'Post' }]);
            setupPermissions(null, [{ action: 'read', subject: 'Post' }]);

            await service.authorize(mockContext as any);

            expect(seen).toEqual([{ Post: post }]);
        });
    });

    describe('getAbility', () => {
        beforeEach(() => {
            mockAuthenticator.abilityFactory.mockReturnValue(
                new AbilityBuilder(createMongoAbility),
            );
        });

        it('builds the ability and stores it with the user on the context', async () => {
            const authorizer = createAuthorizer((builder) => {
                builder.can('read', 'Post');
            });

            setupAuthorizers([authorizer]);
            mockAuthenticator.retrieveUser.mockResolvedValue({ id: 1 });

            const ability = await service.getAbility(mockContext as any);

            expect(ability.can('read', 'Post')).toBe(true);
            expect(mockRequest[ABILITY_CONTEXT_KEY]).toBe(ability);
            expect(mockRequest[USER_CONTEXT_KEY]).toEqual({ id: 1 });
        });

        it('returns the cached ability without retrieving the user again', async () => {
            const authorizer = createAuthorizer((builder) => {
                builder.can('read', 'Post');
            });

            setupAuthorizers([authorizer]);
            mockAuthenticator.retrieveUser.mockResolvedValue({ id: 1 });

            const first = await service.getAbility(mockContext as any);
            const second = await service.getAbility(mockContext as any);

            expect(second).toBe(first);
            expect(mockAuthenticator.retrieveUser).toHaveBeenCalledTimes(1);
        });

        it('reuses the ability stored by authorize', async () => {
            const authorizer = createAuthorizer((builder) => {
                builder.can('read', 'Post');
            });

            setupAuthorizers([authorizer]);
            setupPermissions(null, null);
            mockAuthenticator.retrieveUser.mockResolvedValue({ id: 1 });

            await service.authorize(mockContext as any);

            const ability = await service.getAbility(mockContext as any);

            expect(ability).toBe(mockRequest[ABILITY_CONTEXT_KEY]);
            expect(mockAuthenticator.retrieveUser).toHaveBeenCalledTimes(1);
        });

        it('throws UnauthorizedException when there is no user', async () => {
            service.onModuleInit();
            mockAuthenticator.retrieveUser.mockResolvedValue(null);

            await expect(service.getAbility(mockContext as any)).rejects.toThrow(
                UnauthorizedException,
            );
        });

        it('accepts an AuthorizationContext instance', async () => {
            const authorizer = createAuthorizer((builder) => {
                builder.can('read', 'Post');
            });

            setupAuthorizers([authorizer]);
            mockAuthenticator.retrieveUser.mockResolvedValue({ id: 1 });

            const authContext = new AuthorizationContext(mockContext as any);
            const ability = await service.getAbility(authContext);

            expect(ability.can('read', 'Post')).toBe(true);
        });
    });

    describe('ability factory resolution', () => {
        const CLIFF = 9007199254740992;
        const atCliff = 9007199254740992n;
        const aboveCliff = 9007199254740993n;

        function buildService (authenticator: any) {
            return new AuthorizationService(
                mockDiscovery as any,
                mockReflector as any,
                authenticator as any,
            );
        }

        function registerAuthorizer (svc: AuthorizationService, authorizer: { forUser: jest.Mock }) {
            mockDiscovery.getProviders.mockReturnValue([{ metatype: class {}, instance: authorizer }]);
            mockReflector.get.mockImplementation((key: symbol) => (key === AUTHORIZER_KEY ? true : null));
            svc.onModuleInit();
            mockReflector.get.mockReset();
        }

        it('builds abilities with the safe prisma factory when the authenticator omits abilityFactory', async () => {
            const authenticator = { retrieveUser: jest.fn().mockResolvedValue({ id: 1 }) };
            const svc = buildService(authenticator);
            const authorizer = createAuthorizer((builder) => {
                builder.can('read', 'Account', { balance: { equals: CLIFF } });
            });

            registerAuthorizer(svc, authorizer);

            const ability = await svc.getAbility(mockContext as any);

            expect(ability.can('read', { __caslSubjectType__: 'Account', balance: atCliff } as never)).toBe(true);
            expect(ability.can('read', { __caslSubjectType__: 'Account', balance: aboveCliff } as never)).toBe(false);
        });

        it('builds a fresh ability per request without accumulating rules across users', async () => {
            const authenticator = {
                retrieveUser: jest.fn()
                    .mockResolvedValueOnce({ id: 1 })
                    .mockResolvedValueOnce({ id: 2 }),
            };
            const svc = buildService(authenticator);
            const authorizer = {
                forUser: jest.fn().mockImplementation((user: any, builder: any) => {
                    builder.can('read', 'Account', { ownerId: user.id });
                }),
            };

            registerAuthorizer(svc, authorizer);

            const contextFor = () => ({
                getClass: jest.fn().mockReturnValue(class {}),
                getHandler: jest.fn().mockReturnValue(() => {}),
                switchToHttp: jest.fn().mockReturnValue({
                    getRequest: jest.fn().mockReturnValue({}),
                }),
            });
            const first = await svc.getAbility(contextFor() as any);
            const second = await svc.getAbility(contextFor() as any);

            expect(second).not.toBe(first);
            expect(second.rules).toHaveLength(first.rules.length);
            expect(first.can('read', { __caslSubjectType__: 'Account', ownerId: 1 } as never)).toBe(true);
            expect(second.can('read', { __caslSubjectType__: 'Account', ownerId: 2 } as never)).toBe(true);
            expect(second.can('read', { __caslSubjectType__: 'Account', ownerId: 1 } as never)).toBe(false);
        });

        it('uses the authenticator abilityFactory when it is provided', async () => {
            const factory = jest.fn(() => new AbilityBuilder(createMongoAbility));
            const authenticator = {
                retrieveUser: jest.fn().mockResolvedValue({ id: 1 }),
                abilityFactory: factory,
            };
            const svc = buildService(authenticator);
            const authorizer = createAuthorizer((builder) => {
                builder.can('read', 'Post');
            });

            registerAuthorizer(svc, authorizer);

            const ability = await svc.getAbility(mockContext as any);

            expect(factory).toHaveBeenCalled();
            expect(ability.can('read', 'Post')).toBe(true);
            expect(ability.can('read', 'Comment')).toBe(false);
        });

        it('resolvedAbilityFactory returns the authenticator factory when present', () => {
            const factory = jest.fn(() => new AbilityBuilder(createMongoAbility));
            const authenticator = { retrieveUser: jest.fn(), abilityFactory: factory };
            const svc = buildService(authenticator);

            svc.resolvedAbilityFactory()();

            expect(factory).toHaveBeenCalledTimes(1);
        });

        it('resolvedAbilityFactory falls back to the cached safe default when absent', () => {
            const authenticator = { retrieveUser: jest.fn() };
            const svc = buildService(authenticator);

            const first = svc.resolvedAbilityFactory();
            const second = svc.resolvedAbilityFactory();

            expect(second).toBe(first);

            const { can, build } = first();

            can('read', 'Account', { balance: { equals: CLIFF } });

            const ability = build();

            expect(ability.can('read', { __caslSubjectType__: 'Account', balance: atCliff } as never)).toBe(true);
            expect(ability.can('read', { __caslSubjectType__: 'Account', balance: aboveCliff } as never)).toBe(false);
        });

        it('throws a clear error when the default factory cannot be loaded', () => {
            jest.isolateModules(() => {
                jest.doMock('../prisma', () => {
                    throw new Error('Cannot find module @casl/prisma');
                });

                const { AuthorizationService: IsolatedService } = require('./authorization.service');
                const svc = new IsolatedService(mockDiscovery, mockReflector, { retrieveUser: jest.fn() });

                expect(() => svc.resolvedAbilityFactory()).toThrow('install @casl/prisma');
            });

            jest.dontMock('../prisma');
        });
    });
});
