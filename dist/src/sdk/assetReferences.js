/** Collects only explicit render-asset fields from JSON-safe engine/KORE settings. */
export function collectAssetReferences(settings) {
    const references = new Set();
    const add = (value) => {
        if ((typeof value === "string" && value.length > 0) || (typeof value === "number" && Number.isFinite(value)))
            references.add(value);
    };
    const record = (value) => typeof value === "object" && value !== null && !Array.isArray(value) ? value : undefined;
    const root = record(settings);
    if (!root)
        return [];
    const background = record(root.background);
    if (background?.type === "image")
        add(background.url);
    if (Array.isArray(root.players))
        for (const player of root.players) {
            const value = record(player);
            add(value?.playericon);
            add(value?.hoop);
        }
    const visitUiNode = (value) => {
        const node = record(value);
        if (!node)
            return;
        if (node.kind === "image")
            add(node.source);
        if (Array.isArray(node.elements))
            for (const child of node.elements)
                visitUiNode(child);
    };
    if (Array.isArray(root.screens))
        for (const screen of root.screens) {
            const value = record(screen);
            if (Array.isArray(value?.elements))
                for (const child of value.elements)
                    visitUiNode(child);
        }
    return [...references];
}
