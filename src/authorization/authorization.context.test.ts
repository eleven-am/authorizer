import { AuthorizationContext } from './authorization.context';

describe('AuthorizationContext', () => {
    describe('with HTTP context', () => {
        let mockRequest: Record<string, any>;
        let httpContext: any;
        let context: AuthorizationContext;

        beforeEach(() => {
            mockRequest = { user: { id: 1 } };
            httpContext = {
                getClass: jest.fn().mockReturnValue(class TestController {}),
                getHandler: jest.fn().mockReturnValue(() => {}),
                switchToHttp: jest.fn().mockReturnValue({
                    getRequest: jest.fn().mockReturnValue(mockRequest),
                }),
            };
            context = new AuthorizationContext(httpContext as any);
        });

        it('detects HTTP context', () => {
            expect(context.isHttp).toBe(true);
            expect(context.isSocket).toBe(false);
            expect(context.type).toBe('http');
        });

        it('throws when calling getGraphQLContext on HTTP context', () => {
            expect(() => context.getGraphQLContext()).toThrow('GraphQL context is not available');
        });

        it('returns the request from getRequestLike', () => {
            expect(context.getRequestLike()).toBe(mockRequest);
        });

        it('returns the ExecutionContext from getHttpContext', () => {
            expect(context.getHttpContext()).toBe(httpContext);
        });

        it('throws when calling getSocketContext on HTTP context', () => {
            expect(() => context.getSocketContext()).toThrow('Socket context is not available');
        });

        it('delegates getClass to the underlying context', () => {
            context.getClass();
            expect(httpContext.getClass).toHaveBeenCalled();
        });

        it('delegates getHandler to the underlying context', () => {
            context.getHandler();
            expect(httpContext.getHandler).toHaveBeenCalled();
        });

        it('stores and retrieves data on the HTTP request', () => {
            context.addData('testKey', { value: 42 });

            expect(mockRequest['testKey']).toEqual({ value: 42 });
            expect(context.getData('testKey')).toEqual({ value: 42 });
        });

        it('returns null for missing data', () => {
            expect(context.getData('nonexistent')).toBeNull();
        });
    });

    describe('with socket context', () => {
        let socketData: Record<string, unknown>;
        let socketContext: any;
        let context: AuthorizationContext;

        beforeEach(() => {
            socketData = {};
            socketContext = {
                getClass: jest.fn().mockReturnValue(class TestGateway {}),
                getHandler: jest.fn().mockReturnValue(() => {}),
                addData: jest.fn((key: string, value: unknown) => {
                    socketData[key] = value;
                }),
                getData: jest.fn((key: string) => socketData[key] ?? null),
            };
            context = new AuthorizationContext(socketContext as any);
        });

        it('detects socket context', () => {
            expect(context.isSocket).toBe(true);
            expect(context.isHttp).toBe(false);
            expect(context.type).toBe('pondsocket');
        });

        it('returns the socket context from getSocketContext', () => {
            expect(context.getSocketContext()).toBe(socketContext);
        });

        it('throws when calling getHttpContext on socket context', () => {
            expect(() => context.getHttpContext()).toThrow('HTTP context is not available');
        });

        it('delegates getClass to the underlying context', () => {
            context.getClass();
            expect(socketContext.getClass).toHaveBeenCalled();
        });

        it('delegates getHandler to the underlying context', () => {
            context.getHandler();
            expect(socketContext.getHandler).toHaveBeenCalled();
        });

        it('stores data via addData on socket context', () => {
            context.addData('testKey', { value: 42 });

            expect(socketContext.addData).toHaveBeenCalledWith('testKey', { value: 42 });
        });

        it('retrieves data via getData on socket context', () => {
            socketData['testKey'] = { value: 42 };

            expect(context.getData('testKey')).toEqual({ value: 42 });
            expect(socketContext.getData).toHaveBeenCalledWith('testKey');
        });
    });

    describe('with GraphQL context', () => {
        let mockRequest: Record<string, any>;
        let gqlContext: any;
        let context: AuthorizationContext;

        beforeEach(() => {
            mockRequest = { user: { id: 1 } };
            gqlContext = {
                getClass: jest.fn().mockReturnValue(class TestResolver {}),
                getHandler: jest.fn().mockReturnValue(() => {}),
                getType: jest.fn().mockReturnValue('graphql'),
                getArgs: jest.fn().mockReturnValue([{}, {}, { req: mockRequest }, {}]),
                switchToHttp: jest.fn().mockReturnValue({
                    getRequest: jest.fn().mockReturnValue({}),
                }),
            };
            context = new AuthorizationContext(gqlContext as any);
        });

        it('detects GraphQL context', () => {
            expect(context.type).toBe('graphql');
            expect(context.isHttp).toBe(false);
            expect(context.isSocket).toBe(false);
        });

        it('returns the ExecutionContext from getGraphQLContext', () => {
            expect(context.getGraphQLContext()).toBe(gqlContext);
        });

        it('throws when calling getHttpContext on GraphQL context', () => {
            expect(() => context.getHttpContext()).toThrow('HTTP context is not available');
        });

        it('throws when calling getSocketContext on GraphQL context', () => {
            expect(() => context.getSocketContext()).toThrow('Socket context is not available');
        });

        it('delegates getClass to the underlying context', () => {
            context.getClass();
            expect(gqlContext.getClass).toHaveBeenCalled();
        });

        it('delegates getHandler to the underlying context', () => {
            context.getHandler();
            expect(gqlContext.getHandler).toHaveBeenCalled();
        });

        it('stores and retrieves data on the GraphQL request', () => {
            context.addData('testKey', { value: 42 });

            expect(mockRequest['testKey']).toEqual({ value: 42 });
            expect(context.getData('testKey')).toEqual({ value: 42 });
        });

        it('returns the request from getRequestLike', () => {
            expect(context.getRequestLike()).toBe(mockRequest);
        });
    });

    describe('with unknown context', () => {
        it('throws when no transport adapter matches', () => {
            expect(() => new AuthorizationContext({} as any)).toThrow('No transport adapter matched the provided context');
        });
    });
});
