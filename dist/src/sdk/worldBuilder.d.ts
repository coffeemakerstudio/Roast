import { type JsonValue } from "../contracts/systemSettings.js";
import { type CounterState } from "../contracts/counterState.js";
import type { EngineFrameworkSettings } from "./systemRegistry.js";
/** Generic JSON-safe world settings with no KORE gameplay assumptions. */
export interface EngineWorldSettings {
    schemaVersion: 1;
    id: string;
    worldSize: {
        x: number;
        y: number;
    };
    background?: JsonValue;
    entities: JsonValue[];
    structures: JsonValue[];
    effects: JsonValue[];
    counters: CounterState[];
    framework?: EngineFrameworkSettings;
}
/** Generic authoring builder for worlds, entities, structures, and framework metadata. */
export declare class EngineWorldBuilder {
    private readonly id;
    private readonly worldSize;
    private readonly entities;
    private readonly structures;
    private readonly effects;
    private readonly counters;
    private background;
    private framework;
    constructor(id: string, worldSize: {
        x: number;
        y: number;
    });
    setBackground(background: JsonValue): this;
    addEntity(entity: JsonValue): this;
    addStructure(structure: JsonValue): this;
    addEffect(effect: JsonValue): this;
    addCounter(counter: CounterState): this;
    useFramework(framework: EngineFrameworkSettings): this;
    build(): EngineWorldSettings;
    buildJson(space?: number): string;
}
