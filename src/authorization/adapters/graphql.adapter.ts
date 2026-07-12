import { ExecutionContext } from '@nestjs/common';

import { TransportAdapter, TransportContext } from '../transport.contracts';

class GraphQLTransportContext implements TransportContext {
    readonly type = 'graphql';

    readonly #context: ExecutionContext;

    readonly #gqlContext: Record<string, any> | null;

    readonly #data: Record<string, unknown> = {};

    constructor (context: ExecutionContext) {
        this.#context = context;

        const { GqlExecutionContext } = require('@nestjs/graphql');

        this.#gqlContext = GqlExecutionContext.create(context).getContext() ?? null;
    }

    getClass (): any {
        return this.#context.getClass();
    }

    getHandler (): any {
        return this.#context.getHandler();
    }

    getData<T> (key: string): T | null {
        const store = this.#getStore();

        if (store && key in store) {
            return store[key] as T;
        }

        return key in this.#data ? (this.#data[key] as T) : null;
    }

    setData<T> (key: string, value: T): void {
        const store = this.#getStore();

        if (store) {
            store[key] = value;
        } else {
            this.#data[key] = value;
        }
    }

    getRequestLike (): unknown {
        return this.#gqlContext?.req ?? this.#gqlContext?.request ?? null;
    }

    #getStore (): Record<string, any> | null {
        const request = this.#gqlContext?.req ?? this.#gqlContext?.request;

        return request ?? this.#gqlContext;
    }
}

export const graphqlAdapter: TransportAdapter = {
    type: 'graphql',
    matches: (context: unknown): boolean => Boolean(context) &&
        typeof (context as ExecutionContext).getType === 'function' &&
        (context as ExecutionContext).getType<string>() === 'graphql',
    create: (context: unknown): TransportContext => new GraphQLTransportContext(context as ExecutionContext),
};
