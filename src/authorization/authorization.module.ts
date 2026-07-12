import { DynamicModule, Provider } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';

import { AUTHENTICATION_BACKEND, AUTHORIZATION_OPTIONS } from './authorization.constants';
import { Authenticator, AuthorizationAsyncModuleOptions, AuthorizationModuleOptions } from './authorization.contracts';
import { AuthorizationService } from './authorization.service';

export class AuthorizationModule {
    static forRoot (authenticator: Authenticator, options?: AuthorizationModuleOptions): DynamicModule {
        const provider: Provider = {
            provide: AUTHENTICATION_BACKEND,
            useValue: authenticator,
        };

        const optionsProvider: Provider = {
            provide: AUTHORIZATION_OPTIONS,
            useValue: options ?? {},
        };

        return {
            global: true,
            module: AuthorizationModule,
            imports: [DiscoveryModule],
            exports: [AuthorizationService],
            providers: [provider, optionsProvider, AuthorizationService],
        };
    }

    static forRootAsync (options: AuthorizationAsyncModuleOptions): DynamicModule {
        const provider: Provider = {
            provide: AUTHENTICATION_BACKEND,
            inject: options.inject,
            useFactory: options.useFactory,
        };

        const optionsProvider: Provider = {
            provide: AUTHORIZATION_OPTIONS,
            useValue: { defaultPolicy: options.defaultPolicy },
        };

        return {
            global: true,
            module: AuthorizationModule,
            imports: [DiscoveryModule, ...(options.imports || [])],
            exports: [AuthorizationService],
            providers: [provider, optionsProvider, AuthorizationService],
        };
    }
}
