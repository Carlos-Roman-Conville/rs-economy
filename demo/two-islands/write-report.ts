import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { loadFixture } from './fixture.ts'
import { report } from './report.ts'
import { runTwoIslands } from './run.ts'

const root = fileURLToPath(new URL('.', import.meta.url))
const fixture = loadFixture()
const result = runTwoIslands(fixture)
const data = report(result, fixture)

function fmt(value: number | null): string {
  return value === null ? 'null' : value.toFixed(4)
}

function table(headers: string[], rows: string[][]): string {
  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map(r => (r[i] ?? '').length)))
  const line = (cells: string[]) => `| ${cells.map((c, i) => c.padEnd(widths[i])).join(' | ')} |`
  const sep = `| ${widths.map(w => '-'.repeat(w)).join(' | ')} |`
  return [line(headers), sep, ...rows.map(line)].join('\n')
}

const sections: string[] = [
  '# Two islands report (test fiction)',
  '',
  `Seed: **${data.seed}**`,
  '',
  '## Ratios (daily spread and stdev)',
]

for (const series of data.ratios.slice(0, 6)) {
  sections.push(`### ${series.island} ${series.give}/${series.want}`)
  sections.push(table(['day', 'fills', 'spread', 'stdev'],
    series.days.map(row => [String(row.day), String(row.fills), fmt(row.spread), fmt(row.stdev)])))
  sections.push('')
}
if (data.ratios.length > 6) sections.push(`_(${data.ratios.length - 6} more ratio series omitted in summary)_`, '')

sections.push('## Gap vs transport band', '')
for (const series of data.gap.slice(0, 4)) {
  sections.push(`### ${series.give}/${series.want}`)
  sections.push(table(['day', 'median A', 'median B', 'gap', 'travelDays', 'lossP', 'inside'],
    series.days.map(row => [String(row.day), fmt(row.medianA), fmt(row.medianB), fmt(row.gap),
      String(row.band.travelDays), String(row.band.lossProbability), row.insideBand === null ? 'null' : String(row.insideBand)])))
  sections.push('')
}

sections.push('## Society acceptance (5-day window)', '')
for (const series of data.share) {
  sections.push(`### ${series.island} (${series.organisation})`)
  sections.push(table(['day', 'window', 'gold', 'B.crown'],
    series.days.map(row => [String(row.day), `${row.window.from}–${row.window.to}`, fmt(row.gold), fmt(row.crown)])))
  sections.push('')
}

sections.push('## Media in use', '')
for (const series of data.media) {
  sections.push(`### Island ${series.island}`)
  sections.push(table(['day', 'top media (trades)'],
    series.days.map(row => [String(row.day), row.assets.slice(0, 4).map(a => `${a.id}:${a.trades}`).join(', ') || '—'])))
  sections.push('')
}

sections.push('## Volume', '')
sections.push(table(['day', 'trades'], data.volume.map(row => [String(row.day), String(row.trades)])))
sections.push('')

sections.push('## Refusals by reason', '')
sections.push(table(['day', 'reasons'],
  data.refusals.map(row => [String(row.day), Object.entries(row.byReason).map(([k, v]) => `${k}:${v}`).join(', ') || '—'])))
sections.push('')

sections.push(`## Outcome`, '', `**${data.outcome}**`, '',
  'Measured, not asserted: any outcome is valid (design v2 §8, R8).', '')

writeFileSync(`${root}REPORT.md`, sections.join('\n'))
console.log(`Wrote ${root}REPORT.md (outcome: ${data.outcome})`)
