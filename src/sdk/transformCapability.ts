import type { EngineEffectRegistry } from "./effectRegistry.js";

export const TRANSFORM_CAPABILITY = "transform.state" as const;
export const TRANSFORM_SET_POSITION_EFFECT_ID = "transform.set-position" as const;
export const TRANSFORM_SET_ROTATION_EFFECT_ID = "transform.set-rotation" as const;
export const TRANSFORM_SWAP_POSITION_EFFECT_ID = "transform.swap-position" as const;

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

export type TransformTarget = { type: "entity"; entityId: string } | { type: "structure"; structureId: string };

/** Registers absolute transform commands without selecting their runtime system. */
export function registerTransformEffects(registry: EngineEffectRegistry): EngineEffectRegistry {
	return registry
		.register({
			id: TRANSFORM_SET_POSITION_EFFECT_ID,
			requiresCapability: [TRANSFORM_CAPABILITY],
			targetType: "entity-or-structure",
			lifecycleCategory: "command",
			validatePayload: payload => validateVectorPayload(payload, "Transform position"),
			validateTarget: target => validateTransformTarget(target, true),
		})
		.register({
			id: TRANSFORM_SET_ROTATION_EFFECT_ID,
			requiresCapability: [TRANSFORM_CAPABILITY],
			targetType: "entity",
			lifecycleCategory: "command",
			validatePayload: payload => {
				const value = record(payload, "Transform rotation payload");
				exactKeys(value, ["rotation"], "Transform rotation payload");
				finite(value.rotation, "Transform rotation");
			},
			validateTarget: target => validateTransformTarget(target, false),
		})
		.register({
			id: TRANSFORM_SWAP_POSITION_EFFECT_ID,
			requiresCapability: [TRANSFORM_CAPABILITY],
			targetType: "entity",
			lifecycleCategory: "command",
			validatePayload: payload => {
				const value = record(payload, "Transform swap position payload");
				exactKeys(value, ["otherEntityId"], "Transform swap position payload");
				if (typeof value.otherEntityId !== "string" || value.otherEntityId.length === 0) throw new Error("Transform swap position requires a non-empty otherEntityId");
			},
			validateTarget: target => validateTransformTarget(target, false),
		});
}

export function validateTransformTarget(value: unknown, allowStructure: boolean = true): asserts value is TransformTarget {
	if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Transform target must be an object");
	const target = value as Record<string, unknown>;
	if (target.type === "entity") {
		exactKeys(target, ["type", "entityId"], "Transform entity target");
		if (typeof target.entityId !== "string" || target.entityId.length === 0) throw new Error("Transform target requires a non-empty entityId");
		return;
	}
	if (allowStructure && target.type === "structure") {
		exactKeys(target, ["type", "structureId"], "Transform structure target");
		if (typeof target.structureId !== "string" || target.structureId.length === 0) throw new Error("Transform target requires a non-empty structureId");
		return;
	}
	throw new Error("Transform target type is unsupported");
}

function validateVectorPayload(payload: unknown, label: string): void {
	const value = record(payload, `${label} payload`);
	exactKeys(value, ["x", "y"], `${label} payload`);
	finite(value.x, `${label} x`);
	finite(value.y, `${label} y`);
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

function finite(value: unknown, label: string): asserts value is number {
	if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${label} must be finite`);
}
