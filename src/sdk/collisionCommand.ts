import { assertJsonValue } from "../contracts/systemSettings.js";
import { validateEngineEffectComposition, type EngineEffectComposition } from "./composition.js";
import type { EngineEffectSettings } from "./effectRegistry.js";

export const COLLISION_COMMAND_SCHEMA_VERSION = 1 as const;
export const COLLISION_COMMAND_TYPE = "collision.command" as const;

/** A trigger-relative current Engine command activated by a structure collision. */
export interface CollisionCommandBinding {
	schemaVersion: typeof COLLISION_COMMAND_SCHEMA_VERSION;
	type: typeof COLLISION_COMMAND_TYPE;
	effect: EngineEffectSettings | EngineEffectComposition;
}

export function createCollisionCommandBinding(effect: EngineEffectSettings | EngineEffectComposition): CollisionCommandBinding {
	const binding: CollisionCommandBinding = { schemaVersion: 1, type: COLLISION_COMMAND_TYPE, effect: structuredClone(effect) };
	validateCollisionCommandBinding(binding);
	return binding;
}

/** Validates a relative collision command without resolving a runtime target. */
export function validateCollisionCommandBinding(value: unknown): asserts value is CollisionCommandBinding {
	if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Malformed collision command binding");
	const binding = value as Record<string, unknown>;
	if (Object.keys(binding).some(key => !["schemaVersion", "type", "effect"].includes(key)) || Object.keys(binding).length !== 3) throw new Error("Malformed collision command binding");
	if (binding.schemaVersion !== 1 || binding.type !== COLLISION_COMMAND_TYPE) throw new Error("Unsupported collision command binding");
	validateRelativeEffect(binding.effect);
}

export function isCollisionCommandBinding(value: unknown): value is CollisionCommandBinding {
	try {
		validateCollisionCommandBinding(value);
		return true;
	} catch {
		return false;
	}
}

function validateRelativeEffect(value: unknown): void {
	if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Collision command effect must be an object");
	const effect = value as Record<string, unknown>;
	if (effect.type === "effect.composition") {
		validateEngineEffectComposition(effect);
		for (const child of effect.effects) validateRelativeEffect(child);
		return;
	}
	if (typeof effect.type !== "string" || effect.type.length === 0 || effect.schemaVersion !== 1 || !("typeValue" in effect) || "target" in effect) throw new Error("Collision command must be a target-relative Engine effect");
	assertJsonValue(effect.typeValue);
}
