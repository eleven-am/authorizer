import { Injectable } from '@nestjs/common';
import { Context, CanActivate, createParamDecorator } from '@eleven-am/pondsocket-nest';

import { ABILITY_CONTEXT_KEY } from './authorization/authorization.constants';
import { ResolvedAbility } from './authorization/authorization.contracts';
import { AuthorizationService } from './authorization/authorization.service';

@Injectable()
export class AuthorizationSocketGuard implements CanActivate {
    constructor (private readonly authorizationService: AuthorizationService) {}

    canActivate (context: Context): Promise<boolean> {
        return this.authorizationService.authorize(context);
    }
}

export const CurrentSocketAbility = createParamDecorator(
    (_data: void, context: Context): ResolvedAbility => {
        const ability = context.getData(ABILITY_CONTEXT_KEY);

        if (!ability) {
            throw new Error('No ability found on context. Ensure AuthorizationSocketGuard is applied.');
        }

        return ability as ResolvedAbility;
    },
);
