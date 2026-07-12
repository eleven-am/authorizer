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
    registerTransportAdapter,
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
        expect(registerTransportAdapter).toBeInstanceOf(Function);
        expect(CurrentAbility).toBeInstanceOf(Function);
        expect(CurrentUser).toBeInstanceOf(Function);
    });
});
