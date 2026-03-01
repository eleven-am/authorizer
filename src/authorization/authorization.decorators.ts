import {
    createParamDecorator,
    ExecutionContext,
    SetMetadata,
    applyDecorators,
    Injectable,
} from '@nestjs/common';

import { ABILITY_KEY, AUTHORIZER_KEY, CAN_PERFORM_KEY } from './authorization.constants';
import { Permission, ResolvedAbility } from './authorization.contracts';

export function Authorizer () {
    return applyDecorators(SetMetadata(AUTHORIZER_KEY, true), Injectable());
}

export function CanPerform (...permissions: Permission[]) {
    return SetMetadata(CAN_PERFORM_KEY, permissions);
}

export const CurrentAbility = createParamDecorator(
    (_data: unknown, ctx: ExecutionContext): ResolvedAbility => {
        const request = ctx.switchToHttp().getRequest();
        const ability = request[ABILITY_KEY];

        if (!ability) {
            throw new Error('No ability found on request. Ensure AuthorizationGuard is applied.');
        }

        return ability as ResolvedAbility;
    },
);
