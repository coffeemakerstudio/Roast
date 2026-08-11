import { assertJsonValue, type JsonValue } from "../contracts/systemSettings.js";
import { canonicalizeCounterStates, type CounterState } from "../contracts/counterState.js";
import type { EngineFrameworkSettings } from "./systemRegistry.js";

/** Generic JSON-safe world settings with no KORE gameplay assumptions. */
export interface EngineWorldSettings {
	schemaVersion: 1;
	id: string;
	worldSize: { x: number; y: number };
	background?: JsonValue;
	entities: JsonValue[];
	structures: JsonValue[];
	effects: JsonValue[];
	counters: CounterState[];
	framework?: EngineFrameworkSettings;
}

/** Generic authoring builder for worlds, entities, structures, and framework metadata. */
export class EngineWorldBuilder {
	private readonly entities: JsonValue[] = [];
	private readonly structures: JsonValue[] = [];
	private readonly effects: JsonValue[] = [];
	private readonly counters: CounterState[] = [];
	private background: JsonValue | undefined;
	private framework: EngineFrameworkSettings | undefined;

	public constructor(private readonly id: string, private readonly worldSize: { x: number; y: number }) {
		if (!id || !isPositiveVector(worldSize)) throw new Error("A world requires an ID and positive finite worldSize");
	}
	public setBackground(background: JsonValue): this { assertJsonValue(background); this.background = clone(background); return this; }
	public addEntity(entity: JsonValue): this { assertJsonValue(entity); this.entities.push(clone(entity)); return this; }
	public addStructure(structure: JsonValue): this { assertJsonValue(structure); this.structures.push(clone(structure)); return this; }
	public addEffect(effect: JsonValue): this { assertJsonValue(effect); this.effects.push(clone(effect)); return this; }
	public addCounter(counter: CounterState): this { this.counters.push(...canonicalizeCounterStates([counter])); return this; }
	public useFramework(framework: EngineFrameworkSettings): this { this.framework = clone(framework); return this; }
	public build(): EngineWorldSettings {
		return { schemaVersion: 1, id: this.id, worldSize: clone(this.worldSize), ...(this.background === undefined ? {} : { background: clone(this.background) }), entities: clone(this.entities), structures: clone(this.structures), effects: clone(this.effects), counters: canonicalizeCounterStates(this.counters), ...(this.framework ? { framework: clone(this.framework) } : {}) };
	}
	public buildJson(space: number = 2): string { return JSON.stringify(this.build(), null, space); }
}

function isPositiveVector(value: { x: number; y: number }): boolean { return Number.isFinite(value.x) && value.x > 0 && Number.isFinite(value.y) && value.y > 0; }
function clone<T>(value: T): T { return structuredClone(value); }
