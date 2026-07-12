export interface TransportContext {
    readonly type: string;
    getClass(): any;
    getHandler(): any;
    getData<T>(key: string): T | null;
    setData<T>(key: string, value: T): void;
    getRequestLike(): unknown;
}

export interface TransportAdapter {
    readonly type: string;
    matches(context: unknown): boolean;
    create(context: unknown): TransportContext;
}
