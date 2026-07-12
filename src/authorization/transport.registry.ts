import { graphqlAdapter } from './adapters/graphql.adapter';
import { httpAdapter } from './adapters/http.adapter';
import { pondsocketAdapter } from './adapters/pondsocket.adapter';
import { TransportAdapter, TransportContext } from './transport.contracts';

const adapters: TransportAdapter[] = [graphqlAdapter, httpAdapter, pondsocketAdapter];

export function registerTransportAdapter (adapter: TransportAdapter, options?: { prepend?: boolean }): void {
    if (options?.prepend) {
        adapters.unshift(adapter);
    } else {
        adapters.push(adapter);
    }
}

export function resolveTransport (context: unknown): TransportContext {
    const adapter = adapters.find((candidate) => candidate.matches(context));

    if (!adapter) {
        throw new Error('No transport adapter matched the provided context');
    }

    return adapter.create(context);
}
