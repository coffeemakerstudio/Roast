import { assertJsonValue } from "../contracts/systemSettings.js";
export function validateAnimationSettings(value) {
    if (!isRecord(value) || value.schemaVersion !== 1 || typeof value.id !== "string" || typeof value.channel !== "string" || !positiveInteger(value.durationTicks) || !integer(value.priority) || !INTERRUPTIONS.has(value.interruption) || !Array.isArray(value.tracks))
        throw new Error("Malformed animation settings");
    assertKeys(value, ["schemaVersion", "id", "channel", "durationTicks", "priority", "interruption", "tracks"], "animation settings");
    validateId(value.id, "animation ID");
    validateId(value.channel, "animation channel");
    const ids = new Set();
    for (const track of value.tracks) {
        if (!isRecord(track) || typeof track.id !== "string" || !Array.isArray(track.keyframes))
            throw new Error("Malformed animation track");
        assertKeys(track, ["id", "keyframes"], "animation track");
        validateId(track.id, "animation track ID");
        if (ids.has(track.id))
            throw new Error(`Duplicate animation track '${track.id}'`);
        ids.add(track.id);
        let previous = -1;
        for (const keyframe of track.keyframes) {
            if (!isRecord(keyframe) || !nonNegativeInteger(keyframe.tick) || keyframe.tick > value.durationTicks || keyframe.tick <= previous)
                throw new Error("Invalid animation keyframe");
            assertKeys(keyframe, ["tick", "value"], "animation keyframe");
            assertJsonValue(keyframe.value);
            previous = keyframe.tick;
        }
        if (track.keyframes.length === 0)
            throw new Error("Animation tracks require keyframes");
    }
    assertJsonValue(value);
}
export function validatePresentationEvent(value) {
    if (!isRecord(value) || value.schemaVersion !== 1 || (value.type !== "play" && value.type !== "cancel") || typeof value.eventId !== "string")
        throw new Error("Malformed presentation event");
    assertKeys(value, ["schemaVersion", "type", "eventId", "channel", "animationId", "instanceId", "priority", "payload"], "presentation event");
    validateId(value.eventId, "presentation event ID");
    if (value.channel !== undefined)
        validateId(value.channel, "presentation channel");
    if (value.animationId !== undefined)
        validateId(value.animationId, "animation ID");
    if (value.instanceId !== undefined)
        validateId(value.instanceId, "presentation instance ID");
    if (value.priority !== undefined && !integer(value.priority))
        throw new Error("Invalid presentation priority");
    if (value.type === "play" && value.animationId === undefined)
        throw new Error("Play events require an animation ID");
    if (value.type === "cancel" && value.instanceId === undefined && value.channel === undefined)
        throw new Error("Cancel events require an instance or channel");
    if (value.payload !== undefined)
        assertJsonValue(value.payload);
    assertJsonValue(value);
}
export function validatePresentationRuntimeSettings(value) {
    if (!isRecord(value) || value.schemaVersion !== 1 || typeof value.runtimeId !== "string" || !nonNegativeInteger(value.tick) || !nonNegativeInteger(value.sequence) || !Array.isArray(value.active) || !Array.isArray(value.pending))
        throw new Error("Malformed presentation runtime settings");
    assertKeys(value, ["schemaVersion", "runtimeId", "tick", "sequence", "active", "pending"], "presentation runtime settings");
    validateId(value.runtimeId, "presentation runtime ID");
    for (const active of value.active) {
        if (!isRecord(active) || typeof active.instanceId !== "string" || typeof active.animationId !== "string" || typeof active.channel !== "string" || !nonNegativeInteger(active.startTick) || !integer(active.priority))
            throw new Error("Malformed active animation");
        assertKeys(active, ["instanceId", "animationId", "channel", "startTick", "priority"], "active animation");
        validateId(active.instanceId, "presentation instance ID");
        validateId(active.animationId, "animation ID");
        validateId(active.channel, "presentation channel");
    }
    for (const event of value.pending)
        validatePresentationEvent(event);
    assertJsonValue(value);
}
export class PresentationRuntime {
    runtimeId;
    animations = new Map();
    active = new Map();
    pending = [];
    tickNumber;
    sequence;
    lastFrame;
    constructor(runtimeId, settings) {
        this.runtimeId = runtimeId;
        validateId(runtimeId, "presentation runtime ID");
        for (const animation of settings.animations) {
            validateAnimationSettings(animation);
            if (this.animations.has(animation.id))
                throw new Error(`Duplicate animation '${animation.id}'`);
            this.animations.set(animation.id, clone(animation));
        }
        this.tickNumber = settings.tick ?? 0;
        this.sequence = settings.sequence ?? 0;
        for (const item of settings.active ?? [])
            this.restoreActive(item);
        for (const event of settings.pending ?? []) {
            validatePresentationEvent(event);
            this.pending.push(clone(event));
        }
        this.lastFrame = this.frame([]);
    }
    emit(event) { validatePresentationEvent(event); this.pending.push(clone(event)); }
    tick(ticks = 1) {
        if (!nonNegativeInteger(ticks))
            throw new Error("Presentation tick count must be a non-negative integer");
        const records = [];
        for (let step = 0; step < ticks; step++) {
            this.tickNumber++;
            this.processPending(records);
            this.expire(records);
        }
        this.lastFrame = this.frame(records);
        return clone(this.lastFrame);
    }
    project() { return clone(this.frame([])); }
    toSettings() {
        const settings = { schemaVersion: 1, runtimeId: this.runtimeId, tick: this.tickNumber, sequence: this.sequence, active: [...this.active.values()].sort(byInstance).map(clone), pending: this.pending.map(clone) };
        validatePresentationRuntimeSettings(settings);
        return settings;
    }
    processPending(records) {
        const pending = this.pending.splice(0).map((event, ordinal) => ({ event, ordinal })).sort((a, b) => this.eventPriority(b.event) - this.eventPriority(a.event) || a.ordinal - b.ordinal || a.event.eventId.localeCompare(b.event.eventId));
        for (const { event } of pending) {
            if (event.type === "cancel") {
                for (const item of [...this.active.values()])
                    if ((event.instanceId && item.instanceId === event.instanceId) || (event.channel && item.channel === event.channel))
                        this.cancel(item, records, event.eventId);
                continue;
            }
            const animation = this.animations.get(event.animationId);
            if (!animation)
                throw new Error(`Unknown animation '${event.animationId}'`);
            const current = this.active.get(animation.channel);
            if (current && (animation.interruption === "ignore" || (animation.interruption === "higher-priority" && animation.priority <= current.priority)))
                continue;
            if (current)
                this.cancel(current, records, event.eventId);
            const item = { instanceId: event.instanceId ?? `${this.runtimeId}:${event.eventId}`, animationId: animation.id, channel: animation.channel, startTick: this.tickNumber, priority: animation.priority };
            this.active.set(animation.channel, item);
            records.push(this.record({ ...event, type: "play", animationId: animation.id, instanceId: item.instanceId }, this.sequence++));
        }
    }
    eventPriority(event) { return event.priority ?? (event.type === "play" ? this.animations.get(event.animationId)?.priority ?? 0 : 0); }
    cancel(item, records, eventId) { this.active.delete(item.channel); records.push(this.record({ schemaVersion: 1, type: "cancel", eventId, instanceId: item.instanceId, channel: item.channel }, this.sequence++)); }
    expire(records) { for (const item of [...this.active.values()]) {
        const animation = this.animations.get(item.animationId);
        if (this.tickNumber - item.startTick >= animation.durationTicks)
            this.cancel(item, records, `${item.instanceId}:complete`);
    } }
    record(event, sequence) { return { ...clone(event), sequence, tick: this.tickNumber }; }
    frame(events) { return { schemaVersion: 1, runtimeId: this.runtimeId, tick: this.tickNumber, events: events.map(clone), animations: [...this.active.values()].sort(byInstance).map(item => this.projectAnimation(item)) }; }
    projectAnimation(item) { const animation = this.animations.get(item.animationId); const localTick = Math.max(0, this.tickNumber - item.startTick); const values = {}; for (const track of animation.tracks)
        values[track.id] = sample(track.keyframes, localTick); return { instanceId: item.instanceId, animationId: item.animationId, channel: item.channel, priority: item.priority, localTick, progress: Math.min(1, localTick / animation.durationTicks), values }; }
    restoreActive(item) { validatePresentationRuntimeSettings({ schemaVersion: 1, runtimeId: this.runtimeId, tick: this.tickNumber, sequence: this.sequence, active: [item], pending: [] }); if (this.active.has(item.channel))
        throw new Error(`Duplicate active animation channel '${item.channel}'`); if (!this.animations.has(item.animationId))
        throw new Error(`Unknown animation '${item.animationId}'`); this.active.set(item.channel, clone(item)); }
}
function sample(keyframes, tick) { let result = keyframes[0].value; for (const keyframe of keyframes) {
    if (keyframe.tick > tick)
        break;
    result = keyframe.value;
} return clone(result); }
function validateId(value, name) { if (typeof value !== "string" || !/^[a-zA-Z0-9._:-]{1,120}$/.test(value))
    throw new Error(`Invalid ${name}`); }
function assertKeys(value, allowed, name) { const keys = new Set(allowed); for (const key of Object.keys(value))
    if (!keys.has(key))
        throw new Error(`Unknown ${name} field '${key}'`); }
function isRecord(value) { return !!value && typeof value === "object" && !Array.isArray(value); }
function integer(value) { return typeof value === "number" && Number.isSafeInteger(value); }
function nonNegativeInteger(value) { return integer(value) && value >= 0; }
function positiveInteger(value) { return integer(value) && value > 0; }
function clone(value) { return structuredClone(value); }
function byInstance(a, b) { return a.channel.localeCompare(b.channel) || a.instanceId.localeCompare(b.instanceId); }
const INTERRUPTIONS = new Set(["replace", "higher-priority", "ignore"]);
export const presentation = {
    createAnimation(settings) { const result = { schemaVersion: 1, ...clone(settings) }; validateAnimationSettings(result); return result; },
    createRuntime(runtimeId, settings) { return new PresentationRuntime(runtimeId, settings); },
    play(eventId, animationId, options = {}) { return { schemaVersion: 1, type: "play", eventId, animationId, ...clone(options) }; },
    cancel(eventId, options) { return { schemaVersion: 1, type: "cancel", eventId, ...clone(options) }; },
    validateAnimation: validateAnimationSettings,
    validateEvent: validatePresentationEvent,
    validateRuntime: validatePresentationRuntimeSettings,
};
