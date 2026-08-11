import { type JsonValue, type SystemSettings } from "../contracts/systemSettings.js";
import type { EngineEffectRegistry } from "./effectRegistry.js";
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
    register(definition: EngineSystemDefinition): this;
    /** Selects requested systems plus transitive capability providers in deterministic order. */
    select(ids: readonly string[]): EngineFrameworkSettings;
    /** Validates a serialized framework against this catalog without restoring runtime objects. */
    validate(settings: unknown): asserts settings is EngineFrameworkSettings;
    /** Validates data Effects against the selected systems' capabilities and contracts. */
    validateEffectSupport(settings: unknown, effects: readonly unknown[], catalog: EngineEffectRegistry): void;
}
