import { type JsonValue, type SystemSettings } from "../contracts/systemSettings.js";
import type { EngineEffectRegistry } from "./effectRegistry.js";
export interface EngineRuntimeEntity {
    readonly id: string;
    readonly capabilities: readonly string[];
    hasCapability(capability: string): boolean;
    getComponent<T = unknown>(capability: string): T | undefined;
}
export interface EngineSystemContext {
    readonly deltaSeconds: number;
    readonly entities: readonly EngineRuntimeEntity[];
    query(requiredCapabilities: readonly string[]): readonly EngineRuntimeEntity[];
}
export type EngineSystemExecutor = (context: EngineSystemContext) => void;
/** Declarative metadata used by SDK framework selection; it never imports runtime systems. */
export interface EngineSystemDefinition {
    id: string;
    schemaVersion?: 1;
    /** Capabilities exposed by this system. Its own ID is always provided as well. */
    provides?: readonly string[];
    /** Capabilities that must have exactly one selected provider. */
    requires?: readonly string[];
    /** Ordering constraints expressed in system IDs. */
    before?: readonly string[];
    after?: readonly string[];
    /** Capabilities or IDs this definition deliberately replaces. */
    replaces?: readonly string[];
    optional?: boolean;
    state?: Record<string, JsonValue>;
    /** Effect IDs interpreted by this system; this metadata is not serialized. */
    acceptsEffects?: readonly string[];
    /** Capability states required on each entity processed by the executable system. */
    requiresCapabilities?: readonly string[];
}
export type EngineFrameworkSettings = {
    schemaVersion: 1;
    systems: SystemSettings[];
    systemOrder: string[];
};
/**
 * Generic deterministic system-selector. Runtime-specific catalogs supply
 * metadata; this registry only validates capabilities and serializes order.
 */
export declare class EngineSystemRegistry {
    private readonly definitions;
    private readonly executors;
    register(definition: EngineSystemDefinition, executor?: EngineSystemExecutor): this;
    getDefinition(id: string): EngineSystemDefinition;
    getExecutor(id: string): EngineSystemExecutor | undefined;
    /** Selects requested systems plus transitive capability providers in deterministic order. */
    select(ids: readonly string[]): EngineFrameworkSettings;
    /** Validates a serialized framework against this catalog without restoring runtime objects. */
    validate(settings: unknown): asserts settings is EngineFrameworkSettings;
    /** Validates data Effects against the selected systems' capabilities and contracts. */
    validateEffectSupport(settings: unknown, effects: readonly unknown[], catalog: EngineEffectRegistry): void;
}
