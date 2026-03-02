import { AuthorizationContext } from './authorization.context';

describe('AuthorizationContext', () => {
    describe('with HTTP context', () => {
        const mockRequest = { user: { id: 1 } };
        const httpContext = {
            getClass: jest.fn().mockReturnValue(class TestController {}),
            getHandler: jest.fn().mockReturnValue(() => {}),
            switchToHttp: jest.fn().mockReturnValue({
                getRequest: jest.fn().mockReturnValue(mockRequest),
            }),
        };

        let context: AuthorizationContext;

        beforeEach(() => {
            context = new AuthorizationContext(httpContext as any);
        });

        it('detects HTTP context', () => {
            expect(context.isHttp).toBe(true);
            expect(context.isSocket).toBe(false);
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
    });

    describe('with socket context', () => {
        const socketContext = {
            getClass: jest.fn().mockReturnValue(class TestGateway {}),
            getHandler: jest.fn().mockReturnValue(() => {}),
            addData: jest.fn(),
            getData: jest.fn(),
        };

        let context: AuthorizationContext;

        beforeEach(() => {
            context = new AuthorizationContext(socketContext as any);
        });

        it('detects socket context', () => {
            expect(context.isSocket).toBe(true);
            expect(context.isHttp).toBe(false);
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
    });
});
