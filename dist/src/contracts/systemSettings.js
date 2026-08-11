/** Rejects executable, non-finite, or otherwise non-JSON settings data. */
export function assertJsonValue(value) {
    if (value === null || typeof value === "string" || typeof value === "boolean")
        return;
    if (typeof value === "number") {
        if (Number.isFinite(value))
            return;
        throw new Error("System settings must contain finite JSON numbers");
    }
    if (Array.isArray(value)) {
        value.forEach(assertJsonValue);
        return;
    }
    if (typeof value === "object") {
        for (const child of Object.values(value))
            assertJsonValue(child);
        return;
    }
    throw new Error("System settings must contain JSON data only");
}
