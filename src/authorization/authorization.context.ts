import type { Context } from '@eleven-am/pondsocket-nest';
import { ExecutionContext } from '@nestjs/common';

import { TransportContext } from './transport.contracts';
import { resolveTransport } from './transport.registry';

export class AuthorizationContext {
    readonly #context: ExecutionContext | Context;

    readonly #transport: TransportContext;

    constructor (context: ExecutionContext | Context) {
        this.#context = context;
        this.#transport = resolveTransport(context);
    }

    get type (): string {
        return this.#transport.type;
    }

    get isSocket (): boolean {
        return this.#transport.type === 'pondsocket';
    }

    get isHttp (): boolean {
        return this.#transport.type === 'http';
    }

    getHttpContext (): ExecutionContext {
        if (!this.isHttp) {
            throw new Error('HTTP context is not available');
        }

        return this.#context as ExecutionContext;
    }

    getSocketContext (): Context {
        if (!this.isSocket) {
            throw new Error('Socket context is not available');
        }

        return this.#context as Context;
    }

    getGraphQLContext (): ExecutionContext {
        if (this.#transport.type !== 'graphql') {
            throw new Error('GraphQL context is not available');
        }

        return this.#context as ExecutionContext;
    }

    getClass (): any {
        return this.#transport.getClass();
    }

    getHandler (): any {
        return this.#transport.getHandler();
    }

    getRequestLike (): unknown {
        return this.#transport.getRequestLike();
    }

    addData<T> (key: string, data: T): void {
        this.#transport.setData(key, data);
    }

    getData<T> (key: string): T | null {
        return this.#transport.getData(key);
    }
}
