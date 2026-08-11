export declare const ENGINE_TRIGGER_SCHEMA_VERSION: 1;
export type EngineTriggerType = "tick" | "collision.enter" | "round.start" | "environment.activation" | "schedule.due";
export interface EngineTickTriggerEvent {
    schemaVersion: 1;
    type: "tick";
    sourceId: string;
    sequence: number;
    payload: {
        dt: number;
    };
}
export interface EngineCollisionEnterTriggerEvent {
    schemaVersion: 1;
    type: "collision.enter";
    sourceId: string;
    sequence: number;
    payload: {
        entityId: string;
        otherId: string;
        contactKey: string;
    };
}
export interface EngineRoundStartTriggerEvent {
    schemaVersion: 1;
    type: "round.start";
    sourceId: string;
    sequence: number;
    payload: {
        turnNumber: number;
        activeTeam: number;
        phase: string;
    };
}
export interface EngineEnvironmentActivationTriggerEvent {
    schemaVersion: 1;
    type: "environment.activation";
    sourceId: string;
    sequence: number;
    payload: {
        mechanicId: string;
        mechanicIndex: number;
        tick: number;
        active: boolean;
    };
}
export interface EngineScheduleDueTriggerEvent {
    schemaVersion: 1;
    type: "schedule.due";
    sourceId: string;
    sequence: number;
    payload: {
        scheduleId: string;
        clock: "tick" | "turn";
        value: number;
    };
}
export type EngineTriggerEvent = EngineTickTriggerEvent | EngineCollisionEnterTriggerEvent | EngineRoundStartTriggerEvent | EngineEnvironmentActivationTriggerEvent | EngineScheduleDueTriggerEvent;
export interface EngineTriggerActivation {
    schemaVersion: 1;
    effectId: string;
    event: EngineTriggerEvent;
}
export declare class EngineTriggerActivationQueue {
    private readonly maxActivations;
    private readonly pending;
    private processed;
    constructor(maxActivations?: number);
    enqueue(activation: EngineTriggerActivation): void;
    /** Internal fast path for activations already created by a validated event bridge. */
    protected enqueueValidated(activation: EngineTriggerActivation): void;
    /** Processes FIFO activations through trusted host code, never content callbacks. */
    process(dispatch: (activation: EngineTriggerActivation) => void): number;
    pendingCount(): number;
}
export declare function createTickTriggerEvent(input: {
    sourceId: string;
    sequence: number;
    dt: number;
}): EngineTickTriggerEvent;
export declare function createCollisionEnterTriggerEvent(input: {
    sourceId: string;
    sequence: number;
    entityId: string;
    otherId: string;
    contactKey: string;
}): EngineCollisionEnterTriggerEvent;
export declare function createTriggerActivation(input: {
    effectId: string;
    event: EngineTriggerEvent;
}): EngineTriggerActivation;
export declare function createRoundStartTriggerEvent(input: {
    sourceId: string;
    sequence: number;
    turnNumber: number;
    activeTeam: number;
    phase: string;
}): EngineRoundStartTriggerEvent;
export declare function createEnvironmentActivationTriggerEvent(input: {
    sourceId: string;
    sequence: number;
    mechanicId: string;
    mechanicIndex: number;
    tick: number;
    active: boolean;
}): EngineEnvironmentActivationTriggerEvent;
export declare function createScheduleDueTriggerEvent(input: {
    sourceId: string;
    sequence: number;
    scheduleId: string;
    clock: "tick" | "turn";
    value: number;
}): EngineScheduleDueTriggerEvent;
export declare function validateTriggerActivation(value: unknown): asserts value is EngineTriggerActivation;
export declare function validateTriggerEvent(value: unknown): asserts value is EngineTriggerEvent;
