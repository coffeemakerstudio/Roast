import type { Vector2D } from "../contracts/vector.js";
export declare const ENTITY_STATE_SCHEMA_VERSION: 1;
export interface EngineTransformState {
    schemaVersion: 1;
    position: Vector2D;
    rotation: number;
}
export interface EngineMovementState {
    schemaVersion: 1;
    velocity: Vector2D;
    angularVelocity: number;
    enabled: boolean;
}
export declare function createTransformState(input: {
    position: Vector2D;
    rotation?: number;
}): EngineTransformState;
export declare function createMovementState(input: {
    velocity: Vector2D;
    angularVelocity?: number;
    enabled?: boolean;
}): EngineMovementState;
export declare function validateTransformState(value: unknown): asserts value is EngineTransformState;
export declare function validateMovementState(value: unknown): asserts value is EngineMovementState;
