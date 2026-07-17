import 'reflect-metadata';
import { AbilityBuilder } from '@casl/ability';
import { createPrismaAbility, prismaQuery } from '@casl/prisma';

import { bigintSafePrismaQuery, createAbility } from './prisma';

const CLIFF = 9007199254740992;
const belowCliff = 9007199254740991n;
const atCliff = 9007199254740992n;
const aboveCliff = 9007199254740993n;

function safeVerdict (conditions: Record<string, unknown>, value: unknown): boolean {
    return bigintSafePrismaQuery(conditions)({ v: value });
}

function defaultVerdict (conditions: Record<string, unknown>, value: unknown): boolean {
    return prismaQuery(conditions)({ v: value });
}

describe('bigintSafePrismaQuery cliff exactness', () => {
    it('resolves equals against 2^53 exactly', () => {
        expect(safeVerdict({ v: { equals: CLIFF } }, belowCliff)).toBe(false);
        expect(safeVerdict({ v: { equals: CLIFF } }, atCliff)).toBe(true);
        expect(safeVerdict({ v: { equals: CLIFF } }, aboveCliff)).toBe(false);
    });

    it('proves the default matcher is wrong for equals at the cliff', () => {
        expect(defaultVerdict({ v: { equals: CLIFF } }, atCliff)).toBe(false);
        expect(safeVerdict({ v: { equals: CLIFF } }, atCliff)).toBe(true);
    });

    it('resolves gt against 2^53 exactly', () => {
        expect(safeVerdict({ v: { gt: CLIFF } }, belowCliff)).toBe(false);
        expect(safeVerdict({ v: { gt: CLIFF } }, atCliff)).toBe(false);
        expect(safeVerdict({ v: { gt: CLIFF } }, aboveCliff)).toBe(true);
    });

    it('resolves lt against 2^53 exactly', () => {
        expect(safeVerdict({ v: { lt: CLIFF } }, belowCliff)).toBe(true);
        expect(safeVerdict({ v: { lt: CLIFF } }, atCliff)).toBe(false);
        expect(safeVerdict({ v: { lt: CLIFF } }, aboveCliff)).toBe(false);
    });

    it('resolves gte against 2^53 exactly and beats the default at the boundary', () => {
        expect(safeVerdict({ v: { gte: CLIFF } }, belowCliff)).toBe(false);
        expect(safeVerdict({ v: { gte: CLIFF } }, atCliff)).toBe(true);
        expect(safeVerdict({ v: { gte: CLIFF } }, aboveCliff)).toBe(true);
        expect(defaultVerdict({ v: { gte: CLIFF } }, atCliff)).toBe(false);
    });

    it('resolves lte against 2^53 exactly', () => {
        expect(safeVerdict({ v: { lte: CLIFF } }, belowCliff)).toBe(true);
        expect(safeVerdict({ v: { lte: CLIFF } }, atCliff)).toBe(true);
        expect(safeVerdict({ v: { lte: CLIFF } }, aboveCliff)).toBe(false);
    });

    it('resolves in against 2^53 exactly and beats the default', () => {
        expect(safeVerdict({ v: { in: [CLIFF] } }, belowCliff)).toBe(false);
        expect(safeVerdict({ v: { in: [CLIFF] } }, atCliff)).toBe(true);
        expect(safeVerdict({ v: { in: [CLIFF] } }, aboveCliff)).toBe(false);
        expect(defaultVerdict({ v: { in: [CLIFF] } }, atCliff)).toBe(false);
    });

    it('resolves not against 2^53 exactly and beats the default', () => {
        expect(safeVerdict({ v: { not: CLIFF } }, belowCliff)).toBe(true);
        expect(safeVerdict({ v: { not: CLIFF } }, atCliff)).toBe(false);
        expect(safeVerdict({ v: { not: CLIFF } }, aboveCliff)).toBe(true);
        expect(defaultVerdict({ v: { not: CLIFF } }, atCliff)).toBe(true);
    });

    it('fails closed when comparing a bigint rule value against a NaN subject', () => {
        expect(safeVerdict({ v: { equals: 100n } }, NaN)).toBe(false);
    });
});

describe('bigintSafePrismaQuery parity with prismaQuery for non-bigint conditions', () => {
    const cases: { name: string, conditions: Record<string, unknown>, subjects: Record<string, unknown>[] }[] = [
        { name: 'equals number', conditions: { age: { equals: 30 } }, subjects: [{ age: 30 }, { age: 31 }] },
        { name: 'not number', conditions: { age: { not: 30 } }, subjects: [{ age: 30 }, { age: 31 }] },
        { name: 'in numbers', conditions: { age: { in: [10, 20, 30] } }, subjects: [{ age: 20 }, { age: 25 }] },
        { name: 'notIn numbers', conditions: { age: { notIn: [1, 2, 3] } }, subjects: [{ age: 2 }, { age: 9 }] },
        { name: 'lt number', conditions: { age: { lt: 40 } }, subjects: [{ age: 39 }, { age: 40 }] },
        { name: 'lte number', conditions: { age: { lte: 30 } }, subjects: [{ age: 30 }, { age: 31 }] },
        { name: 'gt number', conditions: { age: { gt: 20 } }, subjects: [{ age: 21 }, { age: 20 }] },
        { name: 'gte number', conditions: { age: { gte: 30 } }, subjects: [{ age: 30 }, { age: 29 }] },
        { name: 'string equals', conditions: { name: { equals: 'Alice' } }, subjects: [{ name: 'Alice' }, { name: 'Bob' }] },
        { name: 'startsWith', conditions: { name: { startsWith: 'Al' } }, subjects: [{ name: 'Alice' }, { name: 'Bob' }] },
        { name: 'endsWith', conditions: { name: { endsWith: 'ce' } }, subjects: [{ name: 'Alice' }, { name: 'Bob' }] },
        { name: 'contains', conditions: { name: { contains: 'lic' } }, subjects: [{ name: 'Alice' }, { name: 'Bob' }] },
        { name: 'insensitive contains', conditions: { name: { contains: 'LIC', mode: 'insensitive' } }, subjects: [{ name: 'Alice' }, { name: 'Bob' }] },
        { name: 'insensitive startsWith', conditions: { name: { startsWith: 'al', mode: 'insensitive' } }, subjects: [{ name: 'Alice' }, { name: 'Bob' }] },
        { name: 'insensitive endsWith', conditions: { name: { endsWith: 'CE', mode: 'insensitive' } }, subjects: [{ name: 'Alice' }, { name: 'Bob' }] },
        { name: 'date lt', conditions: { createdAt: { lt: new Date('2025-01-01') } }, subjects: [{ createdAt: new Date('2024-01-01') }, { createdAt: new Date('2026-01-01') }] },
        { name: 'date gte', conditions: { createdAt: { gte: new Date('2020-01-01') } }, subjects: [{ createdAt: new Date('2021-01-01') }, { createdAt: new Date('2019-01-01') }] },
        { name: 'array has', conditions: { tags: { has: 'x' } }, subjects: [{ tags: ['x', 'y'] }, { tags: ['y', 'z'] }] },
        { name: 'array hasSome', conditions: { tags: { hasSome: ['x', 'q'] } }, subjects: [{ tags: ['x', 'y'] }, { tags: ['a', 'b'] }] },
        { name: 'array hasEvery', conditions: { tags: { hasEvery: ['x', 'y'] } }, subjects: [{ tags: ['x', 'y', 'z'] }, { tags: ['x'] }] },
        { name: 'array isEmpty false', conditions: { tags: { isEmpty: false } }, subjects: [{ tags: ['x'] }, { tags: [] }] },
        { name: 'array isEmpty true', conditions: { tags: { isEmpty: true } }, subjects: [{ tags: [] }, { tags: ['x'] }] },
        { name: 'nested AND', conditions: { AND: [{ age: { gt: 10 } }, { name: { startsWith: 'A' } }] }, subjects: [{ age: 20, name: 'Alice' }, { age: 20, name: 'Bob' }] },
        { name: 'nested OR', conditions: { OR: [{ age: { lt: 5 } }, { name: { equals: 'Alice' } }] }, subjects: [{ age: 50, name: 'Alice' }, { age: 50, name: 'Bob' }] },
        { name: 'nested NOT', conditions: { NOT: { archived: { equals: true } } }, subjects: [{ archived: false }, { archived: true }] },
        { name: 'relation is', conditions: { profile: { is: { verified: { equals: true } } } }, subjects: [{ profile: { verified: true } }, { profile: { verified: false } }] },
        { name: 'relation every', conditions: { posts: { every: { published: { equals: true } } } }, subjects: [{ posts: [{ published: true }, { published: true }] }, { posts: [{ published: true }, { published: false }] }] },
        { name: 'relation some', conditions: { posts: { some: { published: { equals: true } } } }, subjects: [{ posts: [{ published: false }, { published: true }] }, { posts: [{ published: false }] }] },
        { name: 'isSet', conditions: { nickname: { isSet: true } }, subjects: [{ nickname: 'Al' }, {}] },
    ];

    it.each(cases)('matches prismaQuery for $name across matching and non-matching subjects', ({ conditions, subjects }) => {
        const safe = bigintSafePrismaQuery(conditions);
        const base = prismaQuery(conditions);

        for (const subject of subjects) {
            expect(safe(subject)).toBe(base(subject));
        }
    });
});

describe('createAbility integration', () => {
    it('honours can rules conditioned on bigint fields exactly at the cliff', () => {
        const { can, build } = new AbilityBuilder(createAbility);

        can('read', 'Account', { balance: { gte: CLIFF } });

        const ability = build();

        expect(ability.can('read', { __caslSubjectType__: 'Account', balance: belowCliff } as never)).toBe(false);
        expect(ability.can('read', { __caslSubjectType__: 'Account', balance: atCliff } as never)).toBe(true);
        expect(ability.can('read', { __caslSubjectType__: 'Account', balance: aboveCliff } as never)).toBe(true);
    });

    it('applies inverted cannot rules exactly at the cliff', () => {
        const { can, cannot, build } = new AbilityBuilder(createAbility);

        can('read', 'Account');
        cannot('read', 'Account', { balance: { equals: atCliff } });

        const ability = build();

        expect(ability.can('read', { __caslSubjectType__: 'Account', balance: belowCliff } as never)).toBe(true);
        expect(ability.can('read', { __caslSubjectType__: 'Account', balance: atCliff } as never)).toBe(false);
        expect(ability.can('read', { __caslSubjectType__: 'Account', balance: aboveCliff } as never)).toBe(true);
    });

    it('honours field-level rules conditioned on bigint fields', () => {
        const { can, build } = new AbilityBuilder(createAbility);

        can('read', 'Account', ['balance'], { balance: { equals: atCliff } });

        const ability = build();

        expect(ability.can('read', { __caslSubjectType__: 'Account', balance: atCliff } as never, 'balance')).toBe(true);
        expect(ability.can('read', { __caslSubjectType__: 'Account', balance: aboveCliff } as never, 'balance')).toBe(false);
    });

    it('is exact where the default prisma ability is wrong at the cliff', () => {
        const safeBuilder = new AbilityBuilder(createAbility);
        const defaultBuilder = new AbilityBuilder(createPrismaAbility);

        safeBuilder.can('read', 'Account', { balance: { equals: CLIFF } });
        defaultBuilder.can('read', 'Account', { balance: { equals: CLIFF } } as never);

        const safeAbility = safeBuilder.build();
        const defaultAbility = defaultBuilder.build();

        const subject = { __caslSubjectType__: 'Account', balance: atCliff } as never;

        expect(safeAbility.can('read', subject)).toBe(true);
        expect(defaultAbility.can('read', subject)).toBe(false);
    });
});

describe('bigintSafePrismaQuery bigint rule values', () => {
    it('accepts a bigint equals rule value and resolves it exactly', () => {
        const matcher = bigintSafePrismaQuery({ v: { equals: atCliff } });

        expect(matcher({ v: atCliff })).toBe(true);
        expect(matcher({ v: CLIFF })).toBe(true);
        expect(matcher({ v: aboveCliff })).toBe(false);
    });

    it('rejects a bigint relational rule value because @casl/prisma parses the value', () => {
        expect(() => bigintSafePrismaQuery({ v: { gte: 100n } })).toThrow();
        expect(() => prismaQuery({ v: { gte: 100n } })).toThrow();
    });

    it('fails closed for a bigint rule value against a non-numeric field, matching the default', () => {
        expect(safeVerdict({ v: { equals: 123n } }, '123')).toBe(false);
        expect(safeVerdict({ v: { equals: 123n } }, '123')).toBe(defaultVerdict({ v: { equals: 123n } }, '123'));

        expect(safeVerdict({ v: { equals: 100n } }, 'abc')).toBe(false);
        expect(safeVerdict({ v: { equals: 100n } }, 'abc')).toBe(defaultVerdict({ v: { equals: 100n } }, 'abc'));

        expect(safeVerdict({ v: { in: [100n] } }, '100')).toBe(false);
        expect(safeVerdict({ v: { in: [100n] } }, '100')).toBe(defaultVerdict({ v: { in: [100n] } }, '100'));
    });

    it('keeps the genuine number and bigint cliff behaviour under the numeric gate', () => {
        expect(safeVerdict({ v: { equals: CLIFF } }, atCliff)).toBe(true);
        expect(safeVerdict({ v: { equals: CLIFF } }, aboveCliff)).toBe(false);
        expect(safeVerdict({ v: { in: [CLIFF] } }, atCliff)).toBe(true);
    });
});
