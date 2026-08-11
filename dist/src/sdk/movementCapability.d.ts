import type { EngineEffectRegistry } from "./effectRegistry.js";
import type { EngineSystemDefinition, EngineSystemRegistry } from "./systemRegistry.js";
export declare const MOVEMENT_CAPABILITY: "movement.state";
export declare const MOVEMENT_EFFECT_ID: "movement.integrate";
export declare const MOVEMENT_SET_VELOCITY_EFFECT_ID: "movement.set-velocity";
export declare const MOVEMENT_ADD_VELOCITY_EFFECT_ID: "movement.add-velocity";
export declare const MOVEMENT_SCALE_SPEED_EFFECT_ID: "movement.scale-speed";
export declare const MOVEMENT_APPLY_FORCE_FIELD_EFFECT_ID: "movement.apply-force-field";
export declare const MOVEMENT_APPLY_FORCE_TO_ENTITY_EFFECT_ID: "movement.apply-force-to-entity";
export declare const MOVEMENT_COMMAND_EFFECT_IDS: readonly ["movement.set-velocity", "movement.add-velocity", "movement.scale-speed", "movement.apply-force-field", "movement.apply-force-to-entity"];
export declare function movementSystemDefinition(): EngineSystemDefinition;
export declare function registerMovementSystem(registry: EngineSystemRegistry): EngineSystemRegistry;
export interface MovementVelocityPayload {
    x: number;
    y: number;
}
export interface MovementScaleSpeedPayload {
    factor: number;
}
export interface MovementForceFieldPayload {
    mode: "attract" | "repel";
    force: number;
    range: number;
}
export interface MovementForceToEntityPayload extends MovementForceFieldPayload {
    origin: MovementVelocityPayload;
}
/** Registers the generic movement contract without selecting its runtime system. */
export declare function registerMovementEffect(registry: EngineEffectRegistry): EngineEffectRegistry;
/** Registers deterministic movement commands without selecting their runtime system. */
export declare function registerMovementCommands(registry: EngineEffectRegistry): EngineEffectRegistry;
