import { expect, test } from "bun:test";
import { canonicalizeCounterStates, createCounterState, validateCounterState } from "@coffeemakerstudio/roast";

test("counter state is complete, detached, and canonically ordered", () => {
	const created = createCounterState({ id: "team-0-score" });
	expect(created).toEqual({ schemaVersion: 1, id: "team-0-score", value: 0 });
	const input = [{ schemaVersion: 1, id: "kills", value: 2 }, created];
	const canonical = canonicalizeCounterStates(input);
	input[0]!.value = 99;
	expect(canonical).toEqual([
		{ schemaVersion: 1, id: "kills", value: 2 },
		{ schemaVersion: 1, id: "team-0-score", value: 0 },
	]);
});

test("counter state rejects malformed current values", () => {
	for (const value of [
		{ id: "x", value: 0 },
		{ schemaVersion: 2, id: "x", value: 0 },
		{ schemaVersion: 1, id: "", value: 0 },
		{ schemaVersion: 1, id: "x", value: Number.NaN },
		{ schemaVersion: 1, id: "x", value: 0, extra: true },
	]) expect(() => validateCounterState(value)).toThrow();
});

test("counter state rejects duplicate identities", () => {
	expect(() => canonicalizeCounterStates([
		createCounterState({ id: "same" }),
		createCounterState({ id: "same", value: 1 }),
	])).toThrow("unique");
});
