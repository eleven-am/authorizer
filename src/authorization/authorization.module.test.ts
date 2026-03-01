import 'reflect-metadata';
import { DiscoveryModule } from '@nestjs/core';

import { AUTHENTICATION_BACKEND } from './authorization.constants';
import { AuthorizationModule } from './authorization.module';
import { AuthorizationService } from './authorization.service';

describe('AuthorizationModule', () => {
    const mockAuthenticator = {
        retrieveUser: jest.fn(),
        abilityFactory: jest.fn(),
    };

    describe('forRoot', () => {
        it('returns a global DynamicModule', () => {
            const result = AuthorizationModule.forRoot(mockAuthenticator as any);

            expect(result.global).toBe(true);
            expect(result.module).toBe(AuthorizationModule);
        });

        it('imports DiscoveryModule', () => {
            const result = AuthorizationModule.forRoot(mockAuthenticator as any);

            expect(result.imports).toContain(DiscoveryModule);
        });

        it('provides the authenticator as AUTHENTICATION_BACKEND', () => {
            const result = AuthorizationModule.forRoot(mockAuthenticator as any);
            const provider = (result.providers as any[]).find(
                (p: any) => p.provide === AUTHENTICATION_BACKEND,
            );

            expect(provider).toBeDefined();
            expect(provider.useValue).toBe(mockAuthenticator);
        });

        it('provides and exports AuthorizationService', () => {
            const result = AuthorizationModule.forRoot(mockAuthenticator as any);

            expect(result.exports).toContain(AuthorizationService);
            expect(result.providers).toContainEqual(AuthorizationService);
        });
    });

    describe('forRootAsync', () => {
        it('returns a global DynamicModule with factory provider', () => {
            const factory = jest.fn();
            const result = AuthorizationModule.forRootAsync({
                useFactory: factory,
                inject: ['SomeToken'],
            });

            expect(result.global).toBe(true);
            expect(result.module).toBe(AuthorizationModule);

            const provider = (result.providers as any[]).find(
                (p: any) => p.provide === AUTHENTICATION_BACKEND,
            );

            expect(provider.useFactory).toBe(factory);
            expect(provider.inject).toEqual(['SomeToken']);
        });

        it('merges additional imports with DiscoveryModule', () => {
            class SomeModule {}

            const result = AuthorizationModule.forRootAsync({
                useFactory: jest.fn(),
                imports: [SomeModule],
            });

            expect(result.imports).toContain(DiscoveryModule);
            expect(result.imports).toContain(SomeModule);
        });

        it('handles missing imports option', () => {
            const result = AuthorizationModule.forRootAsync({
                useFactory: jest.fn(),
            });

            expect(result.imports).toContain(DiscoveryModule);
            expect(result.imports).toHaveLength(1);
        });

        it('handles missing inject option', () => {
            const result = AuthorizationModule.forRootAsync({
                useFactory: jest.fn(),
            });
            const provider = (result.providers as any[]).find(
                (p: any) => p.provide === AUTHENTICATION_BACKEND,
            );

            expect(provider.inject).toBeUndefined();
        });

        it('provides and exports AuthorizationService', () => {
            const result = AuthorizationModule.forRootAsync({
                useFactory: jest.fn(),
            });

            expect(result.exports).toContain(AuthorizationService);
            expect(result.providers).toContainEqual(AuthorizationService);
        });
    });
});
