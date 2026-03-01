import { ForbiddenError } from '@casl/ability';
import {
    Injectable,
    OnModuleInit,
    ExecutionContext,
    ForbiddenException,
    UnauthorizedException,
    Inject,
} from '@nestjs/common';
import { DiscoveryService, Reflector } from '@nestjs/core';

import { AUTHORIZER_KEY, CAN_PERFORM_KEY, ABILITY_KEY, AUTHENTICATION_BACKEND } from './authorization.constants';
import { WillAuthorize, Permission, Authenticator, ResolvedAbility, ResolvedUser } from './authorization.contracts';

@Injectable()
export class AuthorizationService implements OnModuleInit {
    private authorizers: WillAuthorize[] = [];

    constructor (
        private readonly discoveryService: DiscoveryService,
        private readonly reflector: Reflector,
        @Inject(AUTHENTICATION_BACKEND) private readonly authenticator: Authenticator,
    ) {}

    onModuleInit () {
        const providers = this.discoveryService.getProviders();

        this.authorizers = providers
            .filter(({ metatype }) => metatype && this.reflector.get(AUTHORIZER_KEY, metatype))
            .filter(({ instance }) => instance)
            .map(({ instance }) => instance as WillAuthorize);
    }

    async authorize (context: ExecutionContext): Promise<boolean> {
        const permissions = this.getPermissions(context);
        const user = await this.authenticator.retrieveUser(context);

        if (user) {
            const ability = await this.buildAbility(user);

            this.checkPermissions(ability, permissions);
            this.storeAbility(context, ability);

            return true;
        }

        if (permissions.length > 0) {
            throw new UnauthorizedException('Authentication required');
        }

        return true;
    }

    private getPermissions (context: ExecutionContext): Permission[] {
        const classPermissions = this.reflector.get<Permission[]>(CAN_PERFORM_KEY, context.getClass()) ?? [];
        const handlerPermissions = this.reflector.get<Permission[]>(CAN_PERFORM_KEY, context.getHandler()) ?? [];

        return [...classPermissions, ...handlerPermissions];
    }

    private async buildAbility (user: ResolvedUser): Promise<ResolvedAbility> {
        const builder = this.authenticator.abilityFactory();

        for (const authorizer of this.authorizers) {
            await authorizer.forUser(user, builder);
        }

        return builder.build() as ResolvedAbility;
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

    private storeAbility (context: ExecutionContext, ability: ResolvedAbility): void {
        const request = context.switchToHttp().getRequest();

        request[ABILITY_KEY] = ability;
    }
}
