import { ExecutionContext } from '@nestjs/common';
import { Ability, AbilityOptions, AbilityTuple, MatchConditions, RawRuleFrom } from '@casl/ability';

import { AuthorizationContext, AuthorizationService, PondSocketContextLike } from './index';

export declare class PrismaAuthorizationService {
    constructor (authorizationService: AuthorizationService);

    authorize (action: string, model: string, context: ExecutionContext | PondSocketContextLike | AuthorizationContext): Promise<void>;

    constrain<TWhere = Record<string, unknown>> (action: string, model: string, context: ExecutionContext | PondSocketContextLike | AuthorizationContext): Promise<TWhere>;
}

export declare function bigintSafePrismaQuery (conditions: Record<string, unknown>): MatchConditions;

export declare function createBigIntSafePrismaAbility<A extends AbilityTuple = [string, string], C = Record<string, unknown>> (rules?: RawRuleFrom<A, C>[], options?: AbilityOptions<A, C>): Ability<A, C>;
