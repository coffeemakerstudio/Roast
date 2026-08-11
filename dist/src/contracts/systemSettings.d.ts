/** JSON values accepted at the engine/framework serialization boundary. */
export type JsonValue = null | boolean | number | string | JsonValue[] | {
    [key: string]: JsonValue;
};
/** Versioned, data-only identity of a registered engine system. */
/** Existing runtime snapshots retain an open structural state type; SDK validation narrows it to JSON. */
export type SystemSettings = {
    systemId: string;
    schemaVersion: 1;
    state: Record<string, unknown>;
};
/** Rejects executable, non-finite, or otherwise non-JSON settings data. */
export declare function assertJsonValue(value: unknown): asserts value is JsonValue;
