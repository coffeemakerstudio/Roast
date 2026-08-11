import { assertJsonValue, type JsonValue } from "../contracts/systemSettings.js";

export type EngineEffectSettings = {
	type: string;
	schemaVersion?: 1;
	typeValue: JsonValue;
	target?: JsonValue;
};

export interface EngineEffectDefinition {
	id: string;
	schemaVersion?: 1;
	requiresCapability?: readonly string[];
	targetType?: string;
	lifecycleCategory?: string;
	/** Runtime-only validation; never included in serialized descriptors. */
	validatePayload?: (payload: JsonValue) => void;
	/** Runtime-only target validation; never included in serialized descriptors. */
	validateTarget?: (target: JsonValue) => void;
}

export type EngineEffectDescriptor = Omit<EngineEffectDefinition, "validatePayload" | "validateTarget">;

/** Data catalog plus host-side validators for supported Effect contracts. */
export class EngineEffectRegistry {
	private readonly definitions = new Map<string, EngineEffectDefinition>();

	public register(definition: EngineEffectDefinition): this {
		validateDefinition(definition);
		if (this.definitions.has(definition.id)) throw new Error(`Duplicate effect definition '${definition.id}'`);
		this.definitions.set(definition.id, { ...definition, ...(definition.requiresCapability ? { requiresCapability: [...definition.requiresCapability] } : {}) });
		return this;
	}

	public get(id: string): EngineEffectDefinition | undefined { return this.definitions.get(id); }

	/** Validates only JSON-safe effect data and the registered payload contract. */
	public validate(effect: unknown): asserts effect is EngineEffectSettings {
		if (!effect || typeof effect !== "object" || Array.isArray(effect)) throw new Error("Malformed effect settings");
		const value = effect as Partial<EngineEffectSettings>;
		if (typeof value.type !== "string" || !this.definitions.has(value.type)) throw new Error(`Unknown effect '${String(value.type)}'`);
		if (value.schemaVersion !== undefined && value.schemaVersion !== 1) throw new Error(`Unsupported effect schema version for '${value.type}'`);
		assertJsonValue(value.typeValue);
		this.definitions.get(value.type)!.validatePayload?.(value.typeValue);
		if (value.target !== undefined) assertJsonValue(value.target);
		if (value.target !== undefined) this.definitions.get(value.type)!.validateTarget?.(value.target as JsonValue);
	}

	/** Returns a detached descriptor without runtime validator functions. */
	public describe(): EngineEffectDescriptor[] {
		return [...this.definitions.values()].sort((a, b) => a.id.localeCompare(b.id)).map(definition => ({
			id: definition.id,
			schemaVersion: definition.schemaVersion ?? 1,
			...(definition.requiresCapability ? { requiresCapability: [...definition.requiresCapability] } : {}),
			...(definition.targetType ? { targetType: definition.targetType } : {}),
			...(definition.lifecycleCategory ? { lifecycleCategory: definition.lifecycleCategory } : {}),
		}));
	}
}

function validateDefinition(definition: EngineEffectDefinition): void {
	if (!definition || typeof definition.id !== "string" || !/^[a-z0-9.-]{1,80}$/.test(definition.id)) throw new Error("Invalid effect definition ID");
	if (definition.schemaVersion !== undefined && definition.schemaVersion !== 1) throw new Error("Unsupported effect definition version");
	for (const value of [definition.targetType, definition.lifecycleCategory]) if (value !== undefined && (typeof value !== "string" || value.length === 0)) throw new Error(`Invalid effect definition '${definition.id}'`);
	if (definition.requiresCapability !== undefined && (!Array.isArray(definition.requiresCapability) || definition.requiresCapability.some(value => typeof value !== "string" || value.length === 0))) throw new Error(`Invalid effect capabilities for '${definition.id}'`);
	if (definition.validatePayload !== undefined && typeof definition.validatePayload !== "function") throw new Error(`Invalid effect validator for '${definition.id}'`);
	if (definition.validateTarget !== undefined && typeof definition.validateTarget !== "function") throw new Error(`Invalid effect target validator for '${definition.id}'`);
}
