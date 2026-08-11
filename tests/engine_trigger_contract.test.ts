import { expect, test } from "bun:test";
import { EngineTriggerActivationQueue, createCollisionEnterTriggerEvent, createEnvironmentActivationTriggerEvent, createRoundStartTriggerEvent, createTickTriggerEvent, createTriggerActivation, validateTriggerActivation, validateTriggerEvent } from "@coffeemakerstudio/roast";

test("typed trigger events are versioned, detached, and JSON-safe", () => {
	const tick = createTickTriggerEvent({ sourceId: "world", sequence: 4, dt: 0.016 });
	const collision = createCollisionEnterTriggerEvent({ sourceId: "physics", sequence: 5, entityId: "a", otherId: "wall-1", contactKey: "a|wall-1" });

	expect(tick).toEqual({ schemaVersion: 1, type: "tick", sourceId: "world", sequence: 4, payload: { dt: 0.016 } });
	expect(collision).toEqual({ schemaVersion: 1, type: "collision.enter", sourceId: "physics", sequence: 5, payload: { entityId: "a", otherId: "wall-1", contactKey: "a|wall-1" } });
	expect(JSON.parse(JSON.stringify({ tick, collision }))).toEqual({ tick, collision });
});

test("trigger validation rejects unknown kinds, fields, and invalid timing", () => {
	expect(() => validateTriggerEvent({ schemaVersion: 1, type: "round.start", sourceId: "rules", sequence: 0, payload: {} })).toThrow(/missing/);
	expect(() => validateTriggerEvent({ schemaVersion: 1, type: "tick", sourceId: "world", sequence: 0, payload: { dt: -1 } })).toThrow(/dt/);
	expect(() => validateTriggerEvent({ schemaVersion: 1, type: "collision.enter", sourceId: "physics", sequence: 0, payload: { entityId: "a", otherId: "b", contactKey: "c", extra: true } })).toThrow(/unknown field/);
});

test("round-start trigger events carry deterministic turn context", () => {
	const event = createRoundStartTriggerEvent({ sourceId: "rules", sequence: 3, turnNumber: 3, activeTeam: 1, phase: "physics" });

	expect(event.payload).toEqual({ turnNumber: 3, activeTeam: 1, phase: "physics" });
	expect(() => validateTriggerEvent({ ...event, payload: { ...event.payload, activeTeam: -1 } })).toThrow(/activeTeam/);
});

test("environment activation events carry bounded lifecycle state", () => {
	const event = createEnvironmentActivationTriggerEvent({ sourceId: "environment", sequence: 2, mechanicId: "pulse", mechanicIndex: 0, tick: 2, active: true });

	expect(event.payload).toEqual({ mechanicId: "pulse", mechanicIndex: 0, tick: 2, active: true });
	expect(() => validateTriggerEvent({ ...event, payload: { ...event.payload, tick: -1 } })).toThrow(/tick/);
});

test("activation pairs a trigger event with data-only Effect identity", () => {
	const event = createTickTriggerEvent({ sourceId: "world", sequence: 1, dt: 1 });
	const activation = createTriggerActivation({ effectId: "movement.integrate", event });

	expect(activation).toEqual({ schemaVersion: 1, effectId: "movement.integrate", event });
	expect(() => validateTriggerActivation({ ...activation, effectId: "" })).toThrow(/effectId/);
	const detached = createTriggerActivation({ effectId: activation.effectId, event });
	expect(detached.event).not.toBe(event);
});

test("activation dispatch is FIFO and bounded against recursive chains", () => {
	const queue = new EngineTriggerActivationQueue(3);
	const event = createTickTriggerEvent({ sourceId: "world", sequence: 1, dt: 1 });
	const activation = createTriggerActivation({ effectId: "movement.integrate", event });
	const seen: number[] = [];
	queue.enqueue(activation);

	expect(() => queue.process(current => {
		seen.push(current.event.sequence);
		if (current.event.type === "tick") queue.enqueue({ ...current, event: { ...current.event, sequence: current.event.sequence + 1 } });
	})).toThrow(/budget/);
	expect(seen).toEqual([1, 2, 3]);
	expect(() => queue.enqueue(activation)).toThrow(/budget/);
});
