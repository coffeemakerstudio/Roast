import { assertJsonValue, type JsonValue, type SystemSettings } from "../contracts/systemSettings.js";
import type { EngineEffectRegistry, EngineEffectSettings } from "./effectRegistry.js";

/** Declarative metadata used by SDK framework selection; it never imports runtime systems. */
export interface EngineSystemDefinition {
	id: string;
	schemaVersion?: 1;
	/** Capabilities exposed by this system. Its own ID is always provided as well. */
	provides?: readonly string[];
	/** Capabilities that must have exactly one selected provider. */
	requires?: readonly string[];
	/** Ordering constraints expressed in system IDs. */
	before?: readonly string[];
	after?: readonly string[];
	/** Capabilities or IDs this definition deliberately replaces. */
	replaces?: readonly string[];
	optional?: boolean;
	state?: Record<string, JsonValue>;
	/** Effect IDs interpreted by this system; this metadata is not serialized. */
	acceptsEffects?: readonly string[];
}

export type EngineFrameworkSettings = { schemaVersion: 1; systems: SystemSettings[]; systemOrder: string[] };

/**
 * Generic deterministic system-selector. Runtime-specific catalogs supply
 * metadata; this registry only validates capabilities and serializes order.
 */
export class EngineSystemRegistry {
	private readonly definitions = new Map<string, EngineSystemDefinition>();

	public register(definition: EngineSystemDefinition): this {
		validateDefinition(definition);
		if (this.definitions.has(definition.id)) throw new Error(`Duplicate system definition '${definition.id}'`);
		this.definitions.set(definition.id, clone(definition));
		return this;
	}

	/** Selects requested systems plus transitive capability providers in deterministic order. */
	public select(ids: readonly string[]): EngineFrameworkSettings {
		const selected = new Set<string>();
		const add = (id: string): void => {
			if (selected.has(id)) return;
			const definition = this.definitions.get(id);
			if (!definition) throw new Error(`Unknown system '${id}'`);
			selected.add(id);
			for (const capability of definition.requires ?? []) {
				const providers = [...this.definitions.values()].filter(candidate => provides(candidate, capability));
				const active = providers.filter(candidate => selected.has(candidate.id));
				if (active.length === 1) continue;
				if (active.length > 1 || providers.length !== 1) throw new Error(`System '${id}' requires exactly one provider for '${capability}'`);
				add(providers[0]!.id);
			}
		};
		ids.forEach(add);
		validateReplacements([...selected].map(id => this.definitions.get(id)!));
		const order = topologicalOrder([...selected].map(id => this.definitions.get(id)!));
		return {
			schemaVersion: 1,
			systems: order.map(definition => ({ systemId: definition.id, schemaVersion: definition.schemaVersion ?? 1, state: clone(definition.state ?? {}) })).sort((a, b) => a.systemId.localeCompare(b.systemId)),
			systemOrder: order.map(definition => definition.id),
		};
	}

	/** Validates a serialized framework against this catalog without restoring runtime objects. */
	public validate(settings: unknown): asserts settings is EngineFrameworkSettings {
		if (!settings || typeof settings !== "object" || Array.isArray(settings)) throw new Error("Malformed framework settings");
		const value = settings as Partial<EngineFrameworkSettings>;
		if (value.schemaVersion !== 1 || !Array.isArray(value.systems) || !Array.isArray(value.systemOrder)) throw new Error("Malformed framework settings");
		const ids = new Set<string>();
		for (const system of value.systems) {
			if (!system || typeof system.systemId !== "string" || system.schemaVersion !== 1 || !system.state || typeof system.state !== "object" || Array.isArray(system.state)) throw new Error("Malformed system settings");
			if (!this.definitions.has(system.systemId) || ids.has(system.systemId)) throw new Error(`Unknown or duplicate system '${system.systemId}'`);
			assertJsonValue(system.state);
			ids.add(system.systemId);
		}
		if (value.systemOrder.length !== ids.size || new Set(value.systemOrder).size !== ids.size || value.systemOrder.some(id => !ids.has(id))) throw new Error("Invalid framework system order");
		const expected = this.select(value.systemOrder).systemOrder;
		if (expected.join("|") !== value.systemOrder.join("|")) throw new Error("Framework system order violates dependencies");
	}

	/** Validates data Effects against the selected systems' capabilities and contracts. */
	public validateEffectSupport(settings: unknown, effects: readonly unknown[], catalog: EngineEffectRegistry): void {
		this.validate(settings);
		const selected = new Set((settings as EngineFrameworkSettings).systemOrder);
		const definitions = [...selected].map(id => this.definitions.get(id)!);
		for (const effect of effects) {
			catalog.validate(effect);
			const typed = effect as EngineEffectSettings;
			const definition = catalog.get(typed.type)!;
			const accepted = definitions.some(candidate => candidate.acceptsEffects?.includes(typed.type) === true);
			if (!accepted) throw new Error(`No selected system accepts effect '${typed.type}'`);
			for (const capability of definition.requiresCapability ?? []) {
				if (!definitions.some(candidate => provides(candidate, capability))) throw new Error(`Effect '${typed.type}' requires missing capability '${capability}'`);
			}
		}
	}
}

function validateDefinition(definition: EngineSystemDefinition): void {
	if (!definition || typeof definition.id !== "string" || !/^[a-z0-9.-]{1,80}$/.test(definition.id)) throw new Error("Invalid system definition ID");
	if (definition.schemaVersion !== undefined && definition.schemaVersion !== 1) throw new Error("Unsupported system definition version");
	for (const list of [definition.provides, definition.requires, definition.before, definition.after, definition.replaces]) {
		if (list !== undefined && (!Array.isArray(list) || list.some(value => typeof value !== "string" || value.length === 0))) throw new Error(`Invalid system definition '${definition.id}'`);
	}
	if (definition.acceptsEffects !== undefined && (!Array.isArray(definition.acceptsEffects) || definition.acceptsEffects.some(value => typeof value !== "string" || value.length === 0))) throw new Error(`Invalid accepted Effects for '${definition.id}'`);
	assertJsonValue(definition.state ?? {});
}

function provides(definition: EngineSystemDefinition, capability: string): boolean {
	return definition.id === capability || definition.provides?.includes(capability) === true;
}

function validateReplacements(definitions: EngineSystemDefinition[]): void {
	for (const definition of definitions) {
		for (const capability of definition.replaces ?? []) {
			const conflicts = definitions.filter(candidate => candidate.id !== definition.id && provides(candidate, capability) && !definition.replaces?.includes(capability) && !(definition.replaces?.includes(candidate.id) || candidate.replaces?.includes(definition.id)));
			if (conflicts.length > 0) throw new Error(`System '${definition.id}' conflicts with '${conflicts[0]!.id}' for '${capability}'`);
		}
	}
	const capabilities = new Set(definitions.flatMap(definition => [definition.id, ...(definition.provides ?? [])]));
	for (const capability of capabilities) {
		const providers = definitions.filter(definition => provides(definition, capability));
		if (providers.length > 1 && !providers.some(definition => definition.replaces?.includes(capability))) throw new Error(`Multiple selected providers for '${capability}'`);
	}
}

function topologicalOrder(definitions: EngineSystemDefinition[]): EngineSystemDefinition[] {
	const byId = new Map(definitions.map(definition => [definition.id, definition]));
	const edges = new Map<string, Set<string>>(definitions.map(definition => [definition.id, new Set<string>()]));
	for (const definition of definitions) {
		for (const dependency of definition.after ?? []) if (byId.has(dependency)) edges.get(dependency)!.add(definition.id);
		for (const dependency of definition.before ?? []) if (byId.has(dependency)) edges.get(definition.id)!.add(dependency);
		for (const capability of definition.requires ?? []) {
			const provider = definitions.find(candidate => candidate.id !== definition.id && provides(candidate, capability));
			if (provider) edges.get(provider.id)!.add(definition.id);
		}
	}
	const incoming = new Map(definitions.map(definition => [definition.id, 0]));
	for (const targets of edges.values()) for (const target of targets) incoming.set(target, incoming.get(target)! + 1);
	const available = definitions.filter(definition => incoming.get(definition.id) === 0).map(definition => definition.id).sort();
	const result: EngineSystemDefinition[] = [];
	while (available.length) {
		const id = available.shift()!;
		result.push(byId.get(id)!);
		for (const target of edges.get(id)!) {
			incoming.set(target, incoming.get(target)! - 1);
			if (incoming.get(target) === 0) { available.push(target); available.sort(); }
		}
	}
	if (result.length !== definitions.length) throw new Error("System dependencies contain a cycle");
	return result;
}

function clone<T>(value: T): T { return structuredClone(value); }
