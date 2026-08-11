export declare const COUNTER_SCHEMA_VERSION: 1;
/** Canonical persistent numeric fact owned by a world. */
export interface CounterState {
    schemaVersion: typeof COUNTER_SCHEMA_VERSION;
    id: string;
    value: number;
}
/** Creates one detached, complete canonical counter state. */
export declare function createCounterState(input: {
    id: string;
    value?: number;
}): CounterState;
/** Validates one current counter state without constructing runtime objects. */
export declare function validateCounterState(value: unknown): asserts value is CounterState;
/** Validates and canonically orders a detached world counter collection. */
export declare function canonicalizeCounterStates(value: unknown): CounterState[];
