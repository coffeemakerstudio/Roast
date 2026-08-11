import { assertJsonValue, type JsonValue } from "../contracts/systemSettings.js";

export type PresentationInterruption = "replace" | "higher-priority" | "ignore";
export type AnimationKeyframe = { tick: number; value: JsonValue };
export type AnimationTrack = { id: string; keyframes: AnimationKeyframe[] };
export type AnimationSettings = {
	schemaVersion: 1;
	id: string;
	channel: string;
	durationTicks: number;
	priority: number;
	interruption: PresentationInterruption;
	tracks: AnimationTrack[];
};

export type PresentationEvent = {
	schemaVersion: 1;
	type: "play" | "cancel";
	eventId: string;
	channel?: string;
	animationId?: string;
	instanceId?: string;
	priority?: number;
	payload?: JsonValue;
};

export type PresentationEventRecord = PresentationEvent & { sequence: number; tick: number };
export type ActiveAnimation = { instanceId: string; animationId: string; channel: string; startTick: number; priority: number };
export type PresentationProjection = {
	instanceId: string;
	animationId: string;
	channel: string;
	priority: number;
	localTick: number;
	progress: number;
	values: Record<string, JsonValue>;
};
export type PresentationFrame = { schemaVersion: 1; runtimeId: string; tick: number; events: PresentationEventRecord[]; animations: PresentationProjection[] };
export type PresentationRuntimeSettings = {
	schemaVersion: 1;
	runtimeId: string;
	tick: number;
	sequence: number;
	active: ActiveAnimation[];
	pending: PresentationEvent[];
};

export interface PresentationOutputPort { apply(frame: Readonly<PresentationFrame>): void; }

export function validateAnimationSettings(value: unknown): asserts value is AnimationSettings {
	if (!isRecord(value) || value.schemaVersion !== 1 || typeof value.id !== "string" || typeof value.channel !== "string" || !positiveInteger(value.durationTicks) || !integer(value.priority) || !INTERRUPTIONS.has(value.interruption) || !Array.isArray(value.tracks)) throw new Error("Malformed animation settings");
	assertKeys(value, ["schemaVersion", "id", "channel", "durationTicks", "priority", "interruption", "tracks"], "animation settings");
	validateId(value.id, "animation ID"); validateId(value.channel, "animation channel");
	const ids = new Set<string>();
	for (const track of value.tracks) {
		if (!isRecord(track) || typeof track.id !== "string" || !Array.isArray(track.keyframes)) throw new Error("Malformed animation track");
		assertKeys(track, ["id", "keyframes"], "animation track");
		validateId(track.id, "animation track ID"); if (ids.has(track.id)) throw new Error(`Duplicate animation track '${track.id}'`); ids.add(track.id);
		let previous = -1;
		for (const keyframe of track.keyframes) {
			if (!isRecord(keyframe) || !nonNegativeInteger(keyframe.tick) || keyframe.tick > value.durationTicks || keyframe.tick <= previous) throw new Error("Invalid animation keyframe");
			assertKeys(keyframe, ["tick", "value"], "animation keyframe");
			assertJsonValue(keyframe.value); previous = keyframe.tick;
		}
		if (track.keyframes.length === 0) throw new Error("Animation tracks require keyframes");
	}
	assertJsonValue(value);
}

export function validatePresentationEvent(value: unknown): asserts value is PresentationEvent {
	if (!isRecord(value) || value.schemaVersion !== 1 || (value.type !== "play" && value.type !== "cancel") || typeof value.eventId !== "string") throw new Error("Malformed presentation event");
	assertKeys(value, ["schemaVersion", "type", "eventId", "channel", "animationId", "instanceId", "priority", "payload"], "presentation event");
	validateId(value.eventId, "presentation event ID");
	if (value.channel !== undefined) validateId(value.channel, "presentation channel");
	if (value.animationId !== undefined) validateId(value.animationId, "animation ID");
	if (value.instanceId !== undefined) validateId(value.instanceId, "presentation instance ID");
	if (value.priority !== undefined && !integer(value.priority)) throw new Error("Invalid presentation priority");
	if (value.type === "play" && value.animationId === undefined) throw new Error("Play events require an animation ID");
	if (value.type === "cancel" && value.instanceId === undefined && value.channel === undefined) throw new Error("Cancel events require an instance or channel");
	if (value.payload !== undefined) assertJsonValue(value.payload);
	assertJsonValue(value);
}

export function validatePresentationRuntimeSettings(value: unknown): asserts value is PresentationRuntimeSettings {
	if (!isRecord(value) || value.schemaVersion !== 1 || typeof value.runtimeId !== "string" || !nonNegativeInteger(value.tick) || !nonNegativeInteger(value.sequence) || !Array.isArray(value.active) || !Array.isArray(value.pending)) throw new Error("Malformed presentation runtime settings");
	assertKeys(value, ["schemaVersion", "runtimeId", "tick", "sequence", "active", "pending"], "presentation runtime settings");
	validateId(value.runtimeId, "presentation runtime ID");
	for (const active of value.active) {
		if (!isRecord(active) || typeof active.instanceId !== "string" || typeof active.animationId !== "string" || typeof active.channel !== "string" || !nonNegativeInteger(active.startTick) || !integer(active.priority)) throw new Error("Malformed active animation");
		assertKeys(active, ["instanceId", "animationId", "channel", "startTick", "priority"], "active animation");
		validateId(active.instanceId, "presentation instance ID"); validateId(active.animationId, "animation ID"); validateId(active.channel, "presentation channel");
	}
	for (const event of value.pending) validatePresentationEvent(event);
	assertJsonValue(value);
}

export class PresentationRuntime {
	private readonly animations = new Map<string, AnimationSettings>();
	private readonly active = new Map<string, ActiveAnimation>();
	private pending: PresentationEvent[] = [];
	private tickNumber: number;
	private sequence: number;
	private lastFrame: PresentationFrame;

	public constructor(public readonly runtimeId: string, settings: { animations: AnimationSettings[]; tick?: number; sequence?: number; active?: ActiveAnimation[]; pending?: PresentationEvent[] }) {
		validateId(runtimeId, "presentation runtime ID");
		for (const animation of settings.animations) { validateAnimationSettings(animation); if (this.animations.has(animation.id)) throw new Error(`Duplicate animation '${animation.id}'`); this.animations.set(animation.id, clone(animation)); }
		this.tickNumber = settings.tick ?? 0; this.sequence = settings.sequence ?? 0;
		for (const item of settings.active ?? []) this.restoreActive(item);
		for (const event of settings.pending ?? []) { validatePresentationEvent(event); this.pending.push(clone(event)); }
		this.lastFrame = this.frame([]);
	}

	public emit(event: PresentationEvent): void { validatePresentationEvent(event); this.pending.push(clone(event)); }
	public tick(ticks: number = 1): PresentationFrame {
		if (!nonNegativeInteger(ticks)) throw new Error("Presentation tick count must be a non-negative integer");
		const records: PresentationEventRecord[] = [];
		for (let step = 0; step < ticks; step++) { this.tickNumber++; this.processPending(records); this.expire(records); }
		this.lastFrame = this.frame(records); return clone(this.lastFrame);
	}
	public project(): PresentationFrame { return clone(this.frame([])); }
	public toSettings(): PresentationRuntimeSettings {
		const settings: PresentationRuntimeSettings = { schemaVersion: 1, runtimeId: this.runtimeId, tick: this.tickNumber, sequence: this.sequence, active: [...this.active.values()].sort(byInstance).map(clone), pending: this.pending.map(clone) };
		validatePresentationRuntimeSettings(settings); return settings;
	}
	private processPending(records: PresentationEventRecord[]): void {
		const pending = this.pending.splice(0).map((event, ordinal) => ({ event, ordinal })).sort((a, b) => this.eventPriority(b.event) - this.eventPriority(a.event) || a.ordinal - b.ordinal || a.event.eventId.localeCompare(b.event.eventId));
		for (const { event } of pending) {
			if (event.type === "cancel") { for (const item of [...this.active.values()]) if ((event.instanceId && item.instanceId === event.instanceId) || (event.channel && item.channel === event.channel)) this.cancel(item, records, event.eventId); continue; }
			const animation = this.animations.get(event.animationId!); if (!animation) throw new Error(`Unknown animation '${event.animationId}'`);
			const current = this.active.get(animation.channel);
			if (current && (animation.interruption === "ignore" || (animation.interruption === "higher-priority" && animation.priority <= current.priority))) continue;
			if (current) this.cancel(current, records, event.eventId);
			const item: ActiveAnimation = { instanceId: event.instanceId ?? `${this.runtimeId}:${event.eventId}`, animationId: animation.id, channel: animation.channel, startTick: this.tickNumber, priority: animation.priority };
			this.active.set(animation.channel, item); records.push(this.record({ ...event, type: "play", animationId: animation.id, instanceId: item.instanceId }, this.sequence++));
		}
	}
	private eventPriority(event: PresentationEvent): number { return event.priority ?? (event.type === "play" ? this.animations.get(event.animationId!)?.priority ?? 0 : 0); }
	private cancel(item: ActiveAnimation, records: PresentationEventRecord[], eventId: string): void { this.active.delete(item.channel); records.push(this.record({ schemaVersion: 1, type: "cancel", eventId, instanceId: item.instanceId, channel: item.channel }, this.sequence++)); }
	private expire(records: PresentationEventRecord[]): void { for (const item of [...this.active.values()]) { const animation = this.animations.get(item.animationId)!; if (this.tickNumber - item.startTick >= animation.durationTicks) this.cancel(item, records, `${item.instanceId}:complete`); } }
	private record(event: PresentationEvent, sequence: number): PresentationEventRecord { return { ...clone(event), sequence, tick: this.tickNumber }; }
	private frame(events: PresentationEventRecord[]): PresentationFrame { return { schemaVersion: 1, runtimeId: this.runtimeId, tick: this.tickNumber, events: events.map(clone), animations: [...this.active.values()].sort(byInstance).map(item => this.projectAnimation(item)) }; }
	private projectAnimation(item: ActiveAnimation): PresentationProjection { const animation = this.animations.get(item.animationId)!; const localTick = Math.max(0, this.tickNumber - item.startTick); const values: Record<string, JsonValue> = {}; for (const track of animation.tracks) values[track.id] = sample(track.keyframes, localTick); return { instanceId: item.instanceId, animationId: item.animationId, channel: item.channel, priority: item.priority, localTick, progress: Math.min(1, localTick / animation.durationTicks), values }; }
	private restoreActive(item: ActiveAnimation): void { validatePresentationRuntimeSettings({ schemaVersion: 1, runtimeId: this.runtimeId, tick: this.tickNumber, sequence: this.sequence, active: [item], pending: [] }); if (this.active.has(item.channel)) throw new Error(`Duplicate active animation channel '${item.channel}'`); if (!this.animations.has(item.animationId)) throw new Error(`Unknown animation '${item.animationId}'`); this.active.set(item.channel, clone(item)); }
}

function sample(keyframes: AnimationKeyframe[], tick: number): JsonValue { let result = keyframes[0]!.value; for (const keyframe of keyframes) { if (keyframe.tick > tick) break; result = keyframe.value; } return clone(result); }
function validateId(value: unknown, name: string): asserts value is string { if (typeof value !== "string" || !/^[a-zA-Z0-9._:-]{1,120}$/.test(value)) throw new Error(`Invalid ${name}`); }
function assertKeys(value: Record<string, unknown>, allowed: readonly string[], name: string): void { const keys = new Set(allowed); for (const key of Object.keys(value)) if (!keys.has(key)) throw new Error(`Unknown ${name} field '${key}'`); }
function isRecord(value: unknown): value is Record<string, any> { return !!value && typeof value === "object" && !Array.isArray(value); }
function integer(value: unknown): value is number { return typeof value === "number" && Number.isSafeInteger(value); }
function nonNegativeInteger(value: unknown): value is number { return integer(value) && value >= 0; }
function positiveInteger(value: unknown): value is number { return integer(value) && value > 0; }
function clone<T>(value: T): T { return structuredClone(value); }
function byInstance(a: ActiveAnimation, b: ActiveAnimation): number { return a.channel.localeCompare(b.channel) || a.instanceId.localeCompare(b.instanceId); }
const INTERRUPTIONS = new Set<PresentationInterruption>(["replace", "higher-priority", "ignore"]);

export const presentation = {
	createAnimation(settings: Omit<AnimationSettings, "schemaVersion">): AnimationSettings { const result = { schemaVersion: 1 as const, ...clone(settings) }; validateAnimationSettings(result); return result; },
	createRuntime(runtimeId: string, settings: { animations: AnimationSettings[]; tick?: number; sequence?: number; active?: ActiveAnimation[]; pending?: PresentationEvent[] }): PresentationRuntime { return new PresentationRuntime(runtimeId, settings); },
	play(eventId: string, animationId: string, options: Omit<PresentationEvent, "schemaVersion" | "type" | "eventId" | "animationId"> = {}): PresentationEvent { return { schemaVersion: 1, type: "play", eventId, animationId, ...clone(options) }; },
	cancel(eventId: string, options: Pick<PresentationEvent, "instanceId" | "channel">): PresentationEvent { return { schemaVersion: 1, type: "cancel", eventId, ...clone(options) }; },
	validateAnimation: validateAnimationSettings,
	validateEvent: validatePresentationEvent,
	validateRuntime: validatePresentationRuntimeSettings,
} as const;
