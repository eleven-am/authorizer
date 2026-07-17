import { Abilities, AnyAbility, AbilityBuilder, Generics, Normalize } from '@casl/ability';

import { AuthorizationContext } from './authorization.context';

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
    abilityFactory?(): AbilityBuilder<ResolvedAbility>;
}

export interface AuthorizationAsyncModuleOptions {
    imports?: any[];
    inject?: any[];
    defaultPolicy?: DefaultPolicy;
    useFactory: (...args: any[]) => Promise<Authenticator> | Authenticator;
}
