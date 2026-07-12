import { graphqlAdapter } from './graphql.adapter';

describe('graphqlAdapter', () => {
    function createContext (gqlContext: Record<string, any> | null) {
        return {
            getClass: jest.fn().mockReturnValue(class TestResolver {}),
            getHandler: jest.fn().mockReturnValue(() => {}),
            getType: jest.fn().mockReturnValue('graphql'),
            getArgs: jest.fn().mockReturnValue([{}, {}, gqlContext, {}]),
            switchToHttp: jest.fn().mockReturnValue({
                getRequest: jest.fn().mockReturnValue({}),
            }),
        } as any;
    }

    describe('matches', () => {
        it('matches execution contexts typed graphql', () => {
            expect(graphqlAdapter.matches(createContext({}))).toBe(true);
        });

        it('rejects execution contexts typed http', () => {
            const context = createContext({});

            context.getType = jest.fn().mockReturnValue('http');

            expect(graphqlAdapter.matches(context)).toBe(false);
        });

        it('rejects contexts without getType', () => {
            expect(graphqlAdapter.matches({ switchToHttp: jest.fn() })).toBe(false);
            expect(graphqlAdapter.matches(null)).toBe(false);
        });
    });

    describe('create', () => {
        it('exposes the graphql type', () => {
            expect(graphqlAdapter.create(createContext({ req: {} })).type).toBe('graphql');
        });

        it('delegates getClass and getHandler', () => {
            const context = createContext({ req: {} });
            const transport = graphqlAdapter.create(context);

            transport.getClass();
            transport.getHandler();

            expect(context.getClass).toHaveBeenCalled();
            expect(context.getHandler).toHaveBeenCalled();
        });

        it('stores and retrieves data on the request from the graphql context', () => {
            const request: Record<string, any> = {};
            const transport = graphqlAdapter.create(createContext({ req: request }));

            transport.setData('key', { value: 42 });

            expect(request['key']).toEqual({ value: 42 });
            expect(transport.getData('key')).toEqual({ value: 42 });
        });

        it('supports contexts exposing the request as request', () => {
            const request: Record<string, any> = {};
            const transport = graphqlAdapter.create(createContext({ request }));

            transport.setData('key', 42);

            expect(request['key']).toBe(42);
            expect(transport.getRequestLike()).toBe(request);
        });

        it('stores data on the graphql context when there is no request', () => {
            const gqlContext: Record<string, any> = {};
            const transport = graphqlAdapter.create(createContext(gqlContext));

            transport.setData('key', 42);

            expect(gqlContext['key']).toBe(42);
            expect(transport.getData('key')).toBe(42);
        });

        it('falls back to internal storage when there is no graphql context', () => {
            const transport = graphqlAdapter.create(createContext(null));

            transport.setData('key', 42);

            expect(transport.getData('key')).toBe(42);
        });

        it('returns null for missing data', () => {
            expect(graphqlAdapter.create(createContext({ req: {} })).getData('missing')).toBeNull();
        });

        it('returns falsy values stored on the request', () => {
            const transport = graphqlAdapter.create(createContext({ req: { flag: false, count: 0 } }));

            expect(transport.getData('flag')).toBe(false);
            expect(transport.getData('count')).toBe(0);
        });

        it('returns the request from getRequestLike', () => {
            const request = { user: { id: 1 } };

            expect(graphqlAdapter.create(createContext({ req: request })).getRequestLike()).toBe(request);
        });

        it('returns null from getRequestLike when there is no request', () => {
            expect(graphqlAdapter.create(createContext({})).getRequestLike()).toBeNull();
            expect(graphqlAdapter.create(createContext(null)).getRequestLike()).toBeNull();
        });
    });
});
