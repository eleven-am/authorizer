import { TransportAdapter } from './transport.contracts';
import { registerTransportAdapter, resolveTransport } from './transport.registry';

function createHttpContext () {
    return {
        getClass: jest.fn(),
        getHandler: jest.fn(),
        switchToHttp: jest.fn().mockReturnValue({
            getRequest: jest.fn().mockReturnValue({}),
        }),
    } as any;
}

function createGraphQLContext () {
    return {
        getClass: jest.fn(),
        getHandler: jest.fn(),
        getType: jest.fn().mockReturnValue('graphql'),
        getArgs: jest.fn().mockReturnValue([{}, {}, { req: {} }, {}]),
        switchToHttp: jest.fn().mockReturnValue({
            getRequest: jest.fn().mockReturnValue({}),
        }),
    } as any;
}

function createSocketContext () {
    return {
        getClass: jest.fn(),
        getHandler: jest.fn(),
        addData: jest.fn(),
        getData: jest.fn(),
    } as any;
}

describe('transport registry', () => {
    it('resolves the http adapter for contexts with switchToHttp', () => {
        const transport = resolveTransport(createHttpContext());

        expect(transport.type).toBe('http');
    });

    it('resolves the graphql adapter before http when getType returns graphql', () => {
        const transport = resolveTransport(createGraphQLContext());

        expect(transport.type).toBe('graphql');
    });

    it('resolves the http adapter for execution contexts typed http', () => {
        const context = createHttpContext();

        context.getType = jest.fn().mockReturnValue('http');

        const transport = resolveTransport(context);

        expect(transport.type).toBe('http');
    });

    it('resolves the pondsocket adapter for socket-shaped contexts', () => {
        const transport = resolveTransport(createSocketContext());

        expect(transport.type).toBe('pondsocket');
    });

    it('throws when no adapter matches', () => {
        expect(() => resolveTransport({})).toThrow('No transport adapter matched the provided context');
        expect(() => resolveTransport(null)).toThrow('No transport adapter matched the provided context');
    });

    describe('registerTransportAdapter', () => {
        const customTransport = {
            type: 'custom',
            getClass: jest.fn(),
            getHandler: jest.fn(),
            getData: jest.fn(),
            setData: jest.fn(),
            getRequestLike: jest.fn(),
        };

        it('appends adapters that are consulted after built-ins', () => {
            const adapter: TransportAdapter = {
                type: 'custom',
                matches: (context: unknown) => Boolean(context) && (context as any).__custom === true,
                create: () => customTransport,
            };

            registerTransportAdapter(adapter);

            expect(resolveTransport(createHttpContext()).type).toBe('http');
            expect(resolveTransport({ __custom: true }).type).toBe('custom');
        });

        it('prepends adapters that take precedence over built-ins', () => {
            const adapter: TransportAdapter = {
                type: 'custom-first',
                matches: (context: unknown) => Boolean(context) && (context as any).__customFirst === true,
                create: () => ({ ...customTransport,
                    type: 'custom-first' }),
            };

            registerTransportAdapter(adapter, { prepend: true });

            const context = createHttpContext();

            context.__customFirst = true;

            expect(resolveTransport(context).type).toBe('custom-first');
        });
    });
});
