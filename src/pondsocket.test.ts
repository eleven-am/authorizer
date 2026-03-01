import 'reflect-metadata';
import { AbilityBuilder, createMongoAbility } from '@casl/ability';

import { ABILITY_CONTEXT_KEY, ABILITY_KEY } from './authorization/authorization.constants';
import { AuthorizationService } from './authorization/authorization.service';

jest.mock('@eleven-am/pondsocket-nest', () => ({
    createParamDecorator: (cb: any) => cb,
}));

import { AuthorizationSocketGuard, CurrentSocketAbility } from './pondsocket';

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

describe('CurrentSocketAbility', () => {
    it('returns ability from context.getData', () => {
        const mockAbility = { can: jest.fn() };
        const mockContext = {
            getData: jest.fn().mockReturnValue(mockAbility),
        };

        const result = (CurrentSocketAbility as any)(undefined, mockContext);

        expect(result).toBe(mockAbility);
        expect(mockContext.getData).toHaveBeenCalledWith(ABILITY_CONTEXT_KEY);
    });

    it('throws Error if ability is missing', () => {
        const mockContext = {
            getData: jest.fn().mockReturnValue(null),
        };

        expect(() => (CurrentSocketAbility as any)(undefined, mockContext))
            .toThrow('No ability found on context. Ensure AuthorizationSocketGuard is applied.');
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

    it('stores ability via switchToHttp for HTTP context', async () => {
        const mockRequest: Record<string | symbol, any> = {};
        const mockContext = {
            getClass: jest.fn().mockReturnValue(class {}),
            getHandler: jest.fn().mockReturnValue(() => {}),
            switchToHttp: jest.fn().mockReturnValue({
                getRequest: jest.fn().mockReturnValue(mockRequest),
            }),
        };

        mockAuthenticator.retrieveUser.mockResolvedValue({ id: 1 });

        await service.authorize(mockContext as any);

        expect(mockRequest[ABILITY_KEY]).toBeDefined();
    });
});
