import { ExecutionContext } from '@nestjs/common';

import { TransportAdapter, TransportContext } from '../transport.contracts';

class HttpTransportContext implements TransportContext {
    readonly type = 'http';

    readonly #context: ExecutionContext;

    readonly #data: Record<string, unknown> = {};

    constructor (context: ExecutionContext) {
        this.#context = context;
    }

    getClass (): any {
        return this.#context.getClass();
    }

    getHandler (): any {
        return this.#context.getHandler();
    }

    getData<T> (key: string): T | null {
        const request = this.#getRequest();

        if (request && key in request) {
            return request[key] as T;
        }

        return key in this.#data ? (this.#data[key] as T) : null;
    }

    setData<T> (key: string, value: T): void {
        const request = this.#getRequest();

        if (request) {
            request[key] = value;
        } else {
            this.#data[key] = value;
        }
    }

    getRequestLike (): unknown {
        return this.#getRequest() ?? null;
    }

    #getRequest (): Record<string, any> | null {
        return this.#context.switchToHttp().getRequest() ?? null;
    }
}

export const httpAdapter: TransportAdapter = {
    type: 'http',
    matches: (context: unknown): boolean => Boolean(context) && typeof (context as ExecutionContext).switchToHttp === 'function',
    create: (context: unknown): TransportContext => new HttpTransportContext(context as ExecutionContext),
};
