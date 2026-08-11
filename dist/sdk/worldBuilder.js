import { assertJsonValue } from "../contracts/systemSettings.js";
import { canonicalizeCounterStates } from "../contracts/counterState.js";
/** Generic authoring builder for worlds, entities, structures, and framework metadata. */
export class EngineWorldBuilder {
    id;
    worldSize;
    entities = [];
    structures = [];
    effects = [];
    counters = [];
    background;
    framework;
    constructor(id, worldSize) {
        this.id = id;
        this.worldSize = worldSize;
        if (!id || !isPositiveVector(worldSize))
            throw new Error("A world requires an ID and positive finite worldSize");
    }
    setBackground(background) { assertJsonValue(background); this.background = clone(background); return this; }
    addEntity(entity) { assertJsonValue(entity); this.entities.push(clone(entity)); return this; }
    addStructure(structure) { assertJsonValue(structure); this.structures.push(clone(structure)); return this; }
    addEffect(effect) { assertJsonValue(effect); this.effects.push(clone(effect)); return this; }
    addCounter(counter) { this.counters.push(...canonicalizeCounterStates([counter])); return this; }
    useFramework(framework) { this.framework = clone(framework); return this; }
    build() {
        return { schemaVersion: 1, id: this.id, worldSize: clone(this.worldSize), ...(this.background === undefined ? {} : { background: clone(this.background) }), entities: clone(this.entities), structures: clone(this.structures), effects: clone(this.effects), counters: canonicalizeCounterStates(this.counters), ...(this.framework ? { framework: clone(this.framework) } : {}) };
    }
    buildJson(space = 2) { return JSON.stringify(this.build(), null, space); }
}
function isPositiveVector(value) { return Number.isFinite(value.x) && value.x > 0 && Number.isFinite(value.y) && value.y > 0; }
function clone(value) { return structuredClone(value); }
