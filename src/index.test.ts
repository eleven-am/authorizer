import 'reflect-metadata';

import {
    AuthorizationModule,
    AuthorizationService,
    AuthorizationGuard,
    Authorizer,
    CanPerform,
    CurrentAbility,
} from './index';

describe('Public API exports', () => {
    it('exports all runtime symbols', () => {
        expect(AuthorizationModule).toBeDefined();
        expect(AuthorizationService).toBeDefined();
        expect(AuthorizationGuard).toBeDefined();
        expect(Authorizer).toBeInstanceOf(Function);
        expect(CanPerform).toBeInstanceOf(Function);
        expect(CurrentAbility).toBeInstanceOf(Function);
    });
});
