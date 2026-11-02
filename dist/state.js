// The records (CONTRACTS.md §2). Plain JSON, versioned, no game meaning. Opaque strings are stored and compared,
// never interpreted: good ids, recipe ids, holders, market ids, skill and band ids, equipment ids.
export function initialState() {
    return { version: 1, day: 0, counters: {}, goods: {}, recipes: {}, inventories: {}, markets: {}, shipments: {}, organisations: {}, tickTrace: [] };
}
