import type { Context } from '@eleven-am/pondsocket-nest';
import { Ability, type AbilityOptions, type AbilityTuple, type ConditionsMatcher, fieldPatternMatcher, ForbiddenError, type MatchConditions, type RawRuleFrom } from '@casl/ability';
import { accessibleBy, prismaQuery } from '@casl/prisma';
import { and, compare as baseCompare, createJsInterpreter, eq, gt, gte, type JsInterpretationOptions, type JsInterpreter, lt, lte, ne, or, within } from '@ucast/js';
import { ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';

import { AuthorizationContext } from './authorization/authorization.context';
import { AuthorizationService } from './authorization/authorization.service';

@Injectable()
export class PrismaAuthorizationService {
    constructor (private readonly authorizationService: AuthorizationService) {}

    async authorize (action: string, model: string, context: ExecutionContext | Context | AuthorizationContext): Promise<void> {
        const ability = await this.authorizationService.getAbility(context);

        try {
            ForbiddenError.from(ability).throwUnlessCan(action, model);
        } catch (error) {
            throw new ForbiddenException(
                error instanceof Error ? error.message : 'Forbidden',
            );
        }
    }

    async constrain<TWhere = Record<string, unknown>> (action: string, model: string, context: ExecutionContext | Context | AuthorizationContext): Promise<TWhere> {
        await this.authorize(action, model, context);

        const ability = await this.authorizationService.getAbility(context);

        return accessibleBy(ability as Parameters<typeof accessibleBy>[0], action).ofType(model as never) as TWhere;
    }
}

const isNaNValue = (value: unknown): boolean => typeof value === 'number' && Number.isNaN(value);

const unwrap = (value: unknown): unknown => (typeof value === 'object' && value !== null ? (value as { valueOf (): unknown }).valueOf() : value);

const isNumeric = (value: unknown): boolean => typeof value === 'number' || typeof value === 'bigint';

const bigintSafeCompare = (left: unknown, right: unknown): number => {
    const a = unwrap(left);
    const b = unwrap(right);

    if ((typeof a === 'bigint' || typeof b === 'bigint') && isNumeric(a) && isNumeric(b)) {
        if (isNaNValue(a) || isNaNValue(b)) {
            return NaN;
        }

        const x = a as number;
        const y = b as number;

        if (x < y) {
            return -1;
        }

        if (x > y) {
            return 1;
        }

        return 0;
    }

    return baseCompare(a, b);
};

const listIncludes = (list: unknown[], value: unknown): boolean => {
    if (list.includes(value)) {
        return true;
    }

    return list.some((element) => {
        const a = unwrap(element);
        const b = unwrap(value);

        return isNumeric(a) && isNumeric(b) && bigintSafeCompare(element, value) === 0;
    });
};

const operators: Record<string, JsInterpreter<any>> = {
    equals: eq,
    notEquals: ne,
    in: within,
    lt,
    lte,
    gt,
    gte,
    startsWith: (condition, object, { get }) => get(object, condition.field).startsWith(condition.value),
    istartsWith: (condition, object, { get }) => get(object, condition.field).toLowerCase().startsWith(condition.value.toLowerCase()),
    endsWith: (condition, object, { get }) => get(object, condition.field).endsWith(condition.value),
    iendsWith: (condition, object, { get }) => get(object, condition.field).toLowerCase().endsWith(condition.value.toLowerCase()),
    contains: (condition, object, { get }) => get(object, condition.field).includes(condition.value),
    icontains: (condition, object, { get }) => get(object, condition.field).toLowerCase().includes(condition.value.toLowerCase()),
    isEmpty: (condition, object, { get }) => {
        const value = get(object, condition.field);

        return (Array.isArray(value) && value.length === 0) === condition.value;
    },
    has: (condition, object, { get }) => {
        const value = get(object, condition.field);

        return Array.isArray(value) && listIncludes(value, condition.value);
    },
    hasSome: (condition, object, { get }) => {
        const value = get(object, condition.field);

        return Array.isArray(value) && condition.value.some((item: unknown) => listIncludes(value, item));
    },
    hasEvery: (condition, object, { get }) => {
        const value = get(object, condition.field);

        return Array.isArray(value) && condition.value.every((item: unknown) => listIncludes(value, item));
    },
    and,
    or,
    AND: and,
    OR: or,
    NOT: (condition, object, { interpret }) => condition.value.every((child: any) => !interpret(child, object)),
    every: (condition, object, { get, interpret }) => {
        const value = get(object, condition.field);

        return Array.isArray(value) && value.every((item: unknown) => interpret(condition.value, item));
    },
    some: (condition, object, { get, interpret }) => {
        const value = get(object, condition.field);

        return Array.isArray(value) && value.some((item: unknown) => interpret(condition.value, item));
    },
    is: (condition, object, { get, interpret }) => {
        const value = get(object, condition.field);

        return value && typeof value === 'object' && interpret(condition.value, value);
    },
    isSet: (condition, object, { get }) => get(object, condition.field) !== undefined,
};

const interpret = createJsInterpreter(operators, {
    get: (object: any, field: any) => object[field],
    compare: bigintSafeCompare as unknown as JsInterpretationOptions['compare'],
}) as (condition: ReturnType<typeof prismaQuery>['ast'], object: unknown) => boolean;

export const bigintSafePrismaQuery = (conditions: Record<string, unknown>): MatchConditions => {
    const { ast } = prismaQuery(conditions);
    const matcher = (object: unknown): boolean => interpret(ast, object);

    Object.defineProperty(matcher, 'ast', { value: ast });

    return matcher as unknown as MatchConditions;
};

export function createAbility<A extends AbilityTuple = [string, string], C = Record<string, unknown>> (rules: RawRuleFrom<A, C>[] = [], options: AbilityOptions<A, C> = {}): Ability<A, C> {
    return new Ability<A, C>(rules, {
        ...options,
        conditionsMatcher: bigintSafePrismaQuery as unknown as ConditionsMatcher<C>,
        fieldMatcher: fieldPatternMatcher,
    });
}
