import {
    createParamDecorator as nestCreateParamDecorator,
    ExecutionContext,
    SetMetadata,
    applyDecorators,
    Injectable,
    UnauthorizedException,
} from '@nestjs/common';

import { ABILITY_CONTEXT_KEY, USER_CONTEXT_KEY, AUTHORIZER_KEY, CAN_PERFORM_KEY } from './authorization.constants';
import { AuthorizationContext } from './authorization.context';
import { Permission, ResolvedAbility, ResolvedUser } from './authorization.contracts';

export type ContextMapper<T> = (context: AuthorizationContext) => T;

let socketDecoratorFactory: ((cb: any) => any) | null = null;

try {
    socketDecoratorFactory = require('@eleven-am/pondsocket-nest').createParamDecorator;
} catch {}

export function createParamDecorator<T> (mapper: ContextMapper<T>) {
    const http = nestCreateParamDecorator(
        (_data: void, ctx: ExecutionContext) => mapper(new AuthorizationContext(ctx)),
    );

    const ws = socketDecoratorFactory
        ? socketDecoratorFactory(
            (_data: void, ctx: unknown) => mapper(new AuthorizationContext(ctx as any)),
        )
        : () => {
            throw new Error('@eleven-am/pondsocket-nest must be installed to use WS decorators');
        };

    return { WS: ws, HTTP: http };
}

export function Authorizer () {
    return applyDecorators(SetMetadata(AUTHORIZER_KEY, true), Injectable());
}

export function CanPerform (...permissions: Permission[]) {
    return SetMetadata(CAN_PERFORM_KEY, permissions);
}

export const CurrentAbility = createParamDecorator(
    (ctx: AuthorizationContext): ResolvedAbility => {
        const ability = ctx.getData<ResolvedAbility>(ABILITY_CONTEXT_KEY);

        if (!ability) {
            throw new UnauthorizedException('No ability found');
        }

        return ability;
    },
);

export const CurrentUser = createParamDecorator(
    (ctx: AuthorizationContext): ResolvedUser => {
        const user = ctx.getData<ResolvedUser>(USER_CONTEXT_KEY);

        if (!user) {
            throw new UnauthorizedException('No user found');
        }

        return user;
    },
);
