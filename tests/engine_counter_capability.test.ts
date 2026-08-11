import { expect, test } from "bun:test";
import { EngineEffectRegistry, EngineSystemRegistry, COUNTER_ADD_EFFECT_ID, COUNTER_CAPABILITY, COUNTER_RESET_EFFECT_ID, COUNTER_SET_EFFECT_ID, registerCounterCommands, validateCounterEffectSettings, validateCounterTriggerBinding } from "@coffeemakerstudio/roast";

const target = { type: "counter" as const, counterId: "coins" };

test("counter commands register with generic capability metadata", () => {
	const effects = registerCounterCommands(new EngineEffectRegistry());
	const framework = new EngineSystemRegistry().register({ id: "core.counter", provides: [COUNTER_CAPABILITY], acceptsEffects: [COUNTER_SET_EFFECT_ID, COUNTER_ADD_EFFECT_ID, COUNTER_RESET_EFFECT_ID] }).select(["core.counter"]);
	for (const effect of [
		{ schemaVersion: 1 as const, type: COUNTER_SET_EFFECT_ID, target, typeValue: { value: 5 } },
		{ schemaVersion: 1 as const, type: COUNTER_ADD_EFFECT_ID, target, typeValue: { amount: -2 } },
		{ schemaVersion: 1 as const, type: COUNTER_RESET_EFFECT_ID, target, typeValue: {} },
	]) {
		validateCounterEffectSettings(effect);
		expect(() => effects.validate(effect)).not.toThrow();
	}
	expect(() => new EngineSystemRegistry().register({ id: "core.counter", provides: [COUNTER_CAPABILITY], acceptsEffects: [COUNTER_ADD_EFFECT_ID] }).select(["core.counter"])).not.toThrow();
	 expect(framework.systemOrder).toEqual(["core.counter"]);
});

test("counter trigger bindings use existing trigger vocabulary", () => {
	validateCounterTriggerBinding({
		trigger: "round.start",
		effect: { schemaVersion: 1, type: COUNTER_ADD_EFFECT_ID, target, typeValue: { amount: 1 } },
	});
	expect(() => validateCounterTriggerBinding({ trigger: "unknown", effect: { schemaVersion: 1, type: COUNTER_ADD_EFFECT_ID, target, typeValue: { amount: 1 } } })).toThrow();
});

test("counter commands reject invalid targets and payloads", () => {
	for (const effect of [
		{ schemaVersion: 1, type: COUNTER_ADD_EFFECT_ID, target: { type: "entity", entityId: "x" }, typeValue: { amount: 1 } },
		{ schemaVersion: 1, type: COUNTER_ADD_EFFECT_ID, target, typeValue: { amount: Number.POSITIVE_INFINITY } },
		{ schemaVersion: 1, type: COUNTER_RESET_EFFECT_ID, target, typeValue: { value: 0 } },
		{ type: COUNTER_SET_EFFECT_ID, target, typeValue: { value: 1 } },
	]) expect(() => validateCounterEffectSettings(effect)).toThrow();
});
