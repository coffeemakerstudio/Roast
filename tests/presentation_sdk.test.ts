import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { presentation, PresentationRuntime, validateAnimationSettings } from "@coffeemakerstudio/roast";

	const animation = (id: string, priority = 1, interruption: "replace" | "higher-priority" | "ignore" = "higher-priority") => presentation.createAnimation({ id, channel: "hud", durationTicks: 3, priority, interruption, tracks: [{ id: "opacity", keyframes: [{ tick: 0, value: 0 }, { tick: 1, value: 1 }] }] });

test("animation declarations are versioned, detached JSON and structurally validated", () => {
	const source = { id: "pulse", channel: "hud", durationTicks: 2, priority: 1, interruption: "replace" as const, tracks: [{ id: "x", keyframes: [{ tick: 0, value: { nested: true } }] }] };
	const settings = presentation.createAnimation(source); source.tracks[0]!.keyframes[0]!.value = { nested: false };
	expect(settings.schemaVersion).toBe(1); expect(settings.tracks[0]!.keyframes[0]!.value).toEqual({ nested: true });
	expect(() => validateAnimationSettings({ ...settings, tracks: [{ ...settings.tracks[0], keyframes: [{ tick: 3, value: 1 }] }] })).toThrow();
});

test("the same event trace produces deterministic ordering, timing and projection", () => {
	const make = () => { const runtime = new PresentationRuntime("r", { animations: [animation("low", 1), animation("high", 5)] }); runtime.emit(presentation.play("low-event", "low")); runtime.emit(presentation.play("high-event", "high")); const first = runtime.tick(); const second = runtime.tick(); return [first, second]; };
	expect(make()).toEqual(make());
	const frame = make()[0]!; expect(frame.events.map(event => event.eventId)).toEqual(["high-event"]); expect(frame.animations[0]!.values.opacity).toBe(0);
});

test("priority, cancellation, interruption and runtime restoration are explicit", () => {
	const runtime = new PresentationRuntime("r", { animations: [animation("low", 1), animation("high", 5)] });
	runtime.emit(presentation.play("low", "low")); runtime.tick(); runtime.emit(presentation.play("blocked", "low")); expect(runtime.tick().events).toHaveLength(0);
	runtime.emit(presentation.play("replace", "high")); const replaced = runtime.tick(); expect(replaced.events.map(event => event.type)).toEqual(["cancel", "play"]);
	const restored = new PresentationRuntime("r", { animations: [animation("low", 1), animation("high", 5)], ...runtime.toSettings() });
	expect(restored.project()).toEqual(runtime.project());
	runtime.emit(presentation.cancel("stop", { channel: "hud" })); expect(runtime.tick().events[0]!.type).toBe("cancel");
});

test("presentation is a visual projection outside canonical engine settings and stays renderer-neutral", () => {
	const engineSource = readFileSync("src/sdk/index.ts", "utf8"); const presentationSource = readFileSync("src/presentation-sdk/index.ts", "utf8");
	expect(engineSource).not.toContain("presentation-sdk"); expect(presentationSource).not.toMatch(/p5|DOM|AudioManager|requestAnimationFrame|addEventListener/);
	const runtime = presentation.createRuntime("r", { animations: [animation("pulse")] }); runtime.emit(presentation.play("e", "pulse")); const frame = runtime.tick();
	expect(frame.animations).toHaveLength(1); expect(runtime.toSettings()).not.toHaveProperty("players"); expect(JSON.parse(JSON.stringify(runtime.toSettings()))).toEqual(runtime.toSettings());
});
