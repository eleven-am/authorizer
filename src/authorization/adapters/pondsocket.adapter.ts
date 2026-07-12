import type { Context } from '@eleven-am/pondsocket-nest';

import { TransportAdapter, TransportContext } from '../transport.contracts';

class PondSocketTransportContext implements TransportContext {
    readonly type = 'pondsocket';

    readonly #context: Context;

    constructor (context: Context) {
        this.#context = context;
    }

    getClass (): any {
        return this.#context.getClass();
    }

    getHandler (): any {
        return this.#context.getHandler();
    }

    getData<T> (key: string): T | null {
        return (this.#context.getData(key) as T) ?? null;
    }

    setData<T> (key: string, value: T): void {
        this.#context.addData(key, value);
    }

    getRequestLike (): unknown {
        return this.#context;
    }
}

const hasFunction = (value: unknown, key: string): boolean => Boolean(value) && typeof (value as Record<string, unknown>)[key] === 'function';

export const pondsocketAdapter: TransportAdapter = {
    type: 'pondsocket',
    matches: (context: unknown): boolean => !hasFunction(context, 'switchToHttp') &&
        hasFunction(context, 'getClass') &&
        hasFunction(context, 'getHandler') &&
        hasFunction(context, 'addData') &&
        hasFunction(context, 'getData'),
    create: (context: unknown): TransportContext => new PondSocketTransportContext(context as Context),
};
