import { MongoAbility } from '@casl/ability';

import { ActionsOf, SubjectsOf, ResolvedActions, ResolvedSubjects } from './authorization.contracts';

type Expect<T extends true> = T;
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;

type TestAbility = MongoAbility<['read' | 'update', 'Post' | 'Comment']>;

type Cases = [
    Expect<Equal<ActionsOf<TestAbility>, 'read' | 'update'>>,
    Expect<Equal<SubjectsOf<TestAbility>, 'Post' | 'Comment'>>,
    Expect<Equal<ActionsOf<MongoAbility>, string>>,
];

describe('typed permission helpers', () => {
    it('narrows actions and subjects to the ability unions', () => {
        const action: ActionsOf<TestAbility> = 'read';
        const subject: SubjectsOf<TestAbility> = 'Post';
        const cases: Cases = [true, true, true];

        expect(action).toBe('read');
        expect(subject).toBe('Post');
        expect(cases).toHaveLength(3);
    });

    it('accepts arbitrary strings when no ability is registered', () => {
        const action: ResolvedActions = 'anything';
        const subject: ResolvedSubjects = 'Whatever';

        expect(action).toBe('anything');
        expect(subject).toBe('Whatever');
    });
});
