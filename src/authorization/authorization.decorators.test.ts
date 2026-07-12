import 'reflect-metadata';
import { ROUTE_ARGS_METADATA, INJECTABLE_WATERMARK } from '@nestjs/common/constants';

import { ABILITY_CONTEXT_KEY, USER_CONTEXT_KEY, SUBJECTS_CONTEXT_KEY, AUTHORIZER_KEY, AUTHORIZER_SUBJECT_KEY, CAN_PERFORM_KEY, PUBLIC_KEY } from './authorization.constants';
import { Authorizer, CanPerform, Public, CurrentAbility, CurrentUser, CurrentSubject, createParamDecorator } from './authorization.decorators';

describe('Authorizer', () => {
    it('sets AUTHORIZER_KEY metadata to true', () => {
        @Authorizer()
        class TestProvider {}

        expect(Reflect.getMetadata(AUTHORIZER_KEY, TestProvider)).toBe(true);
    });

    it('makes the class injectable', () => {
        @Authorizer()
        class TestProvider {}

        expect(Reflect.getMetadata(INJECTABLE_WATERMARK, TestProvider)).toBe(true);
    });

    it('sets AUTHORIZER_SUBJECT_KEY metadata when scoped', () => {
        @Authorizer('Post')
        class TestProvider {}

        expect(Reflect.getMetadata(AUTHORIZER_KEY, TestProvider)).toBe(true);
        expect(Reflect.getMetadata(AUTHORIZER_SUBJECT_KEY, TestProvider)).toBe('Post');
    });

    it('sets no subject metadata without a scope', () => {
        @Authorizer()
        class TestProvider {}

        expect(Reflect.getMetadata(AUTHORIZER_SUBJECT_KEY, TestProvider)).toBeUndefined();
    });
});

describe('CurrentSubject', () => {
    function createFactory (subjectArg?: string) {
        class TestController {
            handler (@CurrentSubject(subjectArg) _subject: unknown) {}
        }

        const metadata = Reflect.getMetadata(ROUTE_ARGS_METADATA, TestController, 'handler');
        const key = Object.keys(metadata)[0];

        return { factory: metadata[key].factory, data: metadata[key].data };
    }

    function contextWith (subjects: Record<string, unknown>) {
        return {
            switchToHttp: () => ({
                getRequest: () => ({ [SUBJECTS_CONTEXT_KEY]: subjects }),
            }),
        };
    }

    it('returns the named resolved subject', () => {
        const { factory, data } = createFactory('Post');
        const post = { id: 'p1' };

        expect(factory(data, contextWith({ Post: post }))).toBe(post);
    });

    it('throws for a missing named subject', () => {
        const { factory, data } = createFactory('Post');

        expect(() => factory(data, contextWith({}))).toThrow('No resolved subject "Post"');
    });

    it('returns the single resolved subject in bare form', () => {
        const { factory, data } = createFactory();
        const comment = { id: 'c1' };

        expect(factory(data, contextWith({ Comment: comment }))).toBe(comment);
    });

    it('throws in bare form when multiple subjects are resolved', () => {
        const { factory, data } = createFactory();

        expect(() => factory(data, contextWith({ Post: {}, Comment: {} }))).toThrow('exactly one resolved subject');
    });

    it('throws in bare form when nothing was resolved', () => {
        const { factory, data } = createFactory();

        expect(() => factory(data, contextWith({}))).toThrow('found 0');
    });
});

describe('Public', () => {
    it('sets PUBLIC_KEY metadata on a handler', () => {
        class TestController {
            @Public()
            handler () {}
        }

        expect(Reflect.getMetadata(PUBLIC_KEY, TestController.prototype.handler)).toBe(true);
    });

    it('sets PUBLIC_KEY metadata on a class', () => {
        @Public()
        class TestController {}

        expect(Reflect.getMetadata(PUBLIC_KEY, TestController)).toBe(true);
    });
});

describe('CanPerform', () => {
    it('sets CAN_PERFORM_KEY metadata with a single permission', () => {
        class TestController {
            @CanPerform({ action: 'read', subject: 'Post' })
            handler () {}
        }

        const metadata = Reflect.getMetadata(CAN_PERFORM_KEY, TestController.prototype.handler);

        expect(metadata).toEqual([{ action: 'read', subject: 'Post' }]);
    });

    it('sets CAN_PERFORM_KEY metadata with multiple permissions', () => {
        class TestController {
            @CanPerform(
                { action: 'read', subject: 'Post' },
                { action: 'create', subject: 'Comment' },
            )
            handler () {}
        }

        const metadata = Reflect.getMetadata(CAN_PERFORM_KEY, TestController.prototype.handler);

        expect(metadata).toEqual([
            { action: 'read', subject: 'Post' },
            { action: 'create', subject: 'Comment' },
        ]);
    });

    it('accumulates permissions across stacked decorators on a handler', () => {
        class TestController {
            @CanPerform({ action: 'read', subject: 'Post' })
            @CanPerform({ action: 'delete', subject: 'Post' })
            handler () {}
        }

        const metadata = Reflect.getMetadata(CAN_PERFORM_KEY, TestController.prototype.handler);

        expect(metadata).toHaveLength(2);
        expect(metadata).toEqual(expect.arrayContaining([
            { action: 'read', subject: 'Post' },
            { action: 'delete', subject: 'Post' },
        ]));
    });

    it('accumulates permissions across stacked decorators on a class', () => {
        @CanPerform({ action: 'read', subject: 'Post' })
        @CanPerform({ action: 'create', subject: 'Comment' })
        class TestController {}

        const metadata = Reflect.getMetadata(CAN_PERFORM_KEY, TestController);

        expect(metadata).toHaveLength(2);
    });

    it('supports permissions with field property', () => {
        class TestController {
            @CanPerform({ action: 'read', subject: 'Post', field: 'title' })
            handler () {}
        }

        const metadata = Reflect.getMetadata(CAN_PERFORM_KEY, TestController.prototype.handler);

        expect(metadata).toEqual([{ action: 'read', subject: 'Post', field: 'title' }]);
    });
});

describe('CurrentAbility', () => {
    function extractFactory () {
        class TestController {
             
            handler (@CurrentAbility() _ability: unknown) {}
        }

        const metadata = Reflect.getMetadata(ROUTE_ARGS_METADATA, TestController, 'handler');
        const key = Object.keys(metadata)[0];

        return metadata[key].factory;
    }

    it('extracts ability from request via AuthorizationContext', () => {
        const factory = extractFactory();
        const mockAbility = { can: jest.fn() };
        const ctx = {
            switchToHttp: () => ({
                getRequest: () => ({ [ABILITY_CONTEXT_KEY]: mockAbility }),
            }),
        };

        expect(factory(undefined, ctx)).toBe(mockAbility);
    });

    it('throws UnauthorizedException if ability is missing', () => {
        const factory = extractFactory();
        const ctx = {
            switchToHttp: () => ({
                getRequest: () => ({}),
            }),
        };

        expect(() => factory(undefined, ctx)).toThrow('No ability found');
    });
});

describe('CurrentUser', () => {
    function extractFactory () {
        class TestController {
             
            handler (@CurrentUser() _user: unknown) {}
        }

        const metadata = Reflect.getMetadata(ROUTE_ARGS_METADATA, TestController, 'handler');
        const key = Object.keys(metadata)[0];

        return metadata[key].factory;
    }

    it('extracts user from request via AuthorizationContext', () => {
        const factory = extractFactory();
        const mockUser = { id: 1, name: 'test' };
        const ctx = {
            switchToHttp: () => ({
                getRequest: () => ({ [USER_CONTEXT_KEY]: mockUser }),
            }),
        };

        expect(factory(undefined, ctx)).toBe(mockUser);
    });

    it('throws UnauthorizedException if user is missing', () => {
        const factory = extractFactory();
        const ctx = {
            switchToHttp: () => ({
                getRequest: () => ({}),
            }),
        };

        expect(() => factory(undefined, ctx)).toThrow('No user found');
    });

    it('returns null for missing user when optional', () => {
        class TestController {
            handler (@CurrentUser({ optional: true }) _user: unknown) {}
        }

        const metadata = Reflect.getMetadata(ROUTE_ARGS_METADATA, TestController, 'handler');
        const key = Object.keys(metadata)[0];
        const ctx = {
            switchToHttp: () => ({
                getRequest: () => ({}),
            }),
        };

        expect(metadata[key].factory(metadata[key].data, ctx)).toBeNull();
    });

    it('returns the user when present and optional', () => {
        class TestController {
            handler (@CurrentUser({ optional: true }) _user: unknown) {}
        }

        const metadata = Reflect.getMetadata(ROUTE_ARGS_METADATA, TestController, 'handler');
        const key = Object.keys(metadata)[0];
        const mockUser = { id: 1 };
        const ctx = {
            switchToHttp: () => ({
                getRequest: () => ({ [USER_CONTEXT_KEY]: mockUser }),
            }),
        };

        expect(metadata[key].factory(metadata[key].data, ctx)).toBe(mockUser);
    });
});

describe('createParamDecorator', () => {
    it('returns a callable decorator factory', () => {
        const decorator = createParamDecorator((ctx) => ctx.isHttp);

        expect(decorator).toBeInstanceOf(Function);
        expect(decorator()).toBeInstanceOf(Function);
    });

    it('invokes the mapper with AuthorizationContext', () => {
        const mapper = jest.fn().mockReturnValue('result');
        const decorator = createParamDecorator(mapper);

        class TestController {
             
            handler (@decorator() _val: unknown) {}
        }

        const metadata = Reflect.getMetadata(ROUTE_ARGS_METADATA, TestController, 'handler');
        const key = Object.keys(metadata)[0];
        const factory = metadata[key].factory;

        const ctx = {
            switchToHttp: () => ({
                getRequest: () => ({}),
            }),
        };

        const result = factory(undefined, ctx);

        expect(result).toBe('result');
        expect(mapper).toHaveBeenCalled();
    });
});

describe('unified param decorators', () => {
    it('registers both Nest and PondSocket parameter metadata', () => {
        class TestController {
            handler (@CurrentUser() _user: unknown) {}
        }

        const nestMeta = Reflect.getMetadata(ROUTE_ARGS_METADATA, TestController, 'handler');
        const prototypeKeys = Reflect.getMetadataKeys(TestController.prototype, 'handler');

        expect(Object.keys(nestMeta)).toHaveLength(1);
        expect(prototypeKeys.some((key: unknown) => String(key) === 'Symbol(NEST_POND-SOCKET_PARAMETERS)')).toBe(true);
    });

    it('registers both systems for CurrentSubject and CurrentAbility', () => {
        class TestController {
            handler (@CurrentSubject('Post') _subject: unknown, @CurrentAbility() _ability: unknown) {}
        }

        const nestMeta = Reflect.getMetadata(ROUTE_ARGS_METADATA, TestController, 'handler');
        const prototypeKeys = Reflect.getMetadataKeys(TestController.prototype, 'handler');

        expect(Object.keys(nestMeta)).toHaveLength(2);
        expect(prototypeKeys.some((key: unknown) => String(key) === 'Symbol(NEST_POND-SOCKET_PARAMETERS)')).toBe(true);
    });
});
