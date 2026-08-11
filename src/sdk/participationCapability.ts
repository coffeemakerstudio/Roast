import type { EngineEffectRegistry } from "./effectRegistry.js";
import type { EngineSystemDefinition, EngineSystemRegistry } from "./systemRegistry.js";

export const PARTICIPATION_CAPABILITY = "participation.state" as const;
export const PARTICIPATION_SET_PHYSICS_EFFECT_ID = "participation.set-physics" as const;
export const PARTICIPATION_SET_DRAWING_EFFECT_ID = "participation.set-drawing" as const;
export const PARTICIPATION_EFFECT_IDS = [PARTICIPATION_SET_PHYSICS_EFFECT_ID, PARTICIPATION_SET_DRAWING_EFFECT_ID] as const;

export interface ParticipationPayload { enabled: boolean }

export function participationSystemDefinition(): EngineSystemDefinition {
	return { id: "core.participation", provides: [PARTICIPATION_CAPABILITY], acceptsEffects: [...PARTICIPATION_EFFECT_IDS] };
}

export function registerParticipationSystem(registry: EngineSystemRegistry): EngineSystemRegistry {
	return registry.register(participationSystemDefinition());
}

export function registerParticipationCommands(registry: EngineEffectRegistry): EngineEffectRegistry {
	return registry
		.register({ id: PARTICIPATION_SET_PHYSICS_EFFECT_ID, requiresCapability: [PARTICIPATION_CAPABILITY], targetType: "entity-or-structure", lifecycleCategory: "command", validatePayload: validateParticipationPayload })
		.register({ id: PARTICIPATION_SET_DRAWING_EFFECT_ID, requiresCapability: [PARTICIPATION_CAPABILITY], targetType: "entity-or-structure", lifecycleCategory: "command", validatePayload: validateParticipationPayload });
}

function validateParticipationPayload(payload: unknown): void {
	if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("Participation payload must be an object");
	const value = payload as Record<string, unknown>;
	if (Object.keys(value).length !== 1 || typeof value.enabled !== "boolean") throw new Error("Participation payload requires only boolean enabled");
}
