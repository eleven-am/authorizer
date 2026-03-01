import { AnyAbility, AbilityBuilder } from '@casl/ability';

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface Register {}

export type ResolvedUser = Register extends { user: infer T } ? T : unknown;

export type ResolvedAbility = Register extends { ability: infer T } ? T : AnyAbility;

export interface AuthorizableContext {
    getClass(): any;
    getHandler(): any;
}

export interface Permission {
    action: string;
    subject: string;
    field?: string;
}

export interface WillAuthorize {
    forUser(user: ResolvedUser, builder: AbilityBuilder<ResolvedAbility>): void | Promise<void>;
}

export interface Authenticator {
    retrieveUser(context: AuthorizableContext): Promise<ResolvedUser | null>;
    abilityFactory(): AbilityBuilder<ResolvedAbility>;
}

export interface AuthorizationAsyncModuleOptions {
    imports?: any[];
    inject?: any[];
    useFactory: (...args: any[]) => Promise<Authenticator> | Authenticator;
}
