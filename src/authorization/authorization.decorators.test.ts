import 'reflect-metadata';
import { ROUTE_ARGS_METADATA, INJECTABLE_WATERMARK } from '@nestjs/common/constants';

import { ABILITY_CONTEXT_KEY, USER_CONTEXT_KEY, AUTHORIZER_KEY, CAN_PERFORM_KEY } from './authorization.constants';
import { Authorizer, CanPerform, CurrentAbility, CurrentUser, createParamDecorator } from './authorization.decorators';

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

    it('supports permissions with field property', () => {
        class TestController {
            @CanPerform({ action: 'read', subject: 'Post', field: 'title' })
            handler () {}
        }

        const metadata = Reflect.getMetadata(CAN_PERFORM_KEY, TestController.prototype.handler);

        expect(metadata).toEqual([{ action: 'read', subject: 'Post', field: 'title' }]);
    });
});

describe('CurrentAbility.HTTP', () => {
    function extractFactory () {
        class TestController {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            handler (@CurrentAbility.HTTP() _ability: unknown) {}
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

describe('CurrentUser.HTTP', () => {
    function extractFactory () {
        class TestController {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            handler (@CurrentUser.HTTP() _user: unknown) {}
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
});

describe('createParamDecorator', () => {
    it('returns an object with HTTP and WS properties', () => {
        const decorator = createParamDecorator((ctx) => ctx.isHttp);

        expect(decorator).toHaveProperty('HTTP');
        expect(decorator).toHaveProperty('WS');
    });

    it('HTTP decorator invokes mapper with AuthorizationContext', () => {
        const mapper = jest.fn().mockReturnValue('result');
        const decorator = createParamDecorator(mapper);

        class TestController {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            handler (@decorator.HTTP() _val: unknown) {}
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
