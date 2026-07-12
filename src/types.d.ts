import { Abilities, AnyAbility, AbilityBuilder, Generics, Normalize } from '@casl/ability';
import { ExecutionContext, DynamicModule, CanActivate } from '@nestjs/common';
import { DiscoveryService, Reflector } from '@nestjs/core';

export interface PondSocketContextLike {
    getClass(): any;
    getHandler(): any;
    addData(key: string, value: unknown): void;
    getData(key: string): unknown;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface Register {}

export type ResolvedUser = Register extends { user: infer T } ? T : unknown;

export type ResolvedAbility = Register extends { ability: infer T } ? T : AnyAbility;

export type AbilitiesOf<TAbility> = TAbility extends AnyAbility ? Generics<TAbility>['abilities'] : Abilities;

export type ActionsOf<TAbility> = Normalize<AbilitiesOf<TAbility>>[0];

export type SubjectsOf<TAbility> = Normalize<AbilitiesOf<TAbility>>[1];

export type ResolvedActions = ActionsOf<ResolvedAbility>;

export type ResolvedSubjects = SubjectsOf<ResolvedAbility>;

export type DefaultPolicy = 'authenticated' | 'public';

export interface AuthorizationModuleOptions {
    defaultPolicy?: DefaultPolicy;
}

export interface TransportContext {
    readonly type: string;
    getClass(): any;
    getHandler(): any;
    getData<T>(key: string): T | null;
    setData<T>(key: string, value: T): void;
    getRequestLike(): unknown;
}

export interface TransportAdapter {
    readonly type: string;
    matches(context: unknown): boolean;
    create(context: unknown): TransportContext;
}

export declare function registerTransportAdapter (adapter: TransportAdapter, options?: { prepend?: boolean }): void;

export declare class AuthorizationContext {
    constructor (context: ExecutionContext | PondSocketContextLike);

    get type (): string;

    get isSocket (): boolean;

    get isHttp (): boolean;

    getHttpContext (): ExecutionContext;

    getSocketContext (): PondSocketContextLike;

    getGraphQLContext (): ExecutionContext;

    getClass (): any;

    getHandler (): any;

    getRequestLike (): unknown;

    addData<T> (key: string, data: T): void;

    getData<T> (key: string): T | null;
}

export interface Permission {
    action: ResolvedActions;
    subject: ResolvedSubjects;
    field?: string;
}

export type AuthorizerSubject = Extract<ResolvedSubjects, string>;

export interface WillAuthorize<TSubject = unknown> {
    forUser(user: ResolvedUser, builder: AbilityBuilder<ResolvedAbility>): void | Promise<void>;
    authorize?(context: AuthorizationContext, ability: ResolvedAbility, permissions: Permission[]): boolean | Promise<boolean>;
    resolveSubject?(context: AuthorizationContext): Promise<TSubject | null> | TSubject | null;
}

export interface Authenticator {
    retrieveUser(context: AuthorizationContext): Promise<ResolvedUser | null>;
    abilityFactory(): AbilityBuilder<ResolvedAbility>;
}

export interface AuthorizationAsyncModuleOptions {
    imports?: any[];
    inject?: any[];
    defaultPolicy?: DefaultPolicy;
    useFactory: (...args: any[]) => Promise<Authenticator> | Authenticator;
}

export type ContextMapper<T> = (context: AuthorizationContext) => T;

export declare function createParamDecorator<T> (mapper: ContextMapper<T>): () => ParameterDecorator;

export declare function CanPerform (...permissions: Permission[]): ClassDecorator & MethodDecorator;

export declare function Public (): ClassDecorator & MethodDecorator;

export declare function Authorizer (subject?: AuthorizerSubject): ClassDecorator;

export interface CurrentDataOptions {
    optional?: boolean;
}

export declare const CurrentAbility: (options?: CurrentDataOptions) => ParameterDecorator;

export declare const CurrentUser: (options?: CurrentDataOptions) => ParameterDecorator;

export declare const CurrentSubject: (subject?: AuthorizerSubject) => ParameterDecorator;

export declare class AuthorizationModule {
    static forRoot (authenticator: Authenticator, options?: AuthorizationModuleOptions): DynamicModule;

    static forRootAsync (options: AuthorizationAsyncModuleOptions): DynamicModule;
}

export declare class AuthorizationService {
    constructor (discoveryService: DiscoveryService, reflector: Reflector, authenticator: Authenticator, options?: AuthorizationModuleOptions);

    authorize (context: ExecutionContext | PondSocketContextLike): Promise<boolean>;

    getAbility (context: ExecutionContext | PondSocketContextLike | AuthorizationContext): Promise<ResolvedAbility>;
}

export declare class AuthorizationGuard implements CanActivate {
    constructor (authorizationService: AuthorizationService);

    canActivate (context: ExecutionContext): Promise<boolean>;
}
