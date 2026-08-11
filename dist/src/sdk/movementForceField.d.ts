import type { Vector2D } from "../contracts/vector.js";
import type { MovementForceFieldPayload } from "./movementCapability.js";
/** Calculates one deterministic radial velocity delta for a generic movement command. */
export declare function calculateRadialVelocityDelta(origin: Vector2D, target: Vector2D, field: MovementForceFieldPayload): Vector2D;
export declare function applyRadialVelocityDelta(velocity: Vector2D, origin: Vector2D, target: Vector2D, field: MovementForceFieldPayload): Vector2D;
