import 'reflect-metadata';

import { AuthorizationGuard } from './authorization.guards';

describe('AuthorizationGuard', () => {
    let guard: AuthorizationGuard;
    let mockService: { authorize: jest.Mock };

    beforeEach(() => {
        mockService = { authorize: jest.fn() };
        guard = new AuthorizationGuard(mockService as any);
    });

    it('delegates to authorizationService.authorize', async () => {
        const mockContext = {} as any;

        mockService.authorize.mockResolvedValue(true);

        const result = await guard.canActivate(mockContext);

        expect(result).toBe(true);
        expect(mockService.authorize).toHaveBeenCalledWith(mockContext);
    });

    it('propagates resolved value', async () => {
        mockService.authorize.mockResolvedValue(false);

        const result = await guard.canActivate({} as any);

        expect(result).toBe(false);
    });

    it('propagates rejections', async () => {
        const error = new Error('unauthorized');

        mockService.authorize.mockRejectedValue(error);

        await expect(guard.canActivate({} as any)).rejects.toThrow('unauthorized');
    });
});
