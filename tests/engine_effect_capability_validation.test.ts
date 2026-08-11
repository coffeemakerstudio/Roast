import { expect, test } from "bun:test";
import { EngineEffectRegistry, EngineSystemRegistry } from "@coffeemakerstudio/roast";

test("framework validation requires an accepted Effect and its capabilities", () => {
	const effects = new EngineEffectRegistry().register({ id: "movement.apply-impulse", requiresCapability: ["movement.velocity"] });
	const systems = new EngineSystemRegistry()
		.register({ id: "movement", provides: ["movement.velocity"], acceptsEffects: ["movement.apply-impulse"] })
		.register({ id: "unrelated" });
	const framework = systems.select(["movement"]);

	expect(() => systems.validateEffectSupport(framework, [{ type: "movement.apply-impulse", typeValue: {} }], effects)).not.toThrow();
	expect(() => systems.validateEffectSupport(systems.select(["unrelated"]), [{ type: "movement.apply-impulse", typeValue: {} }], effects)).toThrow(/accepts/);
});

test("effect capability validation rejects missing providers and duplicate registrations", () => {
	const effects = new EngineEffectRegistry().register({ id: "score.increment", requiresCapability: ["score"] });
	const systems = new EngineSystemRegistry().register({ id: "input", acceptsEffects: ["score.increment"] });

	expect(() => systems.validateEffectSupport(systems.select(["input"]), [{ type: "score.increment", typeValue: 1 }], effects)).toThrow(/missing capability/);
	expect(() => effects.register({ id: "score.increment" })).toThrow(/Duplicate/);
});
