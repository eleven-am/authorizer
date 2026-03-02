import { AnyAbility, AbilityBuilder } from '@casl/ability';
import { Context } from '@eleven-am/pondsocket-nest';
import { ExecutionContext, DynamicModule, CanActivate } from '@nestjs/common';

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface Register {}

export type ResolvedUser = Register extends { user: infer T } ? T : unknown;

export type ResolvedAbility = Register extends { ability: infer T } ? T : AnyAbility;

export declare class AuthorizationContext {
    constructor (context: ExecutionContext | Context);

    get isSocket (): boolean;

    get isHttp (): boolean;

    getHttpContext (): ExecutionContext;

    getSocketContext (): Context;

    getClass (): any;

    getHandler (): any;

    addData<T> (key: string, data: T): void;

    getData<T> (key: string): T | null;
}

export interface Permission {
    action: string;
    subject: string;
    field?: string;
}

export interface WillAuthorize {
    forUser(user: ResolvedUser, builder: AbilityBuilder<ResolvedAbility>): void | Promise<void>;
    authorize?(context: AuthorizationContext, ability: ResolvedAbility, permissions: Permission[]): boolean | Promise<boolean>;
}

export interface Authenticator {
    retrieveUser(context: AuthorizationContext): Promise<ResolvedUser | null>;
    abilityFactory(): AbilityBuilder<ResolvedAbility>;
}

export interface AuthorizationAsyncModuleOptions {
    imports?: any[];
    inject?: any[];
    useFactory: (...args: any[]) => Promise<Authenticator> | Authenticator;
}

export type ContextMapper<T> = (context: AuthorizationContext) => T;

export declare function createParamDecorator<T> (mapper: ContextMapper<T>): {
    WS: () => ParameterDecorator;
    HTTP: () => ParameterDecorator;
};

export declare function CanPerform (...permissions: Permission[]): ClassDecorator & MethodDecorator;

export declare function Authorizer (): ClassDecorator;

export declare const CurrentAbility: {
    WS: () => ParameterDecorator;
    HTTP: () => ParameterDecorator;
};

export declare const CurrentUser: {
    WS: () => ParameterDecorator;
    HTTP: () => ParameterDecorator;
};

export declare class AuthorizationModule {
    static forRoot (authenticator: Authenticator): DynamicModule;

    static forRootAsync (options: AuthorizationAsyncModuleOptions): DynamicModule;
}

export declare class AuthorizationService {
    authorize (context: ExecutionContext | Context): Promise<boolean>;
}

export declare class AuthorizationGuard implements CanActivate {
    canActivate (context: ExecutionContext): Promise<boolean>;
}
