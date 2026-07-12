import type { Context } from '@eleven-am/pondsocket-nest';
import { ForbiddenError, subject as caslSubject } from '@casl/ability';
import {
    Injectable,
    OnModuleInit,
    ForbiddenException,
    NotFoundException,
    UnauthorizedException,
    Inject,
    Optional,
    ExecutionContext,
} from '@nestjs/common';
import { DiscoveryService, Reflector } from '@nestjs/core';

import { AUTHORIZER_KEY, AUTHORIZER_SUBJECT_KEY, CAN_PERFORM_KEY, PUBLIC_KEY, ABILITY_CONTEXT_KEY, USER_CONTEXT_KEY, SUBJECTS_CONTEXT_KEY, AUTHENTICATION_BACKEND, AUTHORIZATION_OPTIONS } from './authorization.constants';
import { AuthorizationContext } from './authorization.context';
import { WillAuthorize, Permission, Authenticator, AuthorizationModuleOptions, ResolvedAbility, ResolvedUser } from './authorization.contracts';

@Injectable()
export class AuthorizationService implements OnModuleInit {
    private authorizers: WillAuthorize[] = [];

    private subjectResolvers = new Map<string, WillAuthorize>();

    constructor (
        private readonly discoveryService: DiscoveryService,
        private readonly reflector: Reflector,
        @Inject(AUTHENTICATION_BACKEND) private readonly authenticator: Authenticator,
        @Optional() @Inject(AUTHORIZATION_OPTIONS) private readonly options?: AuthorizationModuleOptions,
    ) {}

    onModuleInit () {
        const providers = this.discoveryService.getProviders();

        const wrappers = providers
            .filter(({ instance }) => instance)
            .filter(({ metatype, instance }) => this.isAuthorizer(metatype) || this.isAuthorizer(instance.constructor));

        this.authorizers = wrappers.map(({ instance }) => instance as WillAuthorize);
        this.subjectResolvers = new Map();

        for (const { metatype, instance } of wrappers) {
            const authorizer = instance as WillAuthorize;
            const subjectName = this.getSubjectScope(metatype) ?? this.getSubjectScope(instance.constructor);

            if (!subjectName || !authorizer.resolveSubject) {
                continue;
            }

            if (this.subjectResolvers.has(subjectName)) {
                throw new Error(`Multiple authorizers declare resolveSubject for the subject "${subjectName}"`);
            }

            this.subjectResolvers.set(subjectName, authorizer);
        }
    }

    async authorize (context: ExecutionContext | Context): Promise<boolean> {
        const authContext = new AuthorizationContext(context);
        const permissions = this.getPermissions(authContext);
        const isOpen = permissions.length === 0 && (this.isPublic(authContext) || this.options?.defaultPolicy === 'public');
        const ability = await this.resolveAbilityForRoute(authContext, isOpen);

        if (ability) {
            this.checkPermissions(ability, permissions);
            await this.resolveSubjects(authContext, ability, permissions);
            await this.runAuthorizeHooks(authContext, ability, permissions);

            return true;
        }

        if (isOpen) {
            return true;
        }

        throw new UnauthorizedException('Authentication required');
    }

    async getAbility (context: ExecutionContext | Context | AuthorizationContext): Promise<ResolvedAbility> {
        const authContext = context instanceof AuthorizationContext ? context : new AuthorizationContext(context);
        const ability = await this.resolveAbility(authContext);

        if (!ability) {
            throw new UnauthorizedException('Authentication required');
        }

        return ability;
    }

    private async resolveAbility (authContext: AuthorizationContext): Promise<ResolvedAbility | null> {
        const cached = authContext.getData<ResolvedAbility>(ABILITY_CONTEXT_KEY);

        if (cached) {
            return cached;
        }

        const user = await this.authenticator.retrieveUser(authContext);

        if (!user) {
            return null;
        }

        const ability = await this.buildAbility(user);

        authContext.addData(USER_CONTEXT_KEY, user);
        authContext.addData(ABILITY_CONTEXT_KEY, ability);

        return ability;
    }

    private async resolveAbilityForRoute (authContext: AuthorizationContext, tolerateFailure: boolean): Promise<ResolvedAbility | null> {
        if (!tolerateFailure) {
            return this.resolveAbility(authContext);
        }

        try {
            return await this.resolveAbility(authContext);
        } catch {
            return null;
        }
    }

    private isAuthorizer (target: unknown): boolean {
        return Boolean(target && this.reflector.get(AUTHORIZER_KEY, target as any));
    }

    private getSubjectScope (target: unknown): string | null {
        if (!target) {
            return null;
        }

        return this.reflector.get<string>(AUTHORIZER_SUBJECT_KEY, target as any) ?? null;
    }

    private async resolveSubjects (context: AuthorizationContext, ability: ResolvedAbility, permissions: Permission[]): Promise<void> {
        const names = [...new Set(
            permissions
                .map((permission) => permission.subject as string)
                .filter((name) => this.subjectResolvers.has(name)),
        )];

        if (names.length === 0) {
            return;
        }

        const entries = await Promise.all(names.map(async (name) => {
            const entity = await this.subjectResolvers.get(name)?.resolveSubject?.(context);

            return [name, entity ?? null] as const;
        }));

        const resolved: Record<string, unknown> = {};

        for (const [name, entity] of entries) {
            if (entity === null) {
                throw new NotFoundException(`${name} not found`);
            }

            resolved[name] = entity;
        }

        for (const permission of permissions) {
            const entity = resolved[permission.subject as string];

            if (!entity) {
                continue;
            }

            try {
                ForbiddenError.from(ability).throwUnlessCan(
                    permission.action,
                    caslSubject(permission.subject as string, entity as object),
                    permission.field,
                );
            } catch (error) {
                throw new ForbiddenException(
                    error instanceof Error ? error.message : 'Forbidden',
                );
            }
        }

        context.addData(SUBJECTS_CONTEXT_KEY, resolved);
    }

    private isPublic (context: AuthorizationContext): boolean {
        return Boolean(
            this.reflector.get<boolean>(PUBLIC_KEY, context.getHandler()) ??
            this.reflector.get<boolean>(PUBLIC_KEY, context.getClass()),
        );
    }

    private getPermissions (context: AuthorizationContext): Permission[] {
        const handlerPermissions = this.reflector.get<Permission[]>(CAN_PERFORM_KEY, context.getHandler()) ?? [];

        if (this.reflector.get<boolean>(PUBLIC_KEY, context.getHandler())) {
            return handlerPermissions;
        }

        const classPermissions = this.reflector.get<Permission[]>(CAN_PERFORM_KEY, context.getClass()) ?? [];

        return [...classPermissions, ...handlerPermissions];
    }

    private async buildAbility (user: ResolvedUser): Promise<ResolvedAbility> {
        const builder = this.authenticator.abilityFactory();

        for (const authorizer of this.authorizers) {
            await authorizer.forUser(user, builder);
        }

        return builder.build() as ResolvedAbility;
    }

    private async runAuthorizeHooks (context: AuthorizationContext, ability: ResolvedAbility, permissions: Permission[]): Promise<void> {
        for (const authorizer of this.authorizers) {
            if (authorizer.authorize) {
                const allowed = await authorizer.authorize(context, ability, permissions);

                if (!allowed) {
                    throw new ForbiddenException('Authorization denied by authorizer');
                }
            }
        }
    }

    private checkPermissions (ability: ResolvedAbility, permissions: Permission[]): void {
        for (const permission of permissions) {
            try {
                ForbiddenError.from(ability).throwUnlessCan(
                    permission.action,
                    permission.subject,
                    permission.field,
                );
            } catch (error) {
                throw new ForbiddenException(
                    error instanceof Error ? error.message : 'Forbidden',
                );
            }
        }
    }
}
