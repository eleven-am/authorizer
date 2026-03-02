import type { Context } from '@eleven-am/pondsocket-nest';
import { ExecutionContext } from '@nestjs/common';

export class AuthorizationContext {
    readonly #context: ExecutionContext | Context;

    readonly #isSocket: boolean;

    readonly #data: Record<string, unknown> = {};

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

    addData<T> (key: string, data: T): void {
        if (this.#isSocket) {
            (this.#context as Context).addData(key, data);
        } else {
            const request = (this.#context as ExecutionContext).switchToHttp().getRequest();

            if (request) {
                request[key] = data;
            } else {
                this.#data[key] = data;
            }
        }
    }

    getData<T> (key: string): T | null {
        if (this.#isSocket) {
            return (this.#context as Context).getData(key) as T | null;
        }

        const request = (this.#context as ExecutionContext).switchToHttp().getRequest();

        if (request && request[key]) {
            return request[key] as T;
        }

        return (this.#data[key] as T) ?? null;
    }
}
