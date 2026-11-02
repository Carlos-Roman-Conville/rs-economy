// The labour market (CONTRACTS.md §5): a quote per role per market from the posts Settlement shows (through the
// reader) and the person-hours the host's sources could supply. A pure query: Economy never writes a post, and whether a
// quote ever reaches Post.wage is Rex's (Settlement Q10). The rule is a config key; the default quotes the going
// rate with no pressure, which is the open state.
function median(values) {
    if (!values.length)
        return null;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
export function wageQuote(config, reader, labour, market, role, day, sources) {
    const rolePosts = reader.posts(market).filter((post) => post.role === role);
    const demandHours = rolePosts.reduce((sum, post) => sum + post.hours, 0);
    const supplyHours = sources.reduce((sum, source) => sum + labour.hours(source, role, day), 0);
    const med = median(rolePosts.map((post) => post.wage));
    const rule = config.wageRule;
    let quote = med;
    if (med !== null && rule.kind === 'ratio') {
        const pressure = (demandHours - supplyHours) / Math.max(demandHours, supplyHours, 1);
        quote = med * Math.min(rule.ceiling, Math.max(rule.floor, 1 + rule.elasticity * pressure));
    }
    return { market, role, day, posts: rolePosts.length, filled: rolePosts.filter((post) => post.filledBy !== null).length, demandHours, supplyHours, median: med, quote, rule: rule.kind };
}
/** Quotes for every role that has a post in the market. */
export function wageQuotes(config, reader, labour, market, day, sources) {
    const roles = [...new Set(reader.posts(market).map((post) => post.role))].sort();
    return roles.map((role) => wageQuote(config, reader, labour, market, role, day, sources));
}
