import type { Context } from '@eleven-am/pondsocket-nest';
import { ExecutionContext } from '@nestjs/common';

export class AuthorizationContext {
    readonly #context: ExecutionContext | Context;

    readonly #isSocket: boolean;

    constructor (context: ExecutionContext | Context) {
        this.#isSocket = !('switchToHttp' in context);
        this.#context = context;
    }

    get isSocket (): boolean {
        return this.#isSocket;
    }

    get isHttp (): boolean {
        return !this.#isSocket;
    }

    getHttpContext (): ExecutionContext {
        if (this.#isSocket) {
            throw new Error('HTTP context is not available');
        }

        return this.#context as ExecutionContext;
    }

    getSocketContext (): Context {
        if (!this.#isSocket) {
            throw new Error('Socket context is not available');
        }

        return this.#context as Context;
    }

    getClass (): any {
        return this.#context.getClass();
    }

    getHandler (): any {
        return this.#context.getHandler();
    }
}
