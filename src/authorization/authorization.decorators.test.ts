import 'reflect-metadata';
import { ROUTE_ARGS_METADATA, INJECTABLE_WATERMARK } from '@nestjs/common/constants';

import { ABILITY_KEY, AUTHORIZER_KEY, CAN_PERFORM_KEY } from './authorization.constants';
import { Authorizer, CanPerform, CurrentAbility } from './authorization.decorators';

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

describe('CurrentAbility', () => {
    function extractFactory () {
        class TestController {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            handler (@CurrentAbility() _ability: unknown) {}
        }

        const metadata = Reflect.getMetadata(ROUTE_ARGS_METADATA, TestController, 'handler');
        const key = Object.keys(metadata)[0];

        return metadata[key].factory;
    }

    it('extracts ability from request', () => {
        const factory = extractFactory();
        const mockAbility = { can: jest.fn() };
        const ctx = {
            switchToHttp: () => ({
                getRequest: () => ({ [ABILITY_KEY]: mockAbility }),
            }),
        };

        expect(factory(undefined, ctx)).toBe(mockAbility);
    });

    it('throws Error if ability is missing from request', () => {
        const factory = extractFactory();
        const ctx = {
            switchToHttp: () => ({
                getRequest: () => ({}),
            }),
        };

        expect(() => factory(undefined, ctx)).toThrow(
            'No ability found on request. Ensure AuthorizationGuard is applied.',
        );
    });
});
