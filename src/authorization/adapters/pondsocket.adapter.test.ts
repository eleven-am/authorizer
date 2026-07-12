import { pondsocketAdapter } from './pondsocket.adapter';

describe('pondsocketAdapter', () => {
    function createContext () {
        const data: Record<string, unknown> = {};

        return {
            getClass: jest.fn().mockReturnValue(class TestChannel {}),
            getHandler: jest.fn().mockReturnValue(() => {}),
            addData: jest.fn((key: string, value: unknown) => {
                data[key] = value;
            }),
            getData: jest.fn((key: string) => data[key] ?? null),
        } as any;
    }

    describe('matches', () => {
        it('matches socket-shaped contexts', () => {
            expect(pondsocketAdapter.matches(createContext())).toBe(true);
        });

        it('rejects contexts with switchToHttp', () => {
            const context = createContext();

            context.switchToHttp = jest.fn();

            expect(pondsocketAdapter.matches(context)).toBe(false);
        });

        it('rejects contexts missing data accessors', () => {
            expect(pondsocketAdapter.matches({ getClass: jest.fn(),
                getHandler: jest.fn() })).toBe(false);
            expect(pondsocketAdapter.matches(null)).toBe(false);
        });
    });

    describe('create', () => {
        it('exposes the pondsocket type', () => {
            expect(pondsocketAdapter.create(createContext()).type).toBe('pondsocket');
        });

        it('delegates getClass and getHandler', () => {
            const context = createContext();
            const transport = pondsocketAdapter.create(context);

            transport.getClass();
            transport.getHandler();

            expect(context.getClass).toHaveBeenCalled();
            expect(context.getHandler).toHaveBeenCalled();
        });

        it('stores data via addData and retrieves it via getData', () => {
            const context = createContext();
            const transport = pondsocketAdapter.create(context);

            transport.setData('key', { value: 42 });

            expect(context.addData).toHaveBeenCalledWith('key', { value: 42 });
            expect(transport.getData('key')).toEqual({ value: 42 });
        });

        it('returns null for missing data', () => {
            expect(pondsocketAdapter.create(createContext()).getData('missing')).toBeNull();
        });

        it('returns the socket context from getRequestLike', () => {
            const context = createContext();

            expect(pondsocketAdapter.create(context).getRequestLike()).toBe(context);
        });
    });
});
