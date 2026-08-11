/** JSON values accepted at the engine/framework serialization boundary. */
export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

/** Versioned, data-only identity of a registered engine system. */
/** Existing runtime snapshots retain an open structural state type; SDK validation narrows it to JSON. */
export type SystemSettings = { systemId: string; schemaVersion: 1; state: Record<string, unknown> };

/** Rejects executable, non-finite, or otherwise non-JSON settings data. */
export function assertJsonValue(value: unknown): asserts value is JsonValue {
	if (value === null || typeof value === "string" || typeof value === "boolean") return;
	if (typeof value === "number") {
		if (Number.isFinite(value)) return;
		throw new Error("System settings must contain finite JSON numbers");
	}
	if (Array.isArray(value)) { value.forEach(assertJsonValue); return; }
	if (typeof value === "object") {
		for (const child of Object.values(value as Record<string, unknown>)) assertJsonValue(child);
		return;
	}
	throw new Error("System settings must contain JSON data only");
}
