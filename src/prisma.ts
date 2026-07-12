import type { Context } from '@eleven-am/pondsocket-nest';
import { ForbiddenError } from '@casl/ability';
import { accessibleBy } from '@casl/prisma';
import { ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';

import { AuthorizationContext } from './authorization/authorization.context';
import { AuthorizationService } from './authorization/authorization.service';

@Injectable()
export class PrismaAuthorizationService {
    constructor (private readonly authorizationService: AuthorizationService) {}

    async authorize (action: string, model: string, context: ExecutionContext | Context | AuthorizationContext): Promise<void> {
        const ability = await this.authorizationService.getAbility(context);

        try {
            ForbiddenError.from(ability).throwUnlessCan(action, model);
        } catch (error) {
            throw new ForbiddenException(
                error instanceof Error ? error.message : 'Forbidden',
            );
        }
    }

    async constrain<TWhere = Record<string, unknown>> (action: string, model: string, context: ExecutionContext | Context | AuthorizationContext): Promise<TWhere> {
        await this.authorize(action, model, context);

        const ability = await this.authorizationService.getAbility(context);

        return accessibleBy(ability as Parameters<typeof accessibleBy>[0], action).ofType(model as never) as TWhere;
    }
}
