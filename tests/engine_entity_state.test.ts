import { expect, test } from "bun:test";
import { engine, createMovementState, createTransformState, validateMovementState, validateTransformState } from "@coffeemakerstudio/roast";

test("generic Transform and Movement state is versioned, typed, and detached", () => {
	const transform = createTransformState({ position: { x: 10, y: 20 }, rotation: 45 });
	const movement = createMovementState({ velocity: { x: 2, y: -1 }, angularVelocity: 3 });

	expect(transform).toEqual({ schemaVersion: 1, position: { x: 10, y: 20 }, rotation: 45 });
	expect(movement).toEqual({ schemaVersion: 1, velocity: { x: 2, y: -1 }, angularVelocity: 3, enabled: true });
	expect(JSON.parse(JSON.stringify({ transform, movement }))).toEqual({ transform, movement });
});

test("state validators reject unknown, malformed, and non-finite values", () => {
	expect(() => validateTransformState({ schemaVersion: 1, position: { x: 0, y: 0 }, rotation: 0, extra: true })).toThrow();
	expect(() => validateMovementState({ schemaVersion: 1, velocity: { x: Number.NaN, y: 0 }, angularVelocity: 0, enabled: true })).toThrow();
	expect(() => engine.createTransformState({ position: { x: 1, y: 2 } })).not.toThrow();
});
