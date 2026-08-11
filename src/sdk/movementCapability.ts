import type { EngineEffectRegistry } from "./effectRegistry.js";
import type { EngineSystemDefinition, EngineSystemRegistry } from "./systemRegistry.js";

export const MOVEMENT_CAPABILITY = "movement.state" as const;
export const MOVEMENT_EFFECT_ID = "movement.integrate" as const;
export const MOVEMENT_SET_VELOCITY_EFFECT_ID = "movement.set-velocity" as const;
export const MOVEMENT_ADD_VELOCITY_EFFECT_ID = "movement.add-velocity" as const;
export const MOVEMENT_SCALE_SPEED_EFFECT_ID = "movement.scale-speed" as const;
export const MOVEMENT_APPLY_FORCE_FIELD_EFFECT_ID = "movement.apply-force-field" as const;
export const MOVEMENT_APPLY_FORCE_TO_ENTITY_EFFECT_ID = "movement.apply-force-to-entity" as const;
export const MOVEMENT_COMMAND_EFFECT_IDS = [MOVEMENT_SET_VELOCITY_EFFECT_ID, MOVEMENT_ADD_VELOCITY_EFFECT_ID, MOVEMENT_SCALE_SPEED_EFFECT_ID, MOVEMENT_APPLY_FORCE_FIELD_EFFECT_ID, MOVEMENT_APPLY_FORCE_TO_ENTITY_EFFECT_ID] as const;

export function movementSystemDefinition(): EngineSystemDefinition {
	return { id: "core.movement", provides: [MOVEMENT_CAPABILITY], acceptsEffects: [...MOVEMENT_COMMAND_EFFECT_IDS], before: ["core.playback"] };
}

export function registerMovementSystem(registry: EngineSystemRegistry): EngineSystemRegistry {
	return registry.register(movementSystemDefinition());
}

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
export function registerMovementEffect(registry: EngineEffectRegistry): EngineEffectRegistry {
	return registry.register({
		id: MOVEMENT_EFFECT_ID,
		requiresCapability: [MOVEMENT_CAPABILITY],
		targetType: "entity",
		lifecycleCategory: "modifier",
		validatePayload: payload => {
			if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("Movement payload must be an object");
			const value = payload as Record<string, unknown>;
			if (Object.keys(value).some(key => !["deltaTime", "x", "y"].includes(key)) || Object.keys(value).length !== 3) throw new Error("Movement payload contains unexpected fields");
			for (const key of ["deltaTime", "x", "y"]) if (typeof value[key] !== "number" || !Number.isFinite(value[key])) throw new Error(`Movement ${key} must be finite`);
		},
	});
}

/** Registers deterministic movement commands without selecting their runtime system. */
export function registerMovementCommands(registry: EngineEffectRegistry): EngineEffectRegistry {
	return registry
		.register({
			id: MOVEMENT_SET_VELOCITY_EFFECT_ID,
			requiresCapability: [MOVEMENT_CAPABILITY],
			targetType: "entity",
			lifecycleCategory: "command",
			validatePayload: payload => validateVectorPayload(payload, "Movement velocity"),
		})
		.register({
			id: MOVEMENT_ADD_VELOCITY_EFFECT_ID,
			requiresCapability: [MOVEMENT_CAPABILITY],
			targetType: "entity",
			lifecycleCategory: "command",
			validatePayload: payload => validateVectorPayload(payload, "Movement velocity delta"),
		})
		.register({
			id: MOVEMENT_SCALE_SPEED_EFFECT_ID,
			requiresCapability: [MOVEMENT_CAPABILITY],
			targetType: "entity",
			lifecycleCategory: "command",
			validatePayload: payload => {
				const value = record(payload, "Movement speed scale payload");
				exactKeys(value, ["factor"], "Movement speed scale payload");
				if (typeof value.factor !== "number" || !Number.isFinite(value.factor) || value.factor < 0) throw new Error("Movement speed scale factor must be finite and non-negative");
			},
		})
		.register({
			id: MOVEMENT_APPLY_FORCE_FIELD_EFFECT_ID,
			requiresCapability: [MOVEMENT_CAPABILITY],
			targetType: "position",
			lifecycleCategory: "command",
			validatePayload: payload => {
				const value = record(payload, "Movement force field payload");
				exactKeys(value, ["mode", "force", "range"], "Movement force field payload");
				if (value.mode !== "attract" && value.mode !== "repel") throw new Error("Movement force field mode must be attract or repel");
				if (typeof value.force !== "number" || !Number.isFinite(value.force) || value.force < 0) throw new Error("Movement force field force must be finite and non-negative");
				if (typeof value.range !== "number" || !Number.isFinite(value.range) || value.range <= 0) throw new Error("Movement force field range must be finite and positive");
			},
		})
		.register({
			id: MOVEMENT_APPLY_FORCE_TO_ENTITY_EFFECT_ID,
			requiresCapability: [MOVEMENT_CAPABILITY],
			targetType: "entity",
			lifecycleCategory: "command",
			validatePayload: payload => {
				const value = record(payload, "Movement entity force payload");
				exactKeys(value, ["origin", "mode", "force", "range"], "Movement entity force payload");
				const origin = record(value.origin, "Movement entity force origin");
				exactKeys(origin, ["x", "y"], "Movement entity force origin");
				if (typeof origin.x !== "number" || !Number.isFinite(origin.x) || typeof origin.y !== "number" || !Number.isFinite(origin.y)) throw new Error("Movement entity force origin must be finite");
				if (value.mode !== "attract" && value.mode !== "repel") throw new Error("Movement entity force mode must be attract or repel");
				if (typeof value.force !== "number" || !Number.isFinite(value.force) || value.force < 0) throw new Error("Movement entity force must be finite and non-negative");
				if (typeof value.range !== "number" || !Number.isFinite(value.range) || value.range <= 0) throw new Error("Movement entity force range must be finite and positive");
			},
		});
}

function validateVectorPayload(payload: unknown, label: string): void {
	const value = record(payload, `${label} payload`);
	exactKeys(value, ["x", "y"], `${label} payload`);
	for (const key of ["x", "y"]) if (typeof value[key] !== "number" || !Number.isFinite(value[key])) throw new Error(`${label} ${key} must be finite`);
}

function record(value: unknown, label: string): Record<string, unknown> {
	if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${label} must be an object`);
	return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[], label: string): void {
	const allowed = new Set(keys);
	for (const key of Object.keys(value)) if (!allowed.has(key)) throw new Error(`${label} contains unexpected fields`);
	for (const key of keys) if (!(key in value)) throw new Error(`${label} is missing '${key}'`);
}
