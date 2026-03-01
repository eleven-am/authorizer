import { DynamicModule, Provider } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';

import { AUTHENTICATION_BACKEND } from './authorization.constants';
import { Authenticator, AuthorizationAsyncModuleOptions } from './authorization.contracts';
import { AuthorizationService } from './authorization.service';

export class AuthorizationModule {
    static forRoot (authenticator: Authenticator): DynamicModule {
        const provider: Provider = {
            provide: AUTHENTICATION_BACKEND,
            useValue: authenticator,
        };

        return {
            global: true,
            module: AuthorizationModule,
            imports: [DiscoveryModule],
            exports: [AuthorizationService],
            providers: [provider, AuthorizationService],
        };
    }

    static forRootAsync (options: AuthorizationAsyncModuleOptions): DynamicModule {
        const provider: Provider = {
            provide: AUTHENTICATION_BACKEND,
            inject: options.inject,
            useFactory: options.useFactory,
        };

        return {
            global: true,
            module: AuthorizationModule,
            imports: [DiscoveryModule, ...(options.imports || [])],
            exports: [AuthorizationService],
            providers: [provider, AuthorizationService],
        };
    }
}
