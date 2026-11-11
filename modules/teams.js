// Page: Teams (E3, E12, E13, E14).
// Owner: Teams module. Also owns the team dossier in the drawer.
import {
  $, h, boot, q, str, pad, fmtTime, fmtGap,
  fmtNum, fmtInt, shortTeam, TERRAIN, GLYPH, terrainVar, terrain, table,
  riderCol, teamLink, teamCol, natLink, stageLink, live, tokens, baseOpt,
  axisStyle, chart, sweep, redrawAll, panel, seg, select, S,
  loadLookups, riderColor, open, closeDrawer, VIEWS, kv, sqlShow, hooks,
  toConsole,
} from '../shared/core.js'

async function teamView(key, title, body) {
  const [t] = await q(`SELECT t.*, c.team_time, c.team_rank FROM dim_team t LEFT JOIN v_team_classification c USING (team_key) WHERE t.team_key = ${Number(key)}`)
  title.textContent = t.team_name
  const sql = `WITH ranked AS (
  SELECT f.*,
         ROW_NUMBER() OVER (
           PARTITION BY f.team_key, f.stage_key
           ORDER BY f.finish_time, f.stage_rank, f.rider_key
         ) AS team_order
  FROM fact_results f
  WHERE f.team_key = ${Number(key)}
)
SELECT r.rider_key, r.rider_name, r.rider_country_code, r.race_status, r.exit_stage,
       COUNT(x.stage_key) AS stages, AVG(x.gap_to_winner)::float8 AS avg_gap,
       COUNT(x.stage_key) FILTER (WHERE x.team_order <= 3) AS team_top3,
       SUM(x.adjusted_time) AS total_time, COALESCE(SUM(x.is_top10), 0) AS top10s, g.gc_rank
FROM dim_rider r
LEFT JOIN ranked x USING (rider_key)
LEFT JOIN v_gc g USING (rider_key)
WHERE r.team_name = ${str(t.team_name)}
GROUP BY r.rider_key, g.gc_rank
ORDER BY team_top3 DESC, top10s DESC, r.rider_name;`
  const riders = await q(sql)
  const fin = riders.filter((r) => r.race_status === 'Finished').length
  body.append(kv([[t.team_country_code, t.team_country_name], [riders.length, 'Roster size'], [fin, 'Finishers'],
    [new Set(riders.map((r) => r.rider_country_code)).size, 'Rider nationalities'], [`#${t.team_rank}`, 'Team classification rank'],
    [fmtTime(t.team_time), 'Team classification time']]))
  body.append(h('h3', {}, 'Rider performance'), h('p', { class: 'dim' }, 'Team top 3 counts selection for the reconstructed team classification; it does not measure tactical role or causal contribution. Adjusted time supports the team roll-up, not a contribution score.'), table({
    cols: [riderCol(), { k: 'rider_country_code', l: 'Nat.', f: (v) => natLink(v) }, { k: 'gc_rank', l: 'GC', n: 1, f: (v, r) => v ?? `Out S${r.exit_stage}` },
      { k: 'stages', l: 'Stages', n: 1 }, { k: 'avg_gap', l: 'Avg. gap', n: 1, f: (v) => (v == null ? '-' : fmtGap(v)) }, { k: 'team_top3', l: 'Team top 3', n: 1 },
      { k: 'total_time', l: 'Adj. time', n: 1, f: fmtTime }, { k: 'top10s', l: 'Top 10', n: 1 }], rows: riders,
  }))
  const heat = await q(`SELECT r.rider_name, s.stage_id, f.gap_to_winner FROM fact_results f JOIN dim_rider r USING (rider_key) JOIN dim_stage s USING (stage_key) WHERE r.team_name = ${str(t.team_name)}`)
  const names = riders.filter((r) => r.stages > 0).map((r) => r.rider_name).reverse()
  const cap = 1800
  body.append(h('h3', {}, 'Per-stage profile: time lost to the stage winner'), chart((o) => ({
    ...baseOpt(o), legend: undefined,
    grid: { left: 130, right: 12, top: 6, bottom: 56 },
    xAxis: { type: 'category', data: S.stages.map((s) => `S${s.stage_id}`), ...axisStyle(o), splitLine: { show: false } },
    yAxis: { type: 'category', data: names, ...axisStyle(o), axisLabel: { color: o.ink2, fontSize: 12 }, splitLine: { show: false } },
    visualMap: { min: 0, max: cap, calculable: false, orient: 'horizontal', left: 130, bottom: 2, itemWidth: 10, itemHeight: 120, text: ["30'+", '0"'], textStyle: { color: o.muted, fontSize: 11 }, inRange: { color: [o.sunken, o.s[0]] } },
    tooltip: { ...baseOpt(o).tooltip, formatter: (p) => `${names[p.value[1]]}, S${p.value[0] + 1}: ${fmtGap(p.value[2])}` },
    series: [{ type: 'heatmap', data: heat.map((x) => [x.stage_id - 1, names.indexOf(x.rider_name), x.gap_to_winner]), itemStyle: { borderColor: o.surface, borderWidth: 1 } }],
  }), { height: 80 + names.length * 26 + 30 }))
  const tt = await q(`SELECT s.stage_id, s.terrain, r.rider_key, r.rider_name, f.stage_rank FROM fact_results f JOIN dim_rider r USING (rider_key) JOIN dim_stage s USING (stage_key) WHERE f.team_key = ${Number(key)} AND f.is_top10 = 1 ORDER BY s.stage_id, f.stage_rank`)
  if (tt.length) body.append(h('h3', {}, `Top-ten finishes (${tt.length})`), table({ cols: [{ k: 'stage_id', l: 'Stage', f: (v) => stageLink(v) }, { k: 'terrain', l: 'Type', f: (v) => terrain(v) }, riderCol(), { k: 'stage_rank', l: 'Rank', n: 1 }], rows: tt }))
  body.append(sqlShow(sql))
}
VIEWS.team = teamView

// ---------- Page: Teams (E3, E13, E14) ----------
async function pageTeams(root) {
  const sql = `WITH squad AS (
  SELECT team_name, COUNT(*) AS riders, COUNT(*) FILTER (WHERE race_status = 'Finished') AS finishers,
         COUNT(DISTINCT rider_country_code) AS nations
  FROM dim_rider GROUP BY team_name
), perf AS (
  SELECT f.team_key, SUM(f.adjusted_time) AS total_adjusted, SUM(f.is_win) AS wins, SUM(f.is_top10) AS top10s
  FROM fact_results f GROUP BY f.team_key
)
SELECT t.team_key, t.team_name, t.team_country_code, sq.riders, sq.finishers, sq.nations,
       p.total_adjusted, (SELECT AVG(g.total_adjusted)::float8 FROM v_gc g WHERE g.team_name = t.team_name) AS per_finisher, p.wins, p.top10s,
       c.team_time, c.team_rank, c.team_time - MIN(c.team_time) OVER () AS team_gap,
       (SELECT MIN(g.gc_rank) FROM v_gc g WHERE g.team_name = t.team_name) AS best_gc
FROM dim_team t
JOIN squad sq USING (team_name)
JOIN perf p USING (team_key)
JOIN v_team_classification c USING (team_key)
ORDER BY c.team_rank;`
  const rows = await q(sql)
  const p = panel(root, { title: 'Team Classification & Performance', tag: 'E3 E13', sql, note: "Team time sums the three fastest riders' times per stage across all 21 stages; Gap is relative to the leader. Aggregate adjusted time sums all recorded rider-stage results and is affected by withdrawals. Avg. finisher time includes only riders who completed all 21 stages. All 23 teams started with eight riders." })
  p.body.append(table({ rows, onRow: (r) => open({ t: 'team', id: r.team_key }), hit: (r) => r.team_rank === 1, cols: [
    { k: 'team_rank', l: 'Rank', n: 1 }, teamCol(), { k: 'team_country_code', l: 'Reg.', f: (v) => natLink(v) },
    { k: 'team_time', l: 'Team time (best 3/stage)', n: 1, f: fmtTime }, { k: 'team_gap', l: 'Gap', n: 1, f: fmtGap },
    { k: 'total_adjusted', l: 'Aggregate adj. time', n: 1, f: fmtTime }, { k: 'per_finisher', l: 'Avg. finisher time', n: 1, f: fmtTime },
    { k: 'finishers', l: 'Finishers', n: 1 }, { k: 'nations', l: 'Nations', n: 1 }, { k: 'best_gc', l: 'Best GC', n: 1 }, { k: 'wins', l: 'Wins', n: 1 }, { k: 'top10s', l: 'Top 10', n: 1 }] }))

  await rankEvolutionPanel(root)

  const tt = `WITH stage_counts AS (
  SELECT terrain, COUNT(*) AS stages_of_type
  FROM dim_stage
  GROUP BY terrain
), top10 AS (
  SELECT f.team_key, s.terrain, SUM(f.is_top10) AS top10s
FROM fact_results f
JOIN dim_stage s USING (stage_key)
GROUP BY f.team_key, s.terrain
)
SELECT t.team_key, t.team_name, x.terrain, x.top10s, c.stages_of_type,
       ROUND(x.top10s::numeric / c.stages_of_type, 2)::float8 AS top10_per_stage
FROM top10 x
JOIN dim_team t USING (team_key)
JOIN stage_counts c USING (terrain);`
  const data = await q(tt)
  const totals = new Map()
  for (const d of data) totals.set(d.team_name, (totals.get(d.team_name) ?? 0) + Number(d.top10s))
  const order = [...totals].filter(([, v]) => v > 0).sort((a, b) => a[1] - b[1]).map(([n]) => n)
  const keyOf = new Map(data.map((d) => [d.team_name, d.team_key]))
  const tp = panel(root, { title: 'Top-10 Finishes by Team and Stage Type', tag: 'E14', sql: tt, note: "Each bar shows a team's total top-10 finishes across stage types. Hover for per-stage averages or click a bar to explore the team." })
  tp.body.append(chart((t) => ({
    ...baseOpt(t), grid: { left: 8, right: 34, top: 30, bottom: 22, containLabel: true },
    xAxis: { type: 'value', ...axisStyle(t) }, yAxis: { type: 'category', data: order.map(shortTeam), ...axisStyle(t), axisLabel: { color: t.ink2, fontSize: 12 }, splitLine: { show: false } },
    tooltip: { ...baseOpt(t).tooltip, trigger: 'axis', axisPointer: { type: 'shadow', shadowStyle: { color: t.line, opacity: .4 } }, formatter: (ps) => `<b>${shortTeam(order[ps[0].dataIndex])}</b><br>` + ps.map((p) => `${p.marker}${p.seriesName}: ${p.value} · ${Number(p.data.perStage).toFixed(2)} per stage of type`).join('<br>') },
    series: TERRAIN.map((tn, i) => ({ name: tn, type: 'bar', stack: 'x', barWidth: 13, itemStyle: { color: t.s[i], borderColor: t.surface, borderWidth: 1 }, data: order.map((n) => { const d = data.find((x) => x.team_name === n && x.terrain === tn); return { value: Number(d?.top10s ?? 0), perStage: Number(d?.top10_per_stage ?? 0) } }) })),
  }), { height: 60 + order.length * 22, onClick: (e) => open({ t: 'team', id: keyOf.get(order[e.dataIndex]) }) }))
  await consistencyPanel(root)
}

// ---------- Team rank evolution ----------
async function rankEvolutionPanel(root) {
  const sql = `WITH picked AS (
  SELECT f.team_key, s.stage_id, f.finish_time,
         ROW_NUMBER() OVER (
           PARTITION BY f.team_key, f.stage_key
           ORDER BY f.finish_time, f.stage_rank, f.rider_key
         ) AS rn
  FROM fact_results f
  JOIN dim_stage s USING (stage_key)
), stage_team AS (
  SELECT team_key, stage_id, SUM(finish_time) AS stage_team_time, COUNT(*) AS riders_counted
  FROM picked
  WHERE rn <= 3
  GROUP BY team_key, stage_id
), cumulative AS (
  SELECT team_key, stage_id,
         SUM(stage_team_time) OVER (
           PARTITION BY team_key ORDER BY stage_id ROWS UNBOUNDED PRECEDING
         ) AS cumulative_team_time
  FROM stage_team
  WHERE riders_counted = 3
), evolution AS (
  SELECT team_key, stage_id, cumulative_team_time,
         RANK() OVER (PARTITION BY stage_id ORDER BY cumulative_team_time)::int AS team_rank
  FROM cumulative
)
SELECT e.*, t.team_name, v.team_rank AS final_rank
FROM evolution e
JOIN dim_team t USING (team_key)
JOIN v_team_classification v USING (team_key)
ORDER BY v.team_rank, e.stage_id;`
  const rows = await q(sql)
  const teams = [...new Map(rows.map((r) => [r.team_key, { key: r.team_key, name: r.team_name, finalRank: Number(r.final_rank) }])).values()]
  const selected = Object.fromEntries(teams.map((t) => [t.name, t.finalRank <= 6]))
  const keyOf = new Map(teams.map((t) => [t.name, t.key]))
  const rp = panel(root, { title: 'Team rank evolution', tag: 'E3', sql, note: 'Cumulative team rankings after each stage, based on the three fastest riders per team. The final top six are shown by default; select other teams from the legend.' })
  rp.body.append(chart((t) => ({
    ...baseOpt(t),
    legend: { ...baseOpt(t).legend, type: 'scroll', data: teams.map((x) => x.name), selected, formatter: shortTeam },
    grid: { left: 18, right: 24, top: 54, bottom: 32, containLabel: true },
    xAxis: { type: 'category', data: S.stages.map((s) => `S${s.stage_id}`), boundaryGap: false, ...axisStyle(t) },
    yAxis: { type: 'value', inverse: true, min: 1, max: teams.length, interval: 2, ...axisStyle(t), axisLabel: { ...axisStyle(t).axisLabel, formatter: (v) => `#${v}` } },
    tooltip: { ...baseOpt(t).tooltip, trigger: 'axis', formatter: (ps) => `<b>${ps[0].axisValue}</b><br>` + ps.slice().sort((a, b) => a.value - b.value).map((p) => `${p.marker}${shortTeam(p.seriesName)}: #${p.value} · ${fmtTime(p.data.time)}`).join('<br>') },
    series: teams.map((team, i) => ({
      name: team.name, type: 'line', showSymbol: false, symbolSize: 6,
      lineStyle: { width: team.finalRank <= 6 ? 2.5 : 1.5, type: ['solid', 'dashed', 'dotted'][Math.floor(i / 8) % 3], color: t.s[i % 8] },
      itemStyle: { color: t.s[i % 8] }, emphasis: { focus: 'series', lineStyle: { width: 4 } },
      data: rows.filter((r) => r.team_key === team.key).map((r) => ({ value: Number(r.team_rank), time: Number(r.cumulative_team_time) })),
    })),
  }), { height: 410, onClick: (e) => open({ t: 'team', id: keyOf.get(e.seriesName) }) }))
}

// ---------- Consistency (E12) ----------
async function consistencyPanel(root) {
  const cSql = `SELECT r.rider_key, r.rider_name, t.team_key, t.team_name, SUM(f.is_top10) AS top10s,
       STRING_AGG(
         'S' || s.stage_id || ' · ' || s.terrain || ' · ' ||
         CASE f.stage_rank WHEN 1 THEN '1st' WHEN 2 THEN '2nd' WHEN 3 THEN '3rd' ELSE f.stage_rank || 'th' END,
         ', ' ORDER BY s.stage_id
       ) FILTER (WHERE f.is_top10 = 1) AS stages
FROM fact_results f
JOIN dim_rider r USING (rider_key)
JOIN dim_team t USING (team_key)
JOIN dim_stage s USING (stage_key)
GROUP BY r.rider_key, t.team_key
ORDER BY top10s DESC, r.rider_name
LIMIT 10;`
  const cq = panel(root, { title: 'Most Frequent Top-10 Finishers', tag: 'E12', sql: cSql, note: 'Riders ranked by their number of top-10 stage finishes. Click a rider to view the contributing stages, stage types, and finishing ranks.' })
  cq.body.append(table({ rows: await q(cSql), onRow: (r) => open({ t: 'rider', id: r.rider_key }), cols: [riderCol(), teamCol(), { k: 'top10s', l: 'Top-10 Finishes', n: 1 }] }))
}

export default { id: 'teams', label: 'Teams', render: pageTeams }
