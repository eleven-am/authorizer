import { ExecutionContext } from '@nestjs/common';

import { AuthorizationContext, AuthorizationService, PondSocketContextLike } from './index';

export declare class PrismaAuthorizationService {
    constructor (authorizationService: AuthorizationService);

    authorize (action: string, model: string, context: ExecutionContext | PondSocketContextLike | AuthorizationContext): Promise<void>;

    constrain<TWhere = Record<string, unknown>> (action: string, model: string, context: ExecutionContext | PondSocketContextLike | AuthorizationContext): Promise<TWhere>;
}
