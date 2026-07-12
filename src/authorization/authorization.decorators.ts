import {
    createParamDecorator as nestCreateParamDecorator,
    ExecutionContext,
    SetMetadata,
    applyDecorators,
    Injectable,
    UnauthorizedException,
} from '@nestjs/common';

import { ABILITY_CONTEXT_KEY, USER_CONTEXT_KEY, SUBJECTS_CONTEXT_KEY, AUTHORIZER_KEY, AUTHORIZER_SUBJECT_KEY, CAN_PERFORM_KEY, PUBLIC_KEY } from './authorization.constants';
import { AuthorizationContext } from './authorization.context';
import { AuthorizerSubject, Permission, ResolvedAbility, ResolvedUser } from './authorization.contracts';

export type ContextMapper<T> = (context: AuthorizationContext) => T;

export interface CurrentDataOptions {
    optional?: boolean;
}

let socketDecoratorFactory: ((cb: any) => any) | null = null;

try {
    socketDecoratorFactory = require('@eleven-am/pondsocket-nest').createParamDecorator;
} catch {
    socketDecoratorFactory = null;
}

function applyBoth (nest: ParameterDecorator, ws: ParameterDecorator | null): ParameterDecorator {
    return (target, propertyKey, parameterIndex) => {
        nest(target, propertyKey, parameterIndex);

        if (ws) {
            ws(target, propertyKey, parameterIndex);
        }
    };
}

export function createParamDecorator<T> (mapper: ContextMapper<T>) {
    const http = nestCreateParamDecorator(
        (_data: void, ctx: ExecutionContext) => mapper(new AuthorizationContext(ctx)),
    );

    const ws = socketDecoratorFactory
        ? socketDecoratorFactory(
            (_data: void, ctx: unknown) => mapper(new AuthorizationContext(ctx as any)),
        )
        : null;

    return (): ParameterDecorator => applyBoth(http(), ws ? ws() : null);
}

export function Authorizer (subject?: AuthorizerSubject) {
    const decorators = [SetMetadata(AUTHORIZER_KEY, true), Injectable()];

    if (subject) {
        decorators.push(SetMetadata(AUTHORIZER_SUBJECT_KEY, subject));
    }

    return applyDecorators(...decorators);
}

export function CanPerform (...permissions: Permission[]) {
    return (target: any, _key?: string | symbol, descriptor?: PropertyDescriptor): any => {
        const metadataTarget = descriptor ? descriptor.value : target;
        const existing = (Reflect.getOwnMetadata(CAN_PERFORM_KEY, metadataTarget) as Permission[] | undefined) ?? [];

        Reflect.defineMetadata(CAN_PERFORM_KEY, [...existing, ...permissions], metadataTarget);

        return descriptor ?? target;
    };
}

export function Public () {
    return SetMetadata(PUBLIC_KEY, true);
}

function createContextDataDecorator<T> (key: string, message: string) {
    const extract = (context: AuthorizationContext, options?: CurrentDataOptions): T | null => {
        const value = context.getData<T>(key);

        if (!value && !options?.optional) {
            throw new UnauthorizedException(message);
        }

        return value;
    };

    const http = nestCreateParamDecorator(
        (options: CurrentDataOptions | undefined, ctx: ExecutionContext) => extract(new AuthorizationContext(ctx), options),
    );

    const ws = socketDecoratorFactory
        ? socketDecoratorFactory(
            (options: CurrentDataOptions | undefined, ctx: unknown) => extract(new AuthorizationContext(ctx as any), options),
        )
        : null;

    return (options?: CurrentDataOptions): ParameterDecorator => applyBoth(http(options), ws ? ws(options) : null);
}

export const CurrentAbility = createContextDataDecorator<ResolvedAbility>(ABILITY_CONTEXT_KEY, 'No ability found');

export const CurrentUser = createContextDataDecorator<ResolvedUser>(USER_CONTEXT_KEY, 'No user found');

function extractSubject (context: AuthorizationContext, name?: string): unknown {
    const subjects = context.getData<Record<string, unknown>>(SUBJECTS_CONTEXT_KEY) ?? {};

    if (name) {
        if (!(name in subjects)) {
            throw new Error(`No resolved subject "${name}" on this request`);
        }

        return subjects[name];
    }

    const names = Object.keys(subjects);

    if (names.length !== 1) {
        throw new Error(`CurrentSubject requires exactly one resolved subject, found ${names.length}`);
    }

    return subjects[names[0]];
}

const currentSubjectHttp = nestCreateParamDecorator(
    (name: string | undefined, ctx: ExecutionContext) => extractSubject(new AuthorizationContext(ctx), name),
);

const currentSubjectWs = socketDecoratorFactory
    ? socketDecoratorFactory(
        (name: string | undefined, ctx: unknown) => extractSubject(new AuthorizationContext(ctx as any), name),
    )
    : null;

export const CurrentSubject = (subject?: AuthorizerSubject): ParameterDecorator => applyBoth(
    currentSubjectHttp(subject),
    currentSubjectWs ? currentSubjectWs(subject) : null,
);
