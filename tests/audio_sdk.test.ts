import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { ApplicationAudioMixer, AudioEmitter, AudioRuntime, audio, createAudioSettings, validateAudioSettings, type AudioOutputPort } from "@coffeemakerstudio/roast";

const play = (sourceId: string, soundId: string, priority: number = 0, extra: object = {}) => audio.command.play({ sourceId, soundId, bus: "effects", priority, ...extra });

test("generic audio commands and settings are JSON-safe and reconstruct persistent intent only", () => {
	const emitter = new AudioEmitter("player.one");
	emitter.emit(audio.command.loop({ sourceId: "player.one", soundId: "wind", bus: "ambience", volume: 0.5 }));
	emitter.emit(play("player.one", "collision", 5));
	const runtime = new AudioRuntime(createAudioSettings({ runtimeId: "game" }));
	expect(runtime.drainOutput().commands).toEqual([]); // no hidden output without an explicit tick
	runtime.tick([emitter]);
	expect(runtime.drainOutput().commands.map(command => command.type)).toEqual(["startLoop", "playSound"]);
	const settings = JSON.parse(JSON.stringify(runtime.toSettings()));
	expect(settings.persistentSources).toEqual([{ sourceId: "player.one", command: { type: "startLoop", sourceId: "player.one", soundId: "wind", bus: "ambience", volume: 0.5 } }]);
	const restored = new AudioRuntime(settings);
	expect(restored.drainOutput().commands).toEqual([]); // consumed one-shots never replay on reconstruction
	restored.restorePersistentIntent(); restored.tick([]);
	expect(restored.drainOutput().commands.map(command => command.type)).toEqual(["startLoop"]);
	expect(restored.toSettings().persistentSources).toEqual(settings.persistentSources);
});

test("sound collection skips unsupported entities and is insertion-order independent", () => {
	const first = new AudioEmitter("a"); const second = new AudioEmitter("b");
	first.emit(play("a", "first", 5)); second.emit(play("b", "second", 10));
	const runtime = new AudioRuntime(createAudioSettings({ runtimeId: "game" }));
	runtime.tick([{ unrelated: true }, second, first]);
	expect(runtime.drainOutput().commands.map(command => `${command.globalSourceId}:${command.soundId}`)).toEqual(["game:b:second", "game:a:first"]);
});

test("dedupe, bus limits, controls, and source replacement follow deterministic policy", () => {
	const emitter = new AudioEmitter("source");
	emitter.emit(play("source", "low", 1, { dedupeKey: "hit" }));
	emitter.emit(play("source", "high", 4, { dedupeKey: "hit" }));
	emitter.emit(play("source", "other", 2));
	const settings = createAudioSettings({ runtimeId: "game", buses: [audio.bus({ id: "master", volume: 1, muted: false, maxVoices: 64, defaultPriority: 0, paused: false }), audio.bus({ id: "effects", volume: 1, muted: false, maxVoices: 1, defaultPriority: 0, paused: false })] });
	const runtime = new AudioRuntime(settings); runtime.tick([emitter]);
	const batch = runtime.drainOutput();
	expect(batch.commands.map(command => command.soundId)).toEqual(["high"]);
	expect(batch.diagnostics.deduplicated).toBe(1);
	expect(batch.diagnostics.droppedByPriority).toBe(1);
	runtime.submit(audio.command.setBusVolume({ sourceId: "settings", bus: "effects", volume: 0.25, muted: true })); runtime.tick([]);
	expect(runtime.drainOutput().commands[0]).toMatchObject({ type: "setBusVolume", volume: 0.25, muted: true });
});

test("application mixer namespaces runtimes and deterministically owns one music slot", () => {
	const menu = new AudioEmitter("menu"); const game = new AudioEmitter("game");
	menu.emit(audio.command.music({ sourceId: "menu", soundId: "menu-track", bus: "music", priority: 10, replacementPolicy: "replace-lower-or-equal" }));
	game.emit(audio.command.music({ sourceId: "game", soundId: "match-track", bus: "music", priority: 20, replacementPolicy: "replace-lower-or-equal" }));
	const menuRuntime = new AudioRuntime(createAudioSettings({ runtimeId: "menu-runtime" })); const gameRuntime = new AudioRuntime(createAudioSettings({ runtimeId: "game-runtime" }));
	menuRuntime.tick([menu]); gameRuntime.tick([game]);
	const mixer = new ApplicationAudioMixer("browser"); mixer.submit(menuRuntime.drainOutput()); mixer.submit(gameRuntime.drainOutput());
	const output = mixer.flush();
	expect(output.commands.filter(command => command.type === "playMusic")).toHaveLength(1);
	expect(output.commands.find(command => command.type === "playMusic")).toMatchObject({ soundId: "match-track", globalSourceId: "game-runtime:game" });
	expect(mixer.toSettings().activeMusic?.soundId).toBe("match-track");
});

test("a higher-priority music replacement emits an ordered stop for the old global source", () => {
	const menu = new AudioEmitter("menu"); const game = new AudioEmitter("game");
	const menuRuntime = new AudioRuntime(createAudioSettings({ runtimeId: "menu-runtime" })); const gameRuntime = new AudioRuntime(createAudioSettings({ runtimeId: "game-runtime" })); const mixer = new ApplicationAudioMixer("browser");
	menu.emit(audio.command.music({ sourceId: "menu", soundId: "menu-track", bus: "music", priority: 10 })); menuRuntime.tick([menu]); mixer.submit(menuRuntime.drainOutput()); mixer.flush();
	game.emit(audio.command.music({ sourceId: "game", soundId: "match-track", bus: "music", priority: 20 })); gameRuntime.tick([game]); mixer.submit(gameRuntime.drainOutput());
	expect(mixer.flush().commands.map(command => `${command.type}:${command.globalSourceId}`)).toEqual(["stopSource:menu-runtime:menu", "playMusic:game-runtime:game"]);
});

test("validation rejects malformed settings and generic layers remain browser and KORE independent", () => {
	const malformed = createAudioSettings({ runtimeId: "x" }) as any; malformed.buses[0].volume = 2;
	expect(() => validateAudioSettings(malformed)).toThrow("Invalid audio bus");
	expect(() => audio.validateCommand({ type: "playSound", sourceId: "bad id", soundId: "sound", bus: "effects" })).toThrow("Invalid audio source ID");
	expect(() => new AudioEmitter("x").emit(audio.command.play({ sourceId: "x", soundId: "sound", bus: "missing" }))).not.toThrow(); // bus resolution happens in the sound system
	const source = readFileSync("src/audio-sdk/index.ts", "utf8");
	expect(source).not.toMatch(/from\s+["'].*(?:kore|menu|browser|AudioManager|ui-sdk)["']/);
	expect(readFileSync("src/sdk/index.ts", "utf8")).not.toContain("audio-sdk");
	const port: AudioOutputPort = { apply(batch) { expect(batch.schemaVersion).toBe(1); } };
	const mixer = new ApplicationAudioMixer("output"); port.apply(mixer.flush());
});
