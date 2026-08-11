import { engine, EngineSystemRegistry } from "../sdk/index.js";
import { assertJsonValue } from "../contracts/systemSettings.js";
const DEFAULT_BUSES = [
    { id: "master", volume: 1, muted: false, maxVoices: 64, defaultPriority: 0, paused: false },
    { id: "music", volume: 1, muted: false, maxVoices: 1, defaultPriority: 50, paused: false },
    { id: "ambience", volume: 1, muted: false, maxVoices: 8, defaultPriority: 20, paused: false },
    { id: "effects", volume: 1, muted: false, maxVoices: 32, defaultPriority: 10, paused: false },
    { id: "ui", volume: 1, muted: false, maxVoices: 8, defaultPriority: 30, paused: false },
    { id: "voice", volume: 1, muted: false, maxVoices: 8, defaultPriority: 40, paused: false },
];
/** Detached queue capability for any entity, UI object, or KORE adapter. */
export class AudioEmitter {
    soundSourceId;
    pending = [];
    constructor(soundSourceId) {
        this.soundSourceId = soundSourceId;
        validateId(soundSourceId, "sound source ID");
    }
    emit(command) { validateAudioCommand(command); if (command.sourceId !== this.soundSourceId)
        throw new Error(`Audio command source '${command.sourceId}' does not match emitter '${this.soundSourceId}'`); this.pending.push(clone(command)); }
    drainSoundCommands() { const commands = this.pending.map(clone); this.pending = []; return commands; }
}
/** Generic deterministic collector. It never calls an output port or browser API. */
export class SoundSystem {
    runtimeId;
    buses = new Map();
    persistent = new Map();
    pending = [];
    output;
    sequence;
    constructor(runtimeId, settings = { buses: clone(DEFAULT_BUSES), persistentSources: [] }) {
        this.runtimeId = runtimeId;
        validateId(runtimeId, "runtime ID");
        for (const bus of settings.buses) {
            validateBus(bus);
            if (this.buses.has(bus.id))
                throw new Error(`Duplicate audio bus '${bus.id}'`);
            this.buses.set(bus.id, clone(bus));
        }
        if (!this.buses.has("master"))
            this.buses.set("master", clone(DEFAULT_BUSES[0]));
        for (const source of settings.persistentSources) {
            validatePersistentSource(source, this.buses);
            if (this.persistent.has(source.sourceId))
                throw new Error(`Duplicate persistent audio source '${source.sourceId}'`);
            this.persistent.set(source.sourceId, clone(source));
        }
        this.sequence = settings.sequence ?? 0;
        this.output = emptyBatch(runtimeId, this.sequence, this.diagnostics());
    }
    submit(command) { validateAudioCommand(command); this.pending.push(clone(command)); }
    tick(candidates) {
        const collected = [];
        let ordinal = 0;
        for (const candidate of candidates.filter(isSoundEmitter).sort((a, b) => a.soundSourceId.localeCompare(b.soundSourceId))) {
            for (const command of candidate.drainSoundCommands())
                collected.push({ command, ordinal: ordinal++ });
        }
        for (const command of this.pending.splice(0))
            collected.push({ command, ordinal: ordinal++ });
        const result = this.aggregate(collected);
        this.output = { schemaVersion: 1, runtimeId: this.runtimeId, sequence: ++this.sequence, commands: result.commands, diagnostics: { ...this.diagnostics(), ...result.diagnostics, sequence: this.sequence } };
    }
    drainOutput() { const value = clone(this.output); this.output = emptyBatch(this.runtimeId, this.sequence, this.diagnostics()); return value; }
    /** Re-emits persistent intent only when a host explicitly requests restoration. */
    restorePersistentIntent() { for (const source of [...this.persistent.values()].sort((a, b) => a.sourceId.localeCompare(b.sourceId)))
        this.pending.push(clone(source.command)); }
    toSettings(framework = createDefaultAudioFramework()) {
        const settings = { schemaVersion: 1, runtimeId: this.runtimeId, buses: [...this.buses.values()].sort(byBus).map(clone), persistentSources: [...this.persistent.values()].sort((a, b) => a.sourceId.localeCompare(b.sourceId)).map(clone), framework: clone(framework), sequence: this.sequence };
        validateAudioSettings(settings);
        return settings;
    }
    getDiagnostics() { return clone(this.diagnostics()); }
    aggregate(collected) {
        let rejected = 0;
        let deduplicated = 0;
        let droppedByPriority = 0;
        const valid = [];
        for (const entry of collected) {
            try {
                validateAudioCommand(entry.command);
                validateBusReference(entry.command, this.buses);
                valid.push(entry);
            }
            catch {
                rejected++;
            }
        }
        const dedupe = new Map();
        const retained = [];
        for (const entry of valid) {
            const key = entry.command.type === "playSound" && entry.command.dedupeKey ? `${entry.command.sourceId}|${entry.command.dedupeKey}` : undefined;
            if (!key) {
                retained.push(entry);
                continue;
            }
            const prior = dedupe.get(key);
            if (!prior || compareCommand(entry.command, prior.command, entry.ordinal, prior.ordinal, this.buses) < 0) {
                if (prior)
                    deduplicated++;
                dedupe.set(key, entry);
            }
            else
                deduplicated++;
        }
        retained.push(...dedupe.values());
        const admitted = [];
        for (const [busId, entries] of groupBy(retained.filter(entry => isVoiceCommand(entry.command)), entry => commandBus(entry.command)).entries()) {
            const bus = this.buses.get(busId);
            const ordered = entries.sort((a, b) => compareCommand(a.command, b.command, a.ordinal, b.ordinal, this.buses));
            admitted.push(...ordered.slice(0, bus.maxVoices));
            droppedByPriority += Math.max(0, ordered.length - bus.maxVoices);
        }
        admitted.push(...retained.filter(entry => !isVoiceCommand(entry.command)));
        for (const entry of admitted)
            this.applyPersistent(entry.command);
        const commands = admitted.sort((a, b) => comparePipeline(a.command, b.command, a.ordinal, b.ordinal, this.buses)).map(entry => this.resolve(entry.command));
        return { commands, diagnostics: { collected: collected.length, rejected, deduplicated, droppedByPriority } };
    }
    resolve(command) { return { ...clone(command), runtimeId: this.runtimeId, globalSourceId: `${this.runtimeId}:${command.sourceId}`, sequence: this.sequence + 1 }; }
    applyPersistent(command) {
        if (command.type === "startLoop" || command.type === "playMusic")
            this.persistent.set(command.sourceId, { sourceId: command.sourceId, command: clone(command) });
        if (command.type === "stopSource")
            this.persistent.delete(command.sourceId);
        if (command.type === "stopMusic")
            for (const [id, source] of this.persistent)
                if (source.command.type === "playMusic" && (!command.sourceId || command.sourceId === id))
                    this.persistent.delete(id);
        if (command.type === "stopAll")
            this.persistent.clear();
        if (command.type === "setBusVolume") {
            const bus = this.buses.get(command.bus);
            bus.volume = command.volume;
            if (command.muted !== undefined)
                bus.muted = command.muted;
        }
        if (command.type === "pauseBus" || command.type === "resumeBus")
            this.buses.get(command.bus).paused = command.type === "pauseBus";
    }
    diagnostics() { return { collected: 0, rejected: 0, deduplicated: 0, droppedByPriority: 0, activePersistentSources: [...this.persistent.keys()].sort(), outputStatus: "ready", sequence: this.sequence }; }
}
/** Explicit runtime lifecycle wrapper around the generic sound system. */
export class AudioRuntime {
    system;
    framework;
    constructor(settings) { validateAudioSettings(settings); this.framework = clone(settings.framework); this.system = new SoundSystem(settings.runtimeId, settings); }
    tick(emitters) { this.system.tick(emitters); }
    submit(command) { this.system.submit(command); }
    drainOutput() { return this.system.drainOutput(); }
    restorePersistentIntent() { this.system.restorePersistentIntent(); }
    toSettings() { return this.system.toSettings(this.framework); }
    getDiagnostics() { return this.system.getDiagnostics(); }
}
/** Application-level merge point: many runtimes, one explicit output batch. */
export class ApplicationAudioMixer {
    applicationId;
    buses = new Map();
    pending = [];
    activeMusic;
    sequence;
    constructor(applicationId, settings = { buses: clone(DEFAULT_BUSES) }) {
        this.applicationId = applicationId;
        validateId(applicationId, "application ID");
        for (const bus of settings.buses) {
            validateBus(bus);
            if (this.buses.has(bus.id))
                throw new Error(`Duplicate audio bus '${bus.id}'`);
            this.buses.set(bus.id, clone(bus));
        }
        if (!this.buses.has("master"))
            this.buses.set("master", clone(DEFAULT_BUSES[0]));
        if (settings.activeMusic) {
            validateResolvedCommand(settings.activeMusic);
            this.activeMusic = clone(settings.activeMusic);
        }
        this.sequence = settings.sequence ?? 0;
    }
    submit(batch) { validateAudioBatch(batch); this.pending.push(clone(batch)); }
    flush() {
        const submitted = this.pending.splice(0).flatMap(batch => batch.commands);
        const rejected = submitted.filter(command => "bus" in command && command.bus !== undefined && !this.buses.has(command.bus)).length;
        const incoming = submitted.filter(command => !("bus" in command && command.bus !== undefined && !this.buses.has(command.bus))).sort((a, b) => compareResolved(a, b, this.buses));
        const controls = incoming.filter(command => !isVoiceCommand(command));
        for (const command of controls)
            this.applyControl(command);
        const voices = incoming.filter(isVoiceCommand);
        const music = voices.filter((command) => command.type === "playMusic");
        const nonMusic = this.limitVoices(voices.filter(command => command.type !== "playMusic"));
        const previousMusic = this.activeMusic;
        const selectedMusic = this.selectMusic(music);
        const replacedMusic = selectedMusic && previousMusic && previousMusic.globalSourceId !== selectedMusic.globalSourceId
            ? [{ type: "stopSource", sourceId: previousMusic.sourceId, runtimeId: previousMusic.runtimeId, globalSourceId: previousMusic.globalSourceId, sequence: this.sequence + 1 }]
            : [];
        const commands = [...controls, ...replacedMusic, ...nonMusic, ...(selectedMusic ? [selectedMusic] : [])].sort((a, b) => compareResolved(a, b, this.buses));
        const diagnostics = { collected: submitted.length, rejected, deduplicated: 0, droppedByPriority: Math.max(0, voices.filter(command => command.type !== "playMusic").length - nonMusic.length) + Math.max(0, music.length - (selectedMusic ? 1 : 0)), activePersistentSources: this.activeMusic ? [this.activeMusic.globalSourceId] : [], activeMusicSourceId: this.activeMusic?.globalSourceId, outputStatus: "ready", sequence: ++this.sequence };
        return { schemaVersion: 1, runtimeId: this.applicationId, sequence: this.sequence, commands: commands.map(command => ({ ...command, sequence: this.sequence })), diagnostics };
    }
    toSettings() { const settings = { schemaVersion: 1, applicationId: this.applicationId, buses: [...this.buses.values()].sort(byBus).map(clone), ...(this.activeMusic ? { activeMusic: clone(this.activeMusic) } : {}), sequence: this.sequence }; validateApplicationAudioSettings(settings); return settings; }
    limitVoices(commands) { const result = []; for (const [busId, entries] of groupBy(commands, command => commandBus(command)).entries())
        result.push(...entries.sort((a, b) => compareResolved(a, b, this.buses)).slice(0, this.buses.get(busId).maxVoices)); return result; }
    selectMusic(candidates) {
        const ordered = candidates.sort((a, b) => compareResolved(a, b, this.buses));
        for (const candidate of ordered) {
            const policy = candidate.replacementPolicy ?? "replace-lower-or-equal";
            const currentPriority = this.activeMusic ? resolvedPriority(this.activeMusic, this.buses) : -Infinity;
            const priority = resolvedPriority(candidate, this.buses);
            if (!this.activeMusic || policy === "replace-current" || (policy === "replace-lower-or-equal" && priority >= currentPriority) || (policy === "keep-current" && !this.activeMusic)) {
                this.activeMusic = clone(candidate);
                return candidate;
            }
        }
        return undefined;
    }
    applyControl(command) {
        if (command.type === "stopMusic" && (!command.sourceId || this.activeMusic?.globalSourceId === `${command.runtimeId}:${command.sourceId}`))
            this.activeMusic = undefined;
        if (command.type === "stopSource" && this.activeMusic?.globalSourceId === `${command.runtimeId}:${command.sourceId}`)
            this.activeMusic = undefined;
        if (command.type === "stopAll")
            this.activeMusic = undefined;
        if (command.type === "setBusVolume") {
            const bus = this.buses.get(command.bus);
            if (bus) {
                bus.volume = command.volume;
                if (command.muted !== undefined)
                    bus.muted = command.muted;
            }
        }
        if (command.type === "pauseBus" || command.type === "resumeBus") {
            const bus = this.buses.get(command.bus);
            if (bus)
                bus.paused = command.type === "pauseBus";
        }
    }
}
export function createDefaultAudioFramework() {
    const registry = new EngineSystemRegistry().register({ id: "audio.collect", provides: ["audio.commands"] }).register({ id: "audio.mix", requires: ["audio.commands"], after: ["audio.collect"], provides: ["audio.batch"] });
    return registry.select(["audio.collect", "audio.mix"]);
}
export function createAudioRuntime(settings) { return new AudioRuntime(settings); }
export function createAudioSettings(options) {
    return { schemaVersion: 1, runtimeId: options.runtimeId, buses: clone(options.buses ?? DEFAULT_BUSES), persistentSources: clone(options.persistentSources ?? []), framework: createDefaultAudioFramework(), sequence: 0 };
}
export function validateAudioSettings(value) {
    if (!value || typeof value !== "object" || Array.isArray(value))
        throw new Error("Malformed audio settings");
    const settings = value;
    if (settings.schemaVersion !== 1 || typeof settings.runtimeId !== "string" || !Array.isArray(settings.buses) || !Array.isArray(settings.persistentSources) || !settings.framework || typeof settings.sequence !== "number" || !Number.isSafeInteger(settings.sequence) || settings.sequence < 0)
        throw new Error("Malformed audio settings");
    const sequence = settings.sequence;
    validateId(settings.runtimeId, "runtime ID");
    const buses = new Map();
    for (const bus of settings.buses) {
        validateBus(bus);
        if (buses.has(bus.id))
            throw new Error(`Duplicate audio bus '${bus.id}'`);
        buses.set(bus.id, bus);
    }
    if (!buses.has("master"))
        throw new Error("Audio settings require a master bus");
    const sources = new Set();
    for (const source of settings.persistentSources) {
        validatePersistentSource(source, buses);
        if (sources.has(source.sourceId))
            throw new Error(`Duplicate persistent audio source '${source.sourceId}'`);
        sources.add(source.sourceId);
    }
    const registry = new EngineSystemRegistry().register({ id: "audio.collect", provides: ["audio.commands"] }).register({ id: "audio.mix", requires: ["audio.commands"], after: ["audio.collect"], provides: ["audio.batch"] });
    registry.validate(settings.framework);
    if (sequence < 0)
        throw new Error("Invalid audio sequence");
    assertJsonValue(settings);
}
export function validateApplicationAudioSettings(value) {
    if (!value || typeof value !== "object" || Array.isArray(value))
        throw new Error("Malformed application audio settings");
    const settings = value;
    if (settings.schemaVersion !== 1 || typeof settings.applicationId !== "string" || !Array.isArray(settings.buses) || typeof settings.sequence !== "number" || !Number.isSafeInteger(settings.sequence) || settings.sequence < 0)
        throw new Error("Malformed application audio settings");
    const sequence = settings.sequence;
    validateId(settings.applicationId, "application ID");
    const ids = new Set();
    for (const bus of settings.buses) {
        validateBus(bus);
        if (ids.has(bus.id))
            throw new Error(`Duplicate audio bus '${bus.id}'`);
        ids.add(bus.id);
    }
    if (!ids.has("master"))
        throw new Error("Application audio settings require a master bus");
    if (settings.activeMusic)
        validateResolvedCommand(settings.activeMusic);
    if (sequence < 0)
        throw new Error("Invalid audio sequence");
    assertJsonValue(settings);
}
export function validateAudioCommand(value) {
    if (!value || typeof value !== "object" || Array.isArray(value))
        throw new Error("Malformed audio command");
    const command = value;
    if (typeof command.type !== "string" || !COMMAND_TYPES.has(command.type))
        throw new Error("Unknown audio command");
    if (command.type !== "stopMusic")
        validateId(command.sourceId, "audio source ID");
    else if (command.sourceId !== undefined)
        validateId(command.sourceId, "audio source ID");
    if ("soundId" in command)
        validateId(command.soundId, "sound ID");
    if ("bus" in command && command.bus !== undefined)
        validateId(command.bus, "audio bus ID");
    if ("instanceId" in command && command.instanceId !== undefined)
        validateId(command.instanceId, "audio instance ID");
    if ("dedupeKey" in command && command.dedupeKey !== undefined)
        validateId(command.dedupeKey, "audio dedupe key");
    for (const name of ["volume", "pitch", "pan", "fadeInMs", "fadeOutMs", "priority"]) {
        const numeric = command[name];
        if (numeric !== undefined && (typeof numeric !== "number" || !Number.isFinite(numeric) || (name === "volume" && (numeric < 0 || numeric > 1)) || (name === "pitch" && numeric <= 0) || (name === "pan" && (numeric < -1 || numeric > 1)) || ((name === "fadeInMs" || name === "fadeOutMs") && numeric < 0) || (name === "priority" && !Number.isInteger(numeric))))
            throw new Error(`Invalid audio ${name}`);
    }
    if (command.type === "playMusic" && command.replacementPolicy !== undefined && !["replace-current", "replace-lower-or-equal", "keep-current"].includes(command.replacementPolicy))
        throw new Error("Invalid music replacement policy");
    assertJsonValue(command);
}
export function validateAudioBatch(value) {
    if (!value || typeof value !== "object" || Array.isArray(value))
        throw new Error("Malformed audio batch");
    const batch = value;
    if (batch.schemaVersion !== 1 || typeof batch.runtimeId !== "string" || typeof batch.sequence !== "number" || !Number.isSafeInteger(batch.sequence) || batch.sequence < 0 || !Array.isArray(batch.commands) || !batch.diagnostics)
        throw new Error("Malformed audio batch");
    const sequence = batch.sequence;
    validateId(batch.runtimeId, "runtime ID");
    for (const command of batch.commands)
        validateResolvedCommand(command);
    if (sequence < 0)
        throw new Error("Invalid audio sequence");
    assertJsonValue(batch);
}
export const audio = {
    engine: { createSystemRegistry: engine.createSystemRegistry },
    createSettings: createAudioSettings, createRuntime: createAudioRuntime, createApplicationMixer(applicationId, settings) { return new ApplicationAudioMixer(applicationId, settings); }, createDefaultFramework: createDefaultAudioFramework,
    emitter(sourceId) { return new AudioEmitter(sourceId); },
    bus(settings) { validateBus(settings); return clone(settings); },
    command: {
        play(settings) { return { type: "playSound", ...clone(settings) }; }, loop(settings) { return { type: "startLoop", ...clone(settings) }; }, music(settings) { return { type: "playMusic", ...clone(settings) }; }, stopSource(settings) { return { type: "stopSource", ...clone(settings) }; }, stopInstance(settings) { return { type: "stopInstance", ...clone(settings) }; }, stopMusic(settings = {}) { return { type: "stopMusic", ...clone(settings) }; }, setBusVolume(settings) { return { type: "setBusVolume", ...clone(settings) }; }, pauseBus(settings) { return { type: "pauseBus", ...clone(settings) }; }, resumeBus(settings) { return { type: "resumeBus", ...clone(settings) }; }, stopAll(settings) { return { type: "stopAll", ...clone(settings) }; },
    },
    validate: validateAudioSettings, validateCommand: validateAudioCommand, validateBatch: validateAudioBatch,
};
const COMMAND_TYPES = new Set(["playSound", "startLoop", "playMusic", "stopSource", "stopInstance", "stopMusic", "pauseBus", "resumeBus", "setBusVolume", "stopAll"]);
function isSoundEmitter(value) { return !!value && typeof value === "object" && typeof value.soundSourceId === "string" && typeof value.drainSoundCommands === "function"; }
function validateId(value, name) { if (typeof value !== "string" || !/^[a-zA-Z0-9._:-]{1,120}$/.test(value))
    throw new Error(`Invalid ${name}`); }
function validateBus(value) { if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Malformed audio bus"); const bus = value; validateId(bus.id, "audio bus ID"); const volume = bus.volume; const maxVoices = bus.maxVoices; if (typeof volume !== "number" || !Number.isFinite(volume) || volume < 0 || volume > 1 || typeof bus.muted !== "boolean" || typeof maxVoices !== "number" || !Number.isSafeInteger(maxVoices) || maxVoices < 1 || !Number.isSafeInteger(bus.defaultPriority) || typeof bus.paused !== "boolean")
    throw new Error(`Invalid audio bus '${bus.id}'`); assertJsonValue(bus); }
function validatePersistentSource(value, buses) { if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Malformed persistent audio source"); const source = value; validateId(source.sourceId, "persistent source ID"); validateAudioCommand(source.command); if (source.command.type !== "startLoop" && source.command.type !== "playMusic")
    throw new Error("Persistent audio source must be a loop or music command"); if (source.command.sourceId !== source.sourceId)
    throw new Error("Persistent audio source ID mismatch"); validateBusReference(source.command, buses); }
function validateBusReference(command, buses) { if ("bus" in command && command.bus !== undefined && !buses.has(command.bus))
    throw new Error(`Unknown audio bus '${command.bus}'`); }
function validateResolvedCommand(value) { validateAudioCommand(value); const command = value; validateId(command.runtimeId, "runtime ID"); validateId(command.globalSourceId, "global audio source ID"); const sequence = command.sequence; if (typeof sequence !== "number" || !Number.isSafeInteger(sequence) || sequence < 0)
    throw new Error("Invalid audio sequence"); }
function commandBus(command) { return "bus" in command && command.bus ? command.bus : command.type === "playMusic" ? "music" : "effects"; }
function isVoiceCommand(command) { return command.type === "playSound" || command.type === "startLoop" || command.type === "playMusic"; }
function resolvedPriority(command, buses) { return command.priority ?? buses.get(commandBus(command))?.defaultPriority ?? 0; }
function compareCommand(a, b, aOrdinal, bOrdinal, buses) { return (resolvedPriority(b, buses) - resolvedPriority(a, buses)) || commandBus(a).localeCompare(commandBus(b)) || (a.sourceId ?? "").localeCompare(b.sourceId ?? "") || ("soundId" in a ? a.soundId : "").localeCompare("soundId" in b ? b.soundId : "") || aOrdinal - bOrdinal; }
function pipelineOrder(command) { if (command.type === "stopAll" || command.type === "pauseBus" || command.type === "resumeBus" || command.type === "setBusVolume")
    return 0; if (command.type === "stopSource" || command.type === "stopInstance" || command.type === "stopMusic")
    return 1; if (command.type === "playMusic")
    return 2; if (command.type === "startLoop")
    return 3; return 4; }
function comparePipeline(a, b, aOrdinal, bOrdinal, buses) { return pipelineOrder(a) - pipelineOrder(b) || compareCommand(a, b, aOrdinal, bOrdinal, buses); }
function compareResolved(a, b, buses) { return pipelineOrder(a) - pipelineOrder(b) || (resolvedPriority(b, buses) - resolvedPriority(a, buses)) || a.globalSourceId.localeCompare(b.globalSourceId) || ("soundId" in a ? a.soundId : "").localeCompare("soundId" in b ? b.soundId : "") || a.sequence - b.sequence; }
function byBus(a, b) { return a.id.localeCompare(b.id); }
function emptyBatch(runtimeId, sequence, diagnostics) { return { schemaVersion: 1, runtimeId, sequence, commands: [], diagnostics: { ...diagnostics, sequence } }; }
function groupBy(items, key) { const grouped = new Map(); for (const item of items) {
    const id = key(item);
    const values = grouped.get(id) ?? [];
    values.push(item);
    grouped.set(id, values);
} return grouped; }
function clone(value) { return structuredClone(value); }
