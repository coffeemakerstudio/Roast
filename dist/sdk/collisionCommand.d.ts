import { type EngineEffectComposition } from "./composition.js";
import type { EngineEffectSettings } from "./effectRegistry.js";
export declare const COLLISION_COMMAND_SCHEMA_VERSION: 1;
export declare const COLLISION_COMMAND_TYPE: "collision.command";
/** A trigger-relative current Engine command activated by a structure collision. */
export interface CollisionCommandBinding {
    schemaVersion: typeof COLLISION_COMMAND_SCHEMA_VERSION;
    type: typeof COLLISION_COMMAND_TYPE;
    effect: EngineEffectSettings | EngineEffectComposition;
}
export declare function createCollisionCommandBinding(effect: EngineEffectSettings | EngineEffectComposition): CollisionCommandBinding;
/** Validates a relative collision command without resolving a runtime target. */
export declare function validateCollisionCommandBinding(value: unknown): asserts value is CollisionCommandBinding;
export declare function isCollisionCommandBinding(value: unknown): value is CollisionCommandBinding;
