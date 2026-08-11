import { expect, test } from "bun:test";
import { EngineEffectRegistry } from "@coffeemakerstudio/roast";

test("effect catalog validates payloads and describes only JSON-safe metadata", () => {
	const effects = new EngineEffectRegistry().register({
		id: "movement.apply-impulse",
		requiresCapability: ["movement.velocity"],
		targetType: "entity",
		lifecycleCategory: "command",
		validatePayload: payload => {
			if (!payload || typeof payload !== "object" || Array.isArray(payload) || typeof payload.x !== "number" || typeof payload.y !== "number") throw new Error("Impulse payload is invalid");
		},
	});

	expect(() => effects.validate({ type: "movement.apply-impulse", schemaVersion: 1, typeValue: { x: 1, y: 0 } })).not.toThrow();
	expect(() => effects.validate({ type: "movement.apply-impulse", typeValue: { x: "bad", y: 0 } })).toThrow();
	expect(effects.describe()).toEqual([{ id: "movement.apply-impulse", schemaVersion: 1, requiresCapability: ["movement.velocity"], targetType: "entity", lifecycleCategory: "command" }]);
});
