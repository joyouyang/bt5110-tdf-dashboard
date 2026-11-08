// Page: Teams (E3, E12, E13, E14).
// Owner: Teams module. Also owns the team dossier in the drawer.
import {
  $, h, boot, q, str, pad, fmtTime, fmtGap,
  fmtNum, fmtInt, shortTeam, TERRAIN, GLYPH, terrainVar, terrain, table,
  riderCol, teamLink, teamCol, natLink, stageLink, live, tokens, baseOpt,
  axisStyle, chart, sweep, redrawAll, panel, seg, select, S,
  loadLookups, riderColor, open, closeDrawer, VIEWS, kv, sqlShow, hooks,
  toConsole,
} from '../core.js'

async function teamView(key, title, body) {
  const [t] = await q(`SELECT t.*, c.team_time, c.team_rank FROM dim_team t LEFT JOIN v_team_classification c USING (team_key) WHERE t.team_key = ${Number(key)}`)
  title.textContent = t.team_name
  const sql = `SELECT r.rider_key, r.rider_name, r.rider_country_code, r.race_status, r.exit_stage,
       COUNT(f.stage_key) AS stages, SUM(f.adjusted_time) AS total_time,
       ROUND(100.0 * SUM(f.adjusted_time) / SUM(SUM(f.adjusted_time)) OVER (), 1)::float8 AS share_pct,
       COALESCE(SUM(f.is_top10), 0) AS top10s, g.gc_rank
FROM dim_rider r
LEFT JOIN fact_results f USING (rider_key)
LEFT JOIN v_gc g USING (rider_key)
WHERE r.team_name = ${str(t.team_name)}
GROUP BY r.rider_key, g.gc_rank
ORDER BY total_time DESC NULLS LAST;`
  const riders = await q(sql)
  const fin = riders.filter((r) => r.race_status === 'Finished').length
  body.append(kv([[t.team_country_code, t.team_country_name], [`${riders.length} / ${fin}`, 'Riders / finishers'], [new Set(riders.map((r) => r.rider_country_code)).size, 'Rider nations'],
    [`#${t.team_rank}`, 'Team classification'], [fmtTime(t.team_time), 'Best 3 per stage']]))
  body.append(h('h3', {}, 'Who carried the time load'), table({
    cols: [riderCol(), { k: 'rider_country_code', l: 'Nat.', f: (v) => natLink(v) }, { k: 'gc_rank', l: 'GC', n: 1, f: (v, r) => v ?? `Out S${r.exit_stage}` },
      { k: 'stages', l: 'Stages', n: 1 }, { k: 'total_time', l: 'Adj. time', n: 1, f: fmtTime }, { k: 'share_pct', l: 'Share %', n: 1 }, { k: 'top10s', l: 'Top 10', n: 1 }], rows: riders,
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
  const p = panel(root, { title: 'Team roll-up', tag: 'E3 E13', sql, note: 'Team classification adds the three fastest riders of each team on each stage. Total adjusted time adds every rider, so a team that lost riders looks faster than it was. Per finisher averages only the riders who reached Paris, which gives a fairer read. All 23 rosters have 8 riders, so depth shows up in finishers and nations. Open a team to see who carried the time.' })
  p.body.append(table({ rows, onRow: (r) => open({ t: 'team', id: r.team_key }), hit: (r) => r.team_rank === 1, cols: [
    { k: 'team_rank', l: 'Rank', n: 1 }, teamCol(), { k: 'team_country_code', l: 'Reg.', f: (v) => natLink(v) },
    { k: 'team_time', l: 'Best 3 per stage', n: 1, f: fmtTime }, { k: 'team_gap', l: 'Gap', n: 1, f: fmtGap },
    { k: 'total_adjusted', l: 'Total adj.', n: 1, f: fmtTime }, { k: 'per_finisher', l: 'Per finisher', n: 1, f: fmtTime },
    { k: 'finishers', l: 'Finishers', n: 1 }, { k: 'nations', l: 'Nations', n: 1 }, { k: 'best_gc', l: 'Best GC', n: 1 }, { k: 'wins', l: 'Wins', n: 1 }, { k: 'top10s', l: 'Top 10', n: 1 }] }))

  const tt = `SELECT t.team_key, t.team_name, s.terrain, SUM(f.is_top10) AS top10s
FROM fact_results f
JOIN dim_team t USING (team_key)
JOIN dim_stage s USING (stage_key)
GROUP BY t.team_key, s.terrain;`
  const data = await q(tt)
  const totals = new Map()
  for (const d of data) totals.set(d.team_name, (totals.get(d.team_name) ?? 0) + Number(d.top10s))
  const order = [...totals].filter(([, v]) => v > 0).sort((a, b) => a[1] - b[1]).map(([n]) => n)
  const keyOf = new Map(data.map((d) => [d.team_name, d.team_key]))
  const tp = panel(root, { title: 'Top-ten intensity by team and terrain', tag: 'E14', sql: tt, note: 'Each bar counts top-ten stage finishes. Click a bar to open the team and its list of stages and riders.' })
  tp.body.append(chart((t) => ({
    ...baseOpt(t), grid: { left: 8, right: 34, top: 30, bottom: 22, containLabel: true },
    xAxis: { type: 'value', ...axisStyle(t) }, yAxis: { type: 'category', data: order.map(shortTeam), ...axisStyle(t), axisLabel: { color: t.ink2, fontSize: 12 }, splitLine: { show: false } },
    tooltip: { ...baseOpt(t).tooltip, trigger: 'axis', axisPointer: { type: 'shadow', shadowStyle: { color: t.line, opacity: .4 } } },
    series: TERRAIN.map((tn, i) => ({ name: tn, type: 'bar', stack: 'x', barWidth: 13, itemStyle: { color: t.s[i], borderColor: t.surface, borderWidth: 1 }, data: order.map((n) => Number(data.find((d) => d.team_name === n && d.terrain === tn)?.top10s ?? 0)) })),
  }), { height: 60 + order.length * 22, onClick: (e) => open({ t: 'team', id: keyOf.get(order[e.dataIndex]) }) }))
  await consistencyPanel(root)
}

// ---------- Consistency (E12) ----------
async function consistencyPanel(root) {
  const cSql = `SELECT r.rider_key, r.rider_name, t.team_key, t.team_name, SUM(f.is_top10) AS top10s,
       STRING_AGG('S' || s.stage_id || ' #' || f.stage_rank, ', ' ORDER BY s.stage_id) FILTER (WHERE f.is_top10 = 1) AS stages
FROM fact_results f
JOIN dim_rider r USING (rider_key)
JOIN dim_team t USING (team_key)
JOIN dim_stage s USING (stage_key)
GROUP BY r.rider_key, t.team_key
ORDER BY top10s DESC, r.rider_name
LIMIT 10;`
  const cq = panel(root, { title: 'Consistency near the front', tag: 'E12', sql: cSql, note: 'Riders with the most top-ten stage finishes, with the stages and ranks behind each count.' })
  cq.body.append(table({ rows: await q(cSql), onRow: (r) => open({ t: 'rider', id: r.rider_key }), cols: [riderCol(), { k: 'top10s', l: 'Top 10', n: 1 }, { k: 'stages', l: 'Stages', f: (v) => h('span', { class: 'mono', style: 'font-size:12px' }, v) }] }))
}

export default { id: 'teams', label: 'Teams', render: pageTeams }
