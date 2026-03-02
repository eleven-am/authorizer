import 'reflect-metadata';
import { AbilityBuilder, createMongoAbility } from '@casl/ability';

import { ABILITY_CONTEXT_KEY, USER_CONTEXT_KEY } from './authorization/authorization.constants';
import { AuthorizationContext } from './authorization/authorization.context';
import { AuthorizationService } from './authorization/authorization.service';
import { AuthorizationSocketGuard } from './pondsocket';

describe('AuthorizationSocketGuard', () => {
    let guard: AuthorizationSocketGuard;
    let mockService: { authorize: jest.Mock };

    beforeEach(() => {
        mockService = { authorize: jest.fn() };
        guard = new AuthorizationSocketGuard(mockService as any);
    });

    it('delegates to authorizationService.authorize', async () => {
        const mockContext = {} as any;

        mockService.authorize.mockResolvedValue(true);

        const result = await guard.canActivate(mockContext);

        expect(result).toBe(true);
        expect(mockService.authorize).toHaveBeenCalledWith(mockContext);
    });

    it('propagates rejections', async () => {
        const error = new Error('forbidden');

        mockService.authorize.mockRejectedValue(error);

        await expect(guard.canActivate({} as any)).rejects.toThrow('forbidden');
    });
});

describe('AuthorizationService with PondSocket context', () => {
    let service: AuthorizationService;
    let mockDiscovery: { getProviders: jest.Mock };
    let mockReflector: { get: jest.Mock };
    let mockAuthenticator: { retrieveUser: jest.Mock; abilityFactory: jest.Mock };

    beforeEach(() => {
        mockDiscovery = { getProviders: jest.fn().mockReturnValue([]) };
        mockReflector = { get: jest.fn().mockReturnValue(null) };
        mockAuthenticator = {
            retrieveUser: jest.fn(),
            abilityFactory: jest.fn(() => new AbilityBuilder(createMongoAbility)),
        };

        service = new AuthorizationService(
            mockDiscovery as any,
            mockReflector as any,
            mockAuthenticator as any,
        );

        service.onModuleInit();
    });

    it('stores ability via addData for PondSocket context', async () => {
        const contextData: Record<string, unknown> = {};
        const mockContext = {
            getClass: jest.fn().mockReturnValue(class {}),
            getHandler: jest.fn().mockReturnValue(() => {}),
            addData: jest.fn((key: string, value: unknown) => {
                contextData[key] = value;
            }),
            getData: jest.fn((key: string) => contextData[key] ?? null),
        };

        mockAuthenticator.retrieveUser.mockResolvedValue({ id: 1 });

        await service.authorize(mockContext as any);

        expect(mockContext.addData).toHaveBeenCalledWith(
            ABILITY_CONTEXT_KEY,
            expect.anything(),
        );
    });

    it('stores user via addData for PondSocket context', async () => {
        const user = { id: 1, name: 'test' };
        const mockContext = {
            getClass: jest.fn().mockReturnValue(class {}),
            getHandler: jest.fn().mockReturnValue(() => {}),
            addData: jest.fn(),
            getData: jest.fn(),
        };

        mockAuthenticator.retrieveUser.mockResolvedValue(user);

        await service.authorize(mockContext as any);

        expect(mockContext.addData).toHaveBeenCalledWith(USER_CONTEXT_KEY, user);
    });

    it('passes AuthorizationContext to retrieveUser', async () => {
        const mockContext = {
            getClass: jest.fn().mockReturnValue(class {}),
            getHandler: jest.fn().mockReturnValue(() => {}),
            addData: jest.fn(),
            getData: jest.fn(),
        };

        mockAuthenticator.retrieveUser.mockResolvedValue({ id: 1 });

        await service.authorize(mockContext as any);

        const receivedArg = mockAuthenticator.retrieveUser.mock.calls[0][0];

        expect(receivedArg).toBeInstanceOf(AuthorizationContext);
        expect(receivedArg.isSocket).toBe(true);
    });

    it('stores ability via request for HTTP context', async () => {
        const mockRequest: Record<string, any> = {};
        const mockContext = {
            getClass: jest.fn().mockReturnValue(class {}),
            getHandler: jest.fn().mockReturnValue(() => {}),
            switchToHttp: jest.fn().mockReturnValue({
                getRequest: jest.fn().mockReturnValue(mockRequest),
            }),
        };

        mockAuthenticator.retrieveUser.mockResolvedValue({ id: 1 });

        await service.authorize(mockContext as any);

        expect(mockRequest[ABILITY_CONTEXT_KEY]).toBeDefined();
    });
});
