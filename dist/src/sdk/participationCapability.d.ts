import type { EngineEffectRegistry } from "./effectRegistry.js";
import type { EngineSystemDefinition, EngineSystemRegistry } from "./systemRegistry.js";
export declare const PARTICIPATION_CAPABILITY: "participation.state";
export declare const PARTICIPATION_SET_PHYSICS_EFFECT_ID: "participation.set-physics";
export declare const PARTICIPATION_SET_DRAWING_EFFECT_ID: "participation.set-drawing";
export declare const PARTICIPATION_EFFECT_IDS: readonly ["participation.set-physics", "participation.set-drawing"];
export interface ParticipationPayload {
    enabled: boolean;
}
export declare function participationSystemDefinition(): EngineSystemDefinition;
export declare function registerParticipationSystem(registry: EngineSystemRegistry): EngineSystemRegistry;
export declare function registerParticipationCommands(registry: EngineEffectRegistry): EngineEffectRegistry;
