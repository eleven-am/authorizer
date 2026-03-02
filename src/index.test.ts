import 'reflect-metadata';

import {
    AuthorizationModule,
    AuthorizationService,
    AuthorizationGuard,
    AuthorizationContext,
    Authorizer,
    CanPerform,
    CurrentAbility,
    CurrentUser,
    createParamDecorator,
} from './index';

describe('Public API exports', () => {
    it('exports all runtime symbols', () => {
        expect(AuthorizationModule).toBeDefined();
        expect(AuthorizationService).toBeDefined();
        expect(AuthorizationGuard).toBeDefined();
        expect(AuthorizationContext).toBeDefined();
        expect(Authorizer).toBeInstanceOf(Function);
        expect(CanPerform).toBeInstanceOf(Function);
        expect(createParamDecorator).toBeInstanceOf(Function);
        expect(CurrentAbility).toHaveProperty('HTTP');
        expect(CurrentAbility).toHaveProperty('WS');
        expect(CurrentUser).toHaveProperty('HTTP');
        expect(CurrentUser).toHaveProperty('WS');
    });
});
