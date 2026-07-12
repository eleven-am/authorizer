import { httpAdapter } from './http.adapter';

describe('httpAdapter', () => {
    function createContext (request: Record<string, any> | null) {
        return {
            getClass: jest.fn().mockReturnValue(class TestController {}),
            getHandler: jest.fn().mockReturnValue(() => {}),
            switchToHttp: jest.fn().mockReturnValue({
                getRequest: jest.fn().mockReturnValue(request),
            }),
        } as any;
    }

    describe('matches', () => {
        it('matches contexts with switchToHttp', () => {
            expect(httpAdapter.matches(createContext({}))).toBe(true);
        });

        it('rejects socket-shaped contexts', () => {
            expect(httpAdapter.matches({ getClass: jest.fn(),
                getHandler: jest.fn(),
                addData: jest.fn(),
                getData: jest.fn() })).toBe(false);
        });

        it('rejects null and empty objects', () => {
            expect(httpAdapter.matches(null)).toBe(false);
            expect(httpAdapter.matches({})).toBe(false);
        });
    });

    describe('create', () => {
        it('exposes the http type', () => {
            expect(httpAdapter.create(createContext({})).type).toBe('http');
        });

        it('delegates getClass and getHandler', () => {
            const context = createContext({});
            const transport = httpAdapter.create(context);

            transport.getClass();
            transport.getHandler();

            expect(context.getClass).toHaveBeenCalled();
            expect(context.getHandler).toHaveBeenCalled();
        });

        it('stores and retrieves data on the request', () => {
            const request: Record<string, any> = {};
            const transport = httpAdapter.create(createContext(request));

            transport.setData('key', { value: 42 });

            expect(request['key']).toEqual({ value: 42 });
            expect(transport.getData('key')).toEqual({ value: 42 });
        });

        it('returns null for missing data', () => {
            const transport = httpAdapter.create(createContext({}));

            expect(transport.getData('missing')).toBeNull();
        });

        it('returns falsy values stored on the request', () => {
            const request: Record<string, any> = { flag: false, count: 0, empty: '' };
            const transport = httpAdapter.create(createContext(request));

            expect(transport.getData('flag')).toBe(false);
            expect(transport.getData('count')).toBe(0);
            expect(transport.getData('empty')).toBe('');
        });

        it('returns falsy values from internal storage when there is no request', () => {
            const transport = httpAdapter.create(createContext(null));

            transport.setData('flag', false);

            expect(transport.getData('flag')).toBe(false);
        });

        it('falls back to internal storage when there is no request', () => {
            const transport = httpAdapter.create(createContext(null));

            transport.setData('key', 42);

            expect(transport.getData('key')).toBe(42);
        });

        it('returns the request from getRequestLike', () => {
            const request = { user: { id: 1 } };

            expect(httpAdapter.create(createContext(request)).getRequestLike()).toBe(request);
        });

        it('returns null from getRequestLike when there is no request', () => {
            expect(httpAdapter.create(createContext(null)).getRequestLike()).toBeNull();
        });
    });
});
