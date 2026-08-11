import type { EngineEffectRegistry } from "./effectRegistry.js";
export declare const TRANSFORM_CAPABILITY: "transform.state";
export declare const TRANSFORM_SET_POSITION_EFFECT_ID: "transform.set-position";
export declare const TRANSFORM_SET_ROTATION_EFFECT_ID: "transform.set-rotation";
export declare const TRANSFORM_SWAP_POSITION_EFFECT_ID: "transform.swap-position";
export interface TransformSetPositionPayload {
    x: number;
    y: number;
}
export interface TransformSetRotationPayload {
    rotation: number;
}
export interface TransformSwapPositionPayload {
    otherEntityId: string;
}
export type TransformTarget = {
    type: "entity";
    entityId: string;
} | {
    type: "structure";
    structureId: string;
};
/** Registers absolute transform commands without selecting their runtime system. */
export declare function registerTransformEffects(registry: EngineEffectRegistry): EngineEffectRegistry;
export declare function validateTransformTarget(value: unknown, allowStructure?: boolean): asserts value is TransformTarget;
