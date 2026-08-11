import type { Vector2D } from "../contracts/vector.js";

export const ENTITY_STATE_SCHEMA_VERSION = 1 as const;

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

export function createTransformState(input: { position: Vector2D; rotation?: number }): EngineTransformState {
	const state: EngineTransformState = { schemaVersion: 1, position: { ...input.position }, rotation: input.rotation ?? 0 };
	validateTransformState(state);
	return structuredClone(state);
}

export function createMovementState(input: { velocity: Vector2D; angularVelocity?: number; enabled?: boolean }): EngineMovementState {
	const state: EngineMovementState = { schemaVersion: 1, velocity: { ...input.velocity }, angularVelocity: input.angularVelocity ?? 0, enabled: input.enabled ?? true };
	validateMovementState(state);
	return structuredClone(state);
}

export function validateTransformState(value: unknown): asserts value is EngineTransformState {
	const state = record(value, "Transform state");
	exactKeys(state, ["schemaVersion", "position", "rotation"], "Transform state");
	if (state.schemaVersion !== 1) throw new Error("Unsupported Transform state schema version");
	validateVector(state.position, "Transform position");
	finite(state.rotation, "Transform rotation");
}

export function validateMovementState(value: unknown): asserts value is EngineMovementState {
	const state = record(value, "Movement state");
	exactKeys(state, ["schemaVersion", "velocity", "angularVelocity", "enabled"], "Movement state");
	if (state.schemaVersion !== 1) throw new Error("Unsupported Movement state schema version");
	validateVector(state.velocity, "Movement velocity");
	finite(state.angularVelocity, "Movement angularVelocity");
	if (typeof state.enabled !== "boolean") throw new Error("Movement enabled must be boolean");
}

function validateVector(value: unknown, label: string): void {
	const vector = record(value, label);
	exactKeys(vector, ["x", "y"], label);
	finite(vector.x, `${label} x`);
	finite(vector.y, `${label} y`);
}

function record(value: unknown, label: string): Record<string, unknown> {
	if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${label} must be an object`);
	return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[], label: string): void {
	const allowed = new Set(keys);
	for (const key of Object.keys(value)) if (!allowed.has(key)) throw new Error(`${label} contains unknown field '${key}'`);
	for (const key of keys) if (!(key in value)) throw new Error(`${label} is missing '${key}'`);
}

function finite(value: unknown, label: string): asserts value is number {
	if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${label} must be finite`);
}
