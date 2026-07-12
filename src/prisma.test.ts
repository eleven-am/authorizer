import 'reflect-metadata';
import { AbilityBuilder } from '@casl/ability';
import { createPrismaAbility } from '@casl/prisma';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { AuthorizationContext } from './authorization/authorization.context';
import { WillAuthorize } from './authorization/authorization.contracts';
import { Authorizer } from './authorization/authorization.decorators';
import { AuthorizationService } from './authorization/authorization.service';
import { PrismaAuthorizationService } from './prisma';

@Authorizer()
class PostAuthorizer implements WillAuthorize {
    forUser (user: any, builder: AbilityBuilder<any>) {
        builder.can('read', 'Post', { authorId: user.id });
        builder.can('manage', 'Comment');
    }
}

describe('PrismaAuthorizationService', () => {
    let service: PrismaAuthorizationService;
    let mockAuthenticator: { retrieveUser: jest.Mock, abilityFactory: jest.Mock };
    let mockRequest: Record<string | symbol, any>;

    function createContext () {
        return {
            getClass: () => class TestResolver {},
            getHandler: () => () => {},
            switchToHttp: () => ({
                getRequest: () => mockRequest,
            }),
        } as any;
    }

    beforeEach(() => {
        const mockDiscovery = {
            getProviders: jest.fn().mockReturnValue([
                { metatype: PostAuthorizer, instance: new PostAuthorizer() },
            ]),
        };

        mockAuthenticator = {
            retrieveUser: jest.fn().mockResolvedValue({ id: 1 }),
            abilityFactory: jest.fn(() => new AbilityBuilder(createPrismaAbility)),
        };

        mockRequest = {};

        const authorizationService = new AuthorizationService(
            mockDiscovery as any,
            new Reflector(),
            mockAuthenticator as any,
        );

        authorizationService.onModuleInit();

        service = new PrismaAuthorizationService(authorizationService);
    });

    describe('constrain', () => {
        it('returns the where clause for conditional rules', async () => {
            const where = await service.constrain('read', 'Post', createContext());

            expect(where).toEqual({ OR: [{ authorId: 1 }] });
        });

        it('returns a match-all clause for unconditional rules', async () => {
            const where = await service.constrain('read', 'Comment', createContext());

            expect(where).toEqual({});
        });

        it('throws ForbiddenException when the action is not allowed at all', async () => {
            await expect(service.constrain('delete', 'Post', createContext())).rejects.toThrow(
                ForbiddenException,
            );
        });

        it('translates cannot rules into negated conditions', async () => {
            const authorizationService = new AuthorizationService(
                { getProviders: jest.fn().mockReturnValue([]) } as any,
                new Reflector(),
                {
                    retrieveUser: jest.fn().mockResolvedValue({ id: 1 }),
                    abilityFactory: jest.fn(() => {
                        const builder = new AbilityBuilder<any>(createPrismaAbility);

                        builder.can('read', 'Post');
                        builder.cannot('read', 'Post', { archived: true });

                        return builder;
                    }),
                } as any,
            );

            authorizationService.onModuleInit();

            const isolatedService = new PrismaAuthorizationService(authorizationService);
            const where = await isolatedService.constrain('read', 'Post', createContext());

            expect(where).toEqual({ AND: [{ NOT: { archived: true } }] });
        });

        it('throws UnauthorizedException when there is no user', async () => {
            mockAuthenticator.retrieveUser.mockResolvedValue(null);

            await expect(service.constrain('read', 'Post', createContext())).rejects.toThrow(
                UnauthorizedException,
            );
        });
    });

    describe('authorize', () => {
        it('resolves when the action is allowed', async () => {
            await expect(service.authorize('read', 'Post', createContext())).resolves.toBeUndefined();
        });

        it('throws ForbiddenException when the action is denied', async () => {
            await expect(service.authorize('delete', 'Post', createContext())).rejects.toThrow(
                ForbiddenException,
            );
        });

        it('throws UnauthorizedException when there is no user', async () => {
            mockAuthenticator.retrieveUser.mockResolvedValue(null);

            await expect(service.authorize('read', 'Post', createContext())).rejects.toThrow(
                UnauthorizedException,
            );
        });
    });

    it('resolves the user once across authorize and constrain on the same request', async () => {
        await service.authorize('read', 'Post', createContext());

        const where = await service.constrain('read', 'Post', createContext());

        expect(where).toEqual({ OR: [{ authorId: 1 }] });
        expect(mockAuthenticator.retrieveUser).toHaveBeenCalledTimes(1);
    });

    it('accepts an AuthorizationContext instance', async () => {
        const authContext = new AuthorizationContext(createContext());
        const where = await service.constrain('read', 'Post', authContext);

        expect(where).toEqual({ OR: [{ authorId: 1 }] });
    });
});
