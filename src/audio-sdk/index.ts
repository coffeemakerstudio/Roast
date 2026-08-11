import { engine, EngineSystemRegistry, type EngineFrameworkSettings } from "../sdk/index.js";
import { assertJsonValue } from "../contracts/systemSettings.js";

export type AudioOutputStatus = "locked" | "ready" | "suspended" | "failed";
export type AudioReplacementPolicy = "replace-current" | "replace-lower-or-equal" | "keep-current";
export type AudioBusSettings = { id: string; volume: number; muted: boolean; maxVoices: number; defaultPriority: number; paused: boolean };

type AudioCommandBase = { sourceId: string; bus?: string; priority?: number; dedupeKey?: string; instanceId?: string };
export type PlaySoundCommand = AudioCommandBase & { type: "playSound"; soundId: string; volume?: number; pitch?: number; pan?: number };
export type StartLoopCommand = AudioCommandBase & { type: "startLoop"; soundId: string; volume?: number; pitch?: number; pan?: number; fadeInMs?: number };
export type PlayMusicCommand = AudioCommandBase & { type: "playMusic"; soundId: string; volume?: number; fadeInMs?: number; replacementPolicy?: AudioReplacementPolicy };
export type StopSourceCommand = { type: "stopSource"; sourceId: string; fadeOutMs?: number };
export type StopInstanceCommand = { type: "stopInstance"; sourceId: string; instanceId: string; fadeOutMs?: number };
export type StopMusicCommand = { type: "stopMusic"; sourceId?: string; fadeOutMs?: number };
export type PauseBusCommand = { type: "pauseBus"; sourceId: string; bus: string };
export type ResumeBusCommand = { type: "resumeBus"; sourceId: string; bus: string };
export type SetBusVolumeCommand = { type: "setBusVolume"; sourceId: string; bus: string; volume: number; muted?: boolean };
export type StopAllCommand = { type: "stopAll"; sourceId: string; fadeOutMs?: number };
export type AudioCommand = PlaySoundCommand | StartLoopCommand | PlayMusicCommand | StopSourceCommand | StopInstanceCommand | StopMusicCommand | PauseBusCommand | ResumeBusCommand | SetBusVolumeCommand | StopAllCommand;
export type ResolvedAudioCommand = AudioCommand & { runtimeId: string; globalSourceId: string; sequence: number };

export interface ISoundSource { readonly soundSourceId: string; }
export interface ISoundEmitter extends ISoundSource { drainSoundCommands(): AudioCommand[]; }
export interface IAudioPosition { readonly x: number; readonly y: number; }
export interface IAudioVelocity { readonly vx: number; readonly vy: number; }
export interface IAudioListener { readonly listenerId: string; readonly position: IAudioPosition; }
export interface IAudioPriority { readonly audioPriority: number; }
export interface AudioOutputPort { apply(batch: Readonly<AudioCommandBatch>): void; }

export type AudioPersistentSourceSettings = { sourceId: string; command: StartLoopCommand | PlayMusicCommand };
export type AudioRuntimeSettings = {
	schemaVersion: 1;
	runtimeId: string;
	buses: AudioBusSettings[];
	persistentSources: AudioPersistentSourceSettings[];
	framework: EngineFrameworkSettings;
	sequence: number;
};
export type AudioApplicationSettings = {
	schemaVersion: 1;
	applicationId: string;
	buses: AudioBusSettings[];
	activeMusic?: ResolvedAudioCommand;
	sequence: number;
};
export type AudioDiagnostics = { collected: number; rejected: number; deduplicated: number; droppedByPriority: number; activePersistentSources: string[]; activeMusicSourceId?: string; outputStatus: AudioOutputStatus; sequence: number };
export type AudioCommandBatch = { schemaVersion: 1; runtimeId: string; sequence: number; commands: ResolvedAudioCommand[]; diagnostics: AudioDiagnostics };

const DEFAULT_BUSES: AudioBusSettings[] = [
	{ id: "master", volume: 1, muted: false, maxVoices: 64, defaultPriority: 0, paused: false },
	{ id: "music", volume: 1, muted: false, maxVoices: 1, defaultPriority: 50, paused: false },
	{ id: "ambience", volume: 1, muted: false, maxVoices: 8, defaultPriority: 20, paused: false },
	{ id: "effects", volume: 1, muted: false, maxVoices: 32, defaultPriority: 10, paused: false },
	{ id: "ui", volume: 1, muted: false, maxVoices: 8, defaultPriority: 30, paused: false },
	{ id: "voice", volume: 1, muted: false, maxVoices: 8, defaultPriority: 40, paused: false },
];

/** Detached queue capability for any entity, UI object, or KORE adapter. */
export class AudioEmitter implements ISoundEmitter {
	private pending: AudioCommand[] = [];
	public constructor(public readonly soundSourceId: string) { validateId(soundSourceId, "sound source ID"); }
	public emit(command: AudioCommand): void { validateAudioCommand(command); if (command.sourceId !== this.soundSourceId) throw new Error(`Audio command source '${command.sourceId}' does not match emitter '${this.soundSourceId}'`); this.pending.push(clone(command)); }
	public drainSoundCommands(): AudioCommand[] { const commands = this.pending.map(clone); this.pending = []; return commands; }
}

/** Generic deterministic collector. It never calls an output port or browser API. */
export class SoundSystem {
	private readonly buses = new Map<string, AudioBusSettings>();
	private readonly persistent = new Map<string, AudioPersistentSourceSettings>();
	private pending: AudioCommand[] = [];
	private output: AudioCommandBatch;
	private sequence: number;
	public constructor(private readonly runtimeId: string, settings: Omit<AudioRuntimeSettings, "schemaVersion" | "runtimeId" | "framework" | "sequence"> & { sequence?: number } = { buses: clone(DEFAULT_BUSES), persistentSources: [] }) {
		validateId(runtimeId, "runtime ID");
		for (const bus of settings.buses) { validateBus(bus); if (this.buses.has(bus.id)) throw new Error(`Duplicate audio bus '${bus.id}'`); this.buses.set(bus.id, clone(bus)); }
		if (!this.buses.has("master")) this.buses.set("master", clone(DEFAULT_BUSES[0]!));
		for (const source of settings.persistentSources) { validatePersistentSource(source, this.buses); if (this.persistent.has(source.sourceId)) throw new Error(`Duplicate persistent audio source '${source.sourceId}'`); this.persistent.set(source.sourceId, clone(source)); }
		this.sequence = settings.sequence ?? 0;
		this.output = emptyBatch(runtimeId, this.sequence, this.diagnostics());
	}
	public submit(command: AudioCommand): void { validateAudioCommand(command); this.pending.push(clone(command)); }
	public tick(candidates: readonly unknown[]): void {
		const collected: Array<{ command: AudioCommand; ordinal: number }> = [];
		let ordinal = 0;
		for (const candidate of candidates.filter(isSoundEmitter).sort((a, b) => a.soundSourceId.localeCompare(b.soundSourceId))) {
			for (const command of candidate.drainSoundCommands()) collected.push({ command, ordinal: ordinal++ });
		}
		for (const command of this.pending.splice(0)) collected.push({ command, ordinal: ordinal++ });
		const result = this.aggregate(collected);
		this.output = { schemaVersion: 1, runtimeId: this.runtimeId, sequence: ++this.sequence, commands: result.commands, diagnostics: { ...this.diagnostics(), ...result.diagnostics, sequence: this.sequence } };
	}
	public drainOutput(): AudioCommandBatch { const value = clone(this.output); this.output = emptyBatch(this.runtimeId, this.sequence, this.diagnostics()); return value; }
	/** Re-emits persistent intent only when a host explicitly requests restoration. */
	public restorePersistentIntent(): void { for (const source of [...this.persistent.values()].sort((a, b) => a.sourceId.localeCompare(b.sourceId))) this.pending.push(clone(source.command)); }
	public toSettings(framework: EngineFrameworkSettings = createDefaultAudioFramework()): AudioRuntimeSettings {
		const settings: AudioRuntimeSettings = { schemaVersion: 1, runtimeId: this.runtimeId, buses: [...this.buses.values()].sort(byBus).map(clone), persistentSources: [...this.persistent.values()].sort((a, b) => a.sourceId.localeCompare(b.sourceId)).map(clone), framework: clone(framework), sequence: this.sequence };
		validateAudioSettings(settings); return settings;
	}
	public getDiagnostics(): AudioDiagnostics { return clone(this.diagnostics()); }
	private aggregate(collected: Array<{ command: AudioCommand; ordinal: number }>): { commands: ResolvedAudioCommand[]; diagnostics: Pick<AudioDiagnostics, "collected" | "rejected" | "deduplicated" | "droppedByPriority"> } {
		let rejected = 0; let deduplicated = 0; let droppedByPriority = 0;
		const valid: Array<{ command: AudioCommand; ordinal: number }> = [];
		for (const entry of collected) {
			try { validateAudioCommand(entry.command); validateBusReference(entry.command, this.buses); valid.push(entry); }
			catch { rejected++; }
		}
		const dedupe = new Map<string, { command: AudioCommand; ordinal: number }>();
		const retained: Array<{ command: AudioCommand; ordinal: number }> = [];
		for (const entry of valid) {
			const key = entry.command.type === "playSound" && entry.command.dedupeKey ? `${entry.command.sourceId}|${entry.command.dedupeKey}` : undefined;
			if (!key) { retained.push(entry); continue; }
			const prior = dedupe.get(key);
			if (!prior || compareCommand(entry.command, prior.command, entry.ordinal, prior.ordinal, this.buses) < 0) { if (prior) deduplicated++; dedupe.set(key, entry); }
			else deduplicated++;
		}
		retained.push(...dedupe.values());
		const admitted: Array<{ command: AudioCommand; ordinal: number }> = [];
		for (const [busId, entries] of groupBy(retained.filter(entry => isVoiceCommand(entry.command)), entry => commandBus(entry.command)).entries()) {
			const bus = this.buses.get(busId)!;
			const ordered = entries.sort((a, b) => compareCommand(a.command, b.command, a.ordinal, b.ordinal, this.buses));
			admitted.push(...ordered.slice(0, bus.maxVoices)); droppedByPriority += Math.max(0, ordered.length - bus.maxVoices);
		}
		admitted.push(...retained.filter(entry => !isVoiceCommand(entry.command)));
		for (const entry of admitted) this.applyPersistent(entry.command);
		const commands = admitted.sort((a, b) => comparePipeline(a.command, b.command, a.ordinal, b.ordinal, this.buses)).map(entry => this.resolve(entry.command));
		return { commands, diagnostics: { collected: collected.length, rejected, deduplicated, droppedByPriority } };
	}
	private resolve(command: AudioCommand): ResolvedAudioCommand { return { ...clone(command), runtimeId: this.runtimeId, globalSourceId: `${this.runtimeId}:${command.sourceId}`, sequence: this.sequence + 1 }; }
	private applyPersistent(command: AudioCommand): void {
		if (command.type === "startLoop" || command.type === "playMusic") this.persistent.set(command.sourceId, { sourceId: command.sourceId, command: clone(command) });
		if (command.type === "stopSource") this.persistent.delete(command.sourceId);
		if (command.type === "stopMusic") for (const [id, source] of this.persistent) if (source.command.type === "playMusic" && (!command.sourceId || command.sourceId === id)) this.persistent.delete(id);
		if (command.type === "stopAll") this.persistent.clear();
		if (command.type === "setBusVolume") { const bus = this.buses.get(command.bus)!; bus.volume = command.volume; if (command.muted !== undefined) bus.muted = command.muted; }
		if (command.type === "pauseBus" || command.type === "resumeBus") this.buses.get(command.bus)!.paused = command.type === "pauseBus";
	}
	private diagnostics(): AudioDiagnostics { return { collected: 0, rejected: 0, deduplicated: 0, droppedByPriority: 0, activePersistentSources: [...this.persistent.keys()].sort(), outputStatus: "ready", sequence: this.sequence }; }
}

/** Explicit runtime lifecycle wrapper around the generic sound system. */
export class AudioRuntime {
	private readonly system: SoundSystem;
	private readonly framework: EngineFrameworkSettings;
	public constructor(settings: AudioRuntimeSettings) { validateAudioSettings(settings); this.framework = clone(settings.framework); this.system = new SoundSystem(settings.runtimeId, settings); }
	public tick(emitters: readonly unknown[]): void { this.system.tick(emitters); }
	public submit(command: AudioCommand): void { this.system.submit(command); }
	public drainOutput(): AudioCommandBatch { return this.system.drainOutput(); }
	public restorePersistentIntent(): void { this.system.restorePersistentIntent(); }
	public toSettings(): AudioRuntimeSettings { return this.system.toSettings(this.framework); }
	public getDiagnostics(): AudioDiagnostics { return this.system.getDiagnostics(); }
}

/** Application-level merge point: many runtimes, one explicit output batch. */
export class ApplicationAudioMixer {
	private readonly buses = new Map<string, AudioBusSettings>();
	private pending: AudioCommandBatch[] = [];
	private activeMusic: ResolvedAudioCommand | undefined;
	private sequence: number;
	public constructor(private readonly applicationId: string, settings: Omit<AudioApplicationSettings, "schemaVersion" | "applicationId" | "sequence"> & { sequence?: number } = { buses: clone(DEFAULT_BUSES) }) {
		validateId(applicationId, "application ID");
		for (const bus of settings.buses) { validateBus(bus); if (this.buses.has(bus.id)) throw new Error(`Duplicate audio bus '${bus.id}'`); this.buses.set(bus.id, clone(bus)); }
		if (!this.buses.has("master")) this.buses.set("master", clone(DEFAULT_BUSES[0]!));
		if (settings.activeMusic) { validateResolvedCommand(settings.activeMusic); this.activeMusic = clone(settings.activeMusic); }
		this.sequence = settings.sequence ?? 0;
	}
	public submit(batch: AudioCommandBatch): void { validateAudioBatch(batch); this.pending.push(clone(batch)); }
	public flush(): AudioCommandBatch {
		const submitted = this.pending.splice(0).flatMap(batch => batch.commands);
		const rejected = submitted.filter(command => "bus" in command && command.bus !== undefined && !this.buses.has(command.bus)).length;
		const incoming = submitted.filter(command => !("bus" in command && command.bus !== undefined && !this.buses.has(command.bus))).sort((a, b) => compareResolved(a, b, this.buses));
		const controls = incoming.filter(command => !isVoiceCommand(command));
		for (const command of controls) this.applyControl(command);
		const voices = incoming.filter(isVoiceCommand);
		const music = voices.filter((command): command is ResolvedAudioCommand & PlayMusicCommand => command.type === "playMusic");
		const nonMusic = this.limitVoices(voices.filter(command => command.type !== "playMusic"));
		const previousMusic = this.activeMusic;
		const selectedMusic = this.selectMusic(music);
		const replacedMusic = selectedMusic && previousMusic && previousMusic.globalSourceId !== selectedMusic.globalSourceId
			? [{ type: "stopSource", sourceId: previousMusic.sourceId, runtimeId: previousMusic.runtimeId, globalSourceId: previousMusic.globalSourceId, sequence: this.sequence + 1 } as ResolvedAudioCommand]
			: [];
		const commands = [...controls, ...replacedMusic, ...nonMusic, ...(selectedMusic ? [selectedMusic] : [])].sort((a, b) => compareResolved(a, b, this.buses));
		const diagnostics: AudioDiagnostics = { collected: submitted.length, rejected, deduplicated: 0, droppedByPriority: Math.max(0, voices.filter(command => command.type !== "playMusic").length - nonMusic.length) + Math.max(0, music.length - (selectedMusic ? 1 : 0)), activePersistentSources: this.activeMusic ? [this.activeMusic.globalSourceId] : [], activeMusicSourceId: this.activeMusic?.globalSourceId, outputStatus: "ready", sequence: ++this.sequence };
		return { schemaVersion: 1, runtimeId: this.applicationId, sequence: this.sequence, commands: commands.map(command => ({ ...command, sequence: this.sequence })), diagnostics };
	}
	public toSettings(): AudioApplicationSettings { const settings: AudioApplicationSettings = { schemaVersion: 1, applicationId: this.applicationId, buses: [...this.buses.values()].sort(byBus).map(clone), ...(this.activeMusic ? { activeMusic: clone(this.activeMusic) } : {}), sequence: this.sequence }; validateApplicationAudioSettings(settings); return settings; }
	private limitVoices(commands: ResolvedAudioCommand[]): ResolvedAudioCommand[] { const result: ResolvedAudioCommand[] = []; for (const [busId, entries] of groupBy(commands, command => commandBus(command)).entries()) result.push(...entries.sort((a, b) => compareResolved(a, b, this.buses)).slice(0, this.buses.get(busId)!.maxVoices)); return result; }
	private selectMusic(candidates: Array<ResolvedAudioCommand & PlayMusicCommand>): ResolvedAudioCommand | undefined {
		const ordered = candidates.sort((a, b) => compareResolved(a, b, this.buses));
		for (const candidate of ordered) {
			const policy = candidate.replacementPolicy ?? "replace-lower-or-equal";
			const currentPriority = this.activeMusic ? resolvedPriority(this.activeMusic, this.buses) : -Infinity;
			const priority = resolvedPriority(candidate, this.buses);
			if (!this.activeMusic || policy === "replace-current" || (policy === "replace-lower-or-equal" && priority >= currentPriority) || (policy === "keep-current" && !this.activeMusic)) { this.activeMusic = clone(candidate); return candidate; }
		}
		return undefined;
	}
	private applyControl(command: ResolvedAudioCommand): void {
		if (command.type === "stopMusic" && (!command.sourceId || this.activeMusic?.globalSourceId === `${command.runtimeId}:${command.sourceId}`)) this.activeMusic = undefined;
		if (command.type === "stopSource" && this.activeMusic?.globalSourceId === `${command.runtimeId}:${command.sourceId}`) this.activeMusic = undefined;
		if (command.type === "stopAll") this.activeMusic = undefined;
		if (command.type === "setBusVolume") { const bus = this.buses.get(command.bus); if (bus) { bus.volume = command.volume; if (command.muted !== undefined) bus.muted = command.muted; } }
		if (command.type === "pauseBus" || command.type === "resumeBus") { const bus = this.buses.get(command.bus); if (bus) bus.paused = command.type === "pauseBus"; }
	}
}

export function createDefaultAudioFramework(): EngineFrameworkSettings {
	const registry = new EngineSystemRegistry().register({ id: "audio.collect", provides: ["audio.commands"] }).register({ id: "audio.mix", requires: ["audio.commands"], after: ["audio.collect"], provides: ["audio.batch"] });
	return registry.select(["audio.collect", "audio.mix"]);
}
export function createAudioRuntime(settings: AudioRuntimeSettings): AudioRuntime { return new AudioRuntime(settings); }
export function createAudioSettings(options: { runtimeId: string; buses?: AudioBusSettings[]; persistentSources?: AudioPersistentSourceSettings[] }): AudioRuntimeSettings {
	return { schemaVersion: 1, runtimeId: options.runtimeId, buses: clone(options.buses ?? DEFAULT_BUSES), persistentSources: clone(options.persistentSources ?? []), framework: createDefaultAudioFramework(), sequence: 0 };
}
export function validateAudioSettings(value: unknown): asserts value is AudioRuntimeSettings {
	if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Malformed audio settings"); const settings = value as Partial<AudioRuntimeSettings>;
	if (settings.schemaVersion !== 1 || typeof settings.runtimeId !== "string" || !Array.isArray(settings.buses) || !Array.isArray(settings.persistentSources) || !settings.framework || typeof settings.sequence !== "number" || !Number.isSafeInteger(settings.sequence) || settings.sequence < 0) throw new Error("Malformed audio settings");
	const sequence = settings.sequence as number;
	validateId(settings.runtimeId, "runtime ID"); const buses = new Map<string, AudioBusSettings>(); for (const bus of settings.buses) { validateBus(bus); if (buses.has(bus.id)) throw new Error(`Duplicate audio bus '${bus.id}'`); buses.set(bus.id, bus); } if (!buses.has("master")) throw new Error("Audio settings require a master bus");
	const sources = new Set<string>(); for (const source of settings.persistentSources) { validatePersistentSource(source, buses); if (sources.has(source.sourceId)) throw new Error(`Duplicate persistent audio source '${source.sourceId}'`); sources.add(source.sourceId); }
	const registry: EngineSystemRegistry = new EngineSystemRegistry().register({ id: "audio.collect", provides: ["audio.commands"] }).register({ id: "audio.mix", requires: ["audio.commands"], after: ["audio.collect"], provides: ["audio.batch"] }); registry.validate(settings.framework); if (sequence < 0) throw new Error("Invalid audio sequence"); assertJsonValue(settings);
}
export function validateApplicationAudioSettings(value: unknown): asserts value is AudioApplicationSettings {
	if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Malformed application audio settings"); const settings = value as Partial<AudioApplicationSettings>;
	if (settings.schemaVersion !== 1 || typeof settings.applicationId !== "string" || !Array.isArray(settings.buses) || typeof settings.sequence !== "number" || !Number.isSafeInteger(settings.sequence) || settings.sequence < 0) throw new Error("Malformed application audio settings"); const sequence = settings.sequence as number; validateId(settings.applicationId, "application ID"); const ids = new Set<string>(); for (const bus of settings.buses) { validateBus(bus); if (ids.has(bus.id)) throw new Error(`Duplicate audio bus '${bus.id}'`); ids.add(bus.id); } if (!ids.has("master")) throw new Error("Application audio settings require a master bus"); if (settings.activeMusic) validateResolvedCommand(settings.activeMusic); if (sequence < 0) throw new Error("Invalid audio sequence"); assertJsonValue(settings);
}
export function validateAudioCommand(value: unknown): asserts value is AudioCommand {
	if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Malformed audio command"); const command = value as Partial<AudioCommand>;
	if (typeof command.type !== "string" || !COMMAND_TYPES.has(command.type)) throw new Error("Unknown audio command");
	if (command.type !== "stopMusic") validateId(command.sourceId, "audio source ID"); else if (command.sourceId !== undefined) validateId(command.sourceId, "audio source ID");
	if ("soundId" in command) validateId(command.soundId, "sound ID"); if ("bus" in command && command.bus !== undefined) validateId(command.bus, "audio bus ID"); if ("instanceId" in command && command.instanceId !== undefined) validateId(command.instanceId, "audio instance ID"); if ("dedupeKey" in command && command.dedupeKey !== undefined) validateId(command.dedupeKey, "audio dedupe key");
	for (const name of ["volume", "pitch", "pan", "fadeInMs", "fadeOutMs", "priority"] as const) { const numeric = (command as Record<string, unknown>)[name]; if (numeric !== undefined && (typeof numeric !== "number" || !Number.isFinite(numeric) || (name === "volume" && (numeric < 0 || numeric > 1)) || (name === "pitch" && numeric <= 0) || (name === "pan" && (numeric < -1 || numeric > 1)) || ((name === "fadeInMs" || name === "fadeOutMs") && numeric < 0) || (name === "priority" && !Number.isInteger(numeric)))) throw new Error(`Invalid audio ${name}`); }
	if (command.type === "playMusic" && command.replacementPolicy !== undefined && !["replace-current", "replace-lower-or-equal", "keep-current"].includes(command.replacementPolicy)) throw new Error("Invalid music replacement policy"); assertJsonValue(command);
}
export function validateAudioBatch(value: unknown): asserts value is AudioCommandBatch {
	if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Malformed audio batch"); const batch = value as Partial<AudioCommandBatch>;
	if (batch.schemaVersion !== 1 || typeof batch.runtimeId !== "string" || typeof batch.sequence !== "number" || !Number.isSafeInteger(batch.sequence) || batch.sequence < 0 || !Array.isArray(batch.commands) || !batch.diagnostics) throw new Error("Malformed audio batch"); const sequence = batch.sequence as number; validateId(batch.runtimeId, "runtime ID"); for (const command of batch.commands) validateResolvedCommand(command); if (sequence < 0) throw new Error("Invalid audio sequence"); assertJsonValue(batch);
}

export const audio = {
	engine: { createSystemRegistry: engine.createSystemRegistry },
	createSettings: createAudioSettings, createRuntime: createAudioRuntime, createApplicationMixer(applicationId: string, settings?: Omit<AudioApplicationSettings, "schemaVersion" | "applicationId" | "sequence"> & { sequence?: number }): ApplicationAudioMixer { return new ApplicationAudioMixer(applicationId, settings); }, createDefaultFramework: createDefaultAudioFramework,
	emitter(sourceId: string): AudioEmitter { return new AudioEmitter(sourceId); },
	bus(settings: AudioBusSettings): AudioBusSettings { validateBus(settings); return clone(settings); },
	command: {
		play(settings: Omit<PlaySoundCommand, "type">): PlaySoundCommand { return { type: "playSound", ...clone(settings) }; }, loop(settings: Omit<StartLoopCommand, "type">): StartLoopCommand { return { type: "startLoop", ...clone(settings) }; }, music(settings: Omit<PlayMusicCommand, "type">): PlayMusicCommand { return { type: "playMusic", ...clone(settings) }; }, stopSource(settings: Omit<StopSourceCommand, "type">): StopSourceCommand { return { type: "stopSource", ...clone(settings) }; }, stopInstance(settings: Omit<StopInstanceCommand, "type">): StopInstanceCommand { return { type: "stopInstance", ...clone(settings) }; }, stopMusic(settings: Omit<StopMusicCommand, "type"> = {}): StopMusicCommand { return { type: "stopMusic", ...clone(settings) }; }, setBusVolume(settings: Omit<SetBusVolumeCommand, "type">): SetBusVolumeCommand { return { type: "setBusVolume", ...clone(settings) }; }, pauseBus(settings: Omit<PauseBusCommand, "type">): PauseBusCommand { return { type: "pauseBus", ...clone(settings) }; }, resumeBus(settings: Omit<ResumeBusCommand, "type">): ResumeBusCommand { return { type: "resumeBus", ...clone(settings) }; }, stopAll(settings: Omit<StopAllCommand, "type">): StopAllCommand { return { type: "stopAll", ...clone(settings) }; },
	},
	validate: validateAudioSettings, validateCommand: validateAudioCommand, validateBatch: validateAudioBatch,
} as const;

const COMMAND_TYPES = new Set<AudioCommand["type"]>(["playSound", "startLoop", "playMusic", "stopSource", "stopInstance", "stopMusic", "pauseBus", "resumeBus", "setBusVolume", "stopAll"]);
function isSoundEmitter(value: unknown): value is ISoundEmitter { return !!value && typeof value === "object" && typeof (value as ISoundEmitter).soundSourceId === "string" && typeof (value as ISoundEmitter).drainSoundCommands === "function"; }
function validateId(value: unknown, name: string): asserts value is string { if (typeof value !== "string" || !/^[a-zA-Z0-9._:-]{1,120}$/.test(value)) throw new Error(`Invalid ${name}`); }
function validateBus(value: unknown): asserts value is AudioBusSettings { if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Malformed audio bus"); const bus = value as Partial<AudioBusSettings>; validateId(bus.id, "audio bus ID"); const volume = bus.volume; const maxVoices = bus.maxVoices; if (typeof volume !== "number" || !Number.isFinite(volume) || volume < 0 || volume > 1 || typeof bus.muted !== "boolean" || typeof maxVoices !== "number" || !Number.isSafeInteger(maxVoices) || maxVoices < 1 || !Number.isSafeInteger(bus.defaultPriority) || typeof bus.paused !== "boolean") throw new Error(`Invalid audio bus '${bus.id}'`); assertJsonValue(bus); }
function validatePersistentSource(value: unknown, buses: ReadonlyMap<string, AudioBusSettings>): asserts value is AudioPersistentSourceSettings { if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Malformed persistent audio source"); const source = value as Partial<AudioPersistentSourceSettings>; validateId(source.sourceId, "persistent source ID"); validateAudioCommand(source.command); if (source.command.type !== "startLoop" && source.command.type !== "playMusic") throw new Error("Persistent audio source must be a loop or music command"); if (source.command.sourceId !== source.sourceId) throw new Error("Persistent audio source ID mismatch"); validateBusReference(source.command, buses); }
function validateBusReference(command: AudioCommand, buses: ReadonlyMap<string, AudioBusSettings>): void { if ("bus" in command && command.bus !== undefined && !buses.has(command.bus)) throw new Error(`Unknown audio bus '${command.bus}'`); }
function validateResolvedCommand(value: unknown): asserts value is ResolvedAudioCommand { validateAudioCommand(value); const command = value as Partial<ResolvedAudioCommand>; validateId(command.runtimeId, "runtime ID"); validateId(command.globalSourceId, "global audio source ID"); const sequence = command.sequence; if (typeof sequence !== "number" || !Number.isSafeInteger(sequence) || sequence < 0) throw new Error("Invalid audio sequence"); }
function commandBus(command: AudioCommand): string { return "bus" in command && command.bus ? command.bus : command.type === "playMusic" ? "music" : "effects"; }
function isVoiceCommand(command: AudioCommand): command is PlaySoundCommand | StartLoopCommand | PlayMusicCommand { return command.type === "playSound" || command.type === "startLoop" || command.type === "playMusic"; }
function resolvedPriority(command: AudioCommand | ResolvedAudioCommand, buses: ReadonlyMap<string, AudioBusSettings>): number { return (command as { priority?: number }).priority ?? buses.get(commandBus(command))?.defaultPriority ?? 0; }
function compareCommand(a: AudioCommand, b: AudioCommand, aOrdinal: number, bOrdinal: number, buses: ReadonlyMap<string, AudioBusSettings>): number { return (resolvedPriority(b, buses) - resolvedPriority(a, buses)) || commandBus(a).localeCompare(commandBus(b)) || (a.sourceId ?? "").localeCompare(b.sourceId ?? "") || ("soundId" in a ? a.soundId : "").localeCompare("soundId" in b ? b.soundId : "") || aOrdinal - bOrdinal; }
function pipelineOrder(command: AudioCommand): number { if (command.type === "stopAll" || command.type === "pauseBus" || command.type === "resumeBus" || command.type === "setBusVolume") return 0; if (command.type === "stopSource" || command.type === "stopInstance" || command.type === "stopMusic") return 1; if (command.type === "playMusic") return 2; if (command.type === "startLoop") return 3; return 4; }
function comparePipeline(a: AudioCommand, b: AudioCommand, aOrdinal: number, bOrdinal: number, buses: ReadonlyMap<string, AudioBusSettings>): number { return pipelineOrder(a) - pipelineOrder(b) || compareCommand(a, b, aOrdinal, bOrdinal, buses); }
function compareResolved(a: ResolvedAudioCommand, b: ResolvedAudioCommand, buses: ReadonlyMap<string, AudioBusSettings>): number { return pipelineOrder(a) - pipelineOrder(b) || (resolvedPriority(b, buses) - resolvedPriority(a, buses)) || a.globalSourceId.localeCompare(b.globalSourceId) || ("soundId" in a ? a.soundId : "").localeCompare("soundId" in b ? b.soundId : "") || a.sequence - b.sequence; }
function byBus(a: AudioBusSettings, b: AudioBusSettings): number { return a.id.localeCompare(b.id); }
function emptyBatch(runtimeId: string, sequence: number, diagnostics: AudioDiagnostics): AudioCommandBatch { return { schemaVersion: 1, runtimeId, sequence, commands: [], diagnostics: { ...diagnostics, sequence } }; }
function groupBy<T>(items: readonly T[], key: (item: T) => string): Map<string, T[]> { const grouped = new Map<string, T[]>(); for (const item of items) { const id = key(item); const values = grouped.get(id) ?? []; values.push(item); grouped.set(id, values); } return grouped; }
function clone<T>(value: T): T { return structuredClone(value); }
