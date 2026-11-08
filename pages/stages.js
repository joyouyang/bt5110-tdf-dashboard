// Page: Stages and terrain (E2, E4 mountain proxy, E5, E6, E11, E15).
// Owner: Stages and terrain module. Also owns the stage dossier in the drawer.
import {
  $, h, boot, q, str, pad, fmtTime, fmtGap,
  fmtNum, fmtInt, shortTeam, TERRAIN, GLYPH, terrainVar, terrain, table,
  riderCol, teamLink, teamCol, natLink, stageLink, live, tokens, baseOpt,
  axisStyle, chart, sweep, redrawAll, panel, seg, select, S,
  loadLookups, riderColor, open, closeDrawer, VIEWS, kv, sqlShow, hooks,
  toConsole,
} from '../core.js'

async function stageTop(id, mode) {
  const riders = `SELECT f.stage_rank, r.rider_key, r.rider_name, t.team_key, t.team_name, r.rider_country_code,
       f.adjusted_time, f.gap_to_winner, f.time_bonus, f.time_penalty
FROM fact_results f
JOIN dim_rider r USING (rider_key)
JOIN dim_team t USING (team_key)
JOIN dim_stage s USING (stage_key)
WHERE s.stage_id = ${Number(id)} AND f.stage_rank <= 10
ORDER BY f.stage_rank;`
  const teams = `SELECT t.team_key, t.team_name, COUNT(*) AS riders_in_top10, MIN(f.stage_rank) AS best_rank,
       STRING_AGG(r.rider_name || ' (' || f.stage_rank || ')', ', ' ORDER BY f.stage_rank) AS riders
FROM fact_results f
JOIN dim_rider r USING (rider_key)
JOIN dim_team t USING (team_key)
JOIN dim_stage s USING (stage_key)
WHERE s.stage_id = ${Number(id)} AND f.stage_rank <= 10
GROUP BY t.team_key
ORDER BY riders_in_top10 DESC, best_rank;`
  const sql = mode === 'teams' ? teams : riders
  const rows = await q(sql)
  const node = mode === 'teams'
    ? table({ cols: [teamCol(), { k: 'riders_in_top10', l: 'In top 10', n: 1 }, { k: 'best_rank', l: 'Best', n: 1 }, { k: 'riders', l: 'Riders' }], rows })
    : table({ cols: [{ k: 'stage_rank', l: 'Rank', n: 1 }, riderCol(), teamCol(), { k: 'rider_country_code', l: 'Nat.', f: (v) => natLink(v) },
        { k: 'adjusted_time', l: 'Adj. time', n: 1, f: fmtTime }, { k: 'gap_to_winner', l: 'Gap', n: 1, f: fmtGap }, { k: 'time_bonus', l: 'Bonus', n: 1 }], rows })
  return { node, sql }
}
const stageFacts = (s) => kv([[`S${s.stage_id}`, s.stage_date], [fmtNum(s.km, 1) + ' km', 'Distance'], [s.terrain, 'Stage type'], [s.start_location, s.start_country], [s.finish_location, s.finish_country]])
async function stageView(id, title, body) {
  const s = S.stages.find((x) => x.stage_id === Number(id))
  title.textContent = `Stage ${s.stage_id}: ${s.route}`
  body.append(stageFacts(s))
  const slot = h('div', {})
  const show = async (m) => { const r = await stageTop(id, m); sweep(); slot.replaceChildren(r.node, h('div', { style: 'height:8px' }), sqlShow(r.sql)) }
  body.append(seg([['riders', 'Riders'], ['teams', 'Teams in the top 10']], 'riders', show), slot)
  await show('riders')
}
VIEWS.stage = stageView

// ---------- Page: Stages (E2, E11, E15) ----------
async function pageStages(root) {
  const st = { id: 1, sort: 'order', view: 'riders' }
  const strip = panel(root, { title: 'The 21 stages', tag: 'E15', note: 'Click a bar to open that stage below. Sort by distance to bring out the longest day.', sql: `SELECT stage_id, stage_date, terrain, distance_km, route FROM dim_stage ORDER BY stage_id;` })
  const slot = h('div', {}), detail = panel(root, { title: 'Stage in focus', tag: 'E2', sql: '' })
  strip.body.append(h('div', { class: 'row', style: 'padding-bottom:6px' }, TERRAIN.map((t) => h('span', { class: 'pill' }, terrain(t)))), slot)
  const drawStrip = () => {
    const list = st.sort === 'order' ? S.stages : [...S.stages].sort((a, b) => b.km - a.km)
    sweep()
    slot.replaceChildren(chart((t) => ({
      ...baseOpt(t), legend: undefined, grid: { left: 40, right: 8, top: 10, bottom: 24 },
      xAxis: { type: 'category', data: list.map((s) => `S${s.stage_id}`), ...axisStyle(t), splitLine: { show: false } },
      yAxis: { type: 'value', ...axisStyle(t), name: 'km', nameTextStyle: { color: t.muted } },
      tooltip: { ...baseOpt(t).tooltip, formatter: (p) => { const s = list[p.dataIndex]; return `<b>Stage ${s.stage_id}</b> · ${s.terrain}<br>${s.route}<br>${s.km} km · ${s.stage_date}` } },
      series: [{ type: 'bar', barWidth: '62%', data: list.map((s) => ({ value: s.km, itemStyle: { color: t.s[TERRAIN.indexOf(s.terrain)], borderRadius: [4, 4, 0, 0], opacity: s.stage_id === st.id ? 1 : .72 } })) }],
    }), { height: 230, onClick: (e) => { st.id = list[e.dataIndex].stage_id; drawDetail(); redrawAll() } }))
    sweep()
  }
  strip.controls(seg([['order', 'Race order'], ['km', 'Longest first']], 'order', (v) => { st.sort = v; drawStrip() }))
  const dslot = h('div', {})
  detail.body.append(dslot)
  detail.controls(seg([['riders', 'Riders'], ['teams', 'Teams in the top 10']], 'riders', (v) => { st.view = v; drawDetail() }))
  async function drawDetail() {
    const s = S.stages.find((x) => x.stage_id === st.id)
    const r = await stageTop(st.id, st.view)
    detail.sql = r.sql
    dslot.replaceChildren(h('div', { style: 'padding-bottom:10px' }, stageFacts(s)), r.node)
  }
  drawStrip(); await drawDetail()

  const ittSql = `SELECT s.stage_id, s.stage_date::text, s.route, s.distance_km::float8 AS km, r.rider_key, r.rider_name,
       t.team_key, t.team_name, f.finish_time, f.speed_kmh::float8 AS speed
FROM fact_results f
JOIN dim_stage s USING (stage_key)
JOIN dim_rider r USING (rider_key)
JOIN dim_team t USING (team_key)
WHERE s.terrain = 'ITT' AND f.is_win = 1
ORDER BY s.stage_id;`
  const itt = panel(root, { title: 'Against the clock', tag: 'E11', span: 7, sql: ittSql, note: 'The two individual time trials. Stage 5 and stage 13 differ a lot, so read them separately.' })
  itt.body.append(table({ rows: await q(ittSql), cols: [{ k: 'stage_id', l: 'Stage', f: (v) => stageLink(v) }, { k: 'stage_date', l: 'Date' }, { k: 'route', l: 'Route' }, { k: 'km', l: 'km', n: 1 }, riderCol(), { k: 'finish_time', l: 'Time', n: 1, f: fmtTime }, { k: 'speed', l: 'km/h', n: 1 }] }))
  const longSql = `SELECT s.stage_id, s.stage_date::text, s.terrain, s.distance_km::float8 AS km, s.start_location, s.finish_location
FROM dim_stage s
ORDER BY s.distance_km DESC
LIMIT 1;`
  const [l] = await q(longSql)
  const lp = panel(root, { title: 'The long day', tag: 'E15', span: 5, sql: longSql })
  const lt = await stageTop(l.stage_id, 'riders')
  const [win] = await q(`SELECT r.rider_name, r.rider_key FROM fact_results f JOIN dim_rider r USING (rider_key) JOIN dim_stage s USING (stage_key) WHERE s.stage_id = ${l.stage_id} AND f.is_win = 1`)
  lp.body.append(h('div', { class: 'call' }, `Stage ${l.stage_id} on ${l.stage_date}: ${l.start_location} to ${l.finish_location}, ${l.km} km, ${l.terrain.toLowerCase()}. Won by ${win.rider_name}. The dataset has no stage names, so the route stands in for one.`),
    h('button', { class: 'btn', onclick: () => open({ t: 'stage', id: l.stage_id }) }, 'Open leading finishers'))
  await terrainPanels(root)
}

// ---------- Terrain panels (E4 mountain proxy, E5, E6) ----------
async function terrainPanels(root) {
  const mtSql = `SELECT m.mountain_rank, r.rider_key, r.rider_name, t.team_key, t.team_name, m.mountain_time,
       m.mountain_time - MIN(m.mountain_time) OVER () AS gap, g.gc_rank
FROM v_mountain_proxy m
JOIN dim_rider r USING (rider_key)
JOIN dim_team t USING (team_name)
JOIN v_gc g USING (rider_key)
ORDER BY m.mountain_rank
LIMIT 10;`
  const mt = panel(root, { title: 'Mountain proxy', tag: 'E4', span: 6, sql: mtSql, note: 'Cumulative adjusted time on the six Mountain stages, for riders who finished the race. This stands in for the climbers\' classification, which the data cannot rebuild because it has no climb points.' })
  mt.body.append(table({ rows: await q(mtSql), onRow: (r) => open({ t: 'rider', id: r.rider_key }), hit: (r) => r.mountain_rank === 1, cols: [
    { k: 'mountain_rank', l: 'Rank', n: 1 }, riderCol(), teamCol(), { k: 'mountain_time', l: 'Mountain time', n: 1, f: fmtTime }, { k: 'gap', l: 'Gap', n: 1, f: fmtGap }, { k: 'gc_rank', l: 'GC', n: 1 }] }))

  // Mountain contours
  const mSql = `SELECT r.rider_key, r.rider_name, t.team_name, t.team_key, SUM(f.is_podium) AS podiums, SUM(f.is_win) AS wins,
       ROUND(AVG(f.gap_to_winner))::int AS mean_gap
FROM fact_results f
JOIN dim_rider r USING (rider_key)
JOIN dim_team t USING (team_key)
JOIN dim_stage s USING (stage_key)
WHERE s.terrain = 'Mountain'
GROUP BY r.rider_key, t.team_key
HAVING COUNT(*) = 6
ORDER BY podiums DESC, mean_gap
LIMIT 10;`
  const mrows = await q(mSql)
  const mp = panel(root, { title: 'Mountain contours', tag: 'E5', span: 6, sql: mSql, note: 'Podiums and mean gap to the stage winner across the six Mountain stages, for riders who rode all six. The chart shows the daily traces for the top four.' })
  const keys = mrows.slice(0, 4).map((r) => r.rider_key)
  const tr = await q(`SELECT f.rider_key, s.stage_id, f.gap_to_winner FROM fact_results f JOIN dim_stage s USING (stage_key) WHERE s.terrain = 'Mountain' AND f.rider_key IN (${keys.join(',')})`)
  mp.body.append(chart((t) => ({
    ...baseOpt(t), grid: { left: 54, right: 10, top: 30, bottom: 24 },
    xAxis: { type: 'category', data: S.mountain.map((m) => `S${m}`), ...axisStyle(t), splitLine: { show: false } },
    yAxis: { type: 'value', inverse: true, ...axisStyle(t), axisLabel: { ...axisStyle(t).axisLabel, formatter: (v) => fmtGap(v) } },
    tooltip: { ...baseOpt(t).tooltip, trigger: 'axis', valueFormatter: (v) => fmtGap(v) },
    series: keys.map((k, i) => ({ name: mrows[i].rider_name, type: 'line', symbolSize: 6, lineStyle: { width: 2, color: t.s[i] }, itemStyle: { color: t.s[i] }, data: S.mountain.map((m) => tr.find((x) => x.rider_key === k && x.stage_id === m)?.gap_to_winner ?? null) })),
  }), { height: 230 }), table({ rows: mrows, onRow: (r) => open({ t: 'rider', id: r.rider_key }), cols: [riderCol(), { k: 'podiums', l: 'Podiums', n: 1 }, { k: 'wins', l: 'Wins', n: 1 }, { k: 'mean_gap', l: 'Mean gap', n: 1, f: fmtGap }] }))

  // Speed
  const sp = panel(root, { title: 'Speed by terrain', tag: 'E6', sql: '', note: 'Speed proxy is distance divided by time, not power. The two time trials are shown apart because their courses differ. Compare up to three riders or teams against the field. The table ranks finishers by how much speed they keep on Mountain stages relative to Flat stages.' })
  const sel = { kind: 'rider', ids: S.finishers.slice(0, 2).map((r) => r.rider_key) }
  const slot = h('div', {})
  sp.body.append(slot)
  const pick = h('span', { class: 'row' })
  const drawPick = () => {
    const opts = sel.kind === 'rider' ? S.riders.map((r) => [r.rider_key, r.rider_name]) : S.teams.map((t) => [t.team_key, shortTeam(t.team_name)])
    pick.replaceChildren(...[0, 1, 2].map((i) => select([['', i ? 'Add…' : 'Pick…'], ...opts], sel.ids[i] ?? '', (v) => { sel.ids[i] = v ? Number(v) : undefined; sel.ids = sel.ids.filter(Boolean); drawPick(); drawSp() }, { id: `speed-${i}`, 'aria-label': `Comparison ${i + 1}` })))
  }
  sp.controls(seg([['rider', 'Riders'], ['team', 'Teams']], 'rider', (k) => { sel.kind = k; sel.ids = (k === 'rider' ? S.finishers.slice(0, 2).map((r) => r.rider_key) : S.teams.slice(0, 2).map((t) => t.team_key)); drawPick(); drawSp() }), pick)
  drawPick()
  async function drawSp() {
    const seg5 = `CASE WHEN s.terrain = 'ITT' THEN 'ITT S' || s.stage_id ELSE s.terrain END`
    const keyCol = sel.kind === 'rider' ? 'f.rider_key' : 'f.team_key'
    const sql = `SELECT ${seg5} AS segment, ${keyCol} AS key,
       ROUND(SUM(s.distance_km) / (SUM(f.finish_time) / 3600.0), 2)::float8 AS kmh
FROM fact_results f JOIN dim_stage s USING (stage_key)
WHERE ${keyCol} IN (${sel.ids.join(',') || 0})
GROUP BY 1, 2
UNION ALL
SELECT ${seg5}, 0, ROUND(SUM(s.distance_km) / (SUM(f.finish_time) / 3600.0), 2)::float8
FROM fact_results f JOIN dim_stage s USING (stage_key)
GROUP BY 1;`
    sp.sql = sql
    const rows = await q(sql)
    const cats = ['Flat', 'Hilly', 'Mountain', 'ITT S5', 'ITT S13']
    const entities = [[0, 'Field'], ...sel.ids.map((k) => [k, sel.kind === 'rider' ? S.riders.find((r) => r.rider_key === k).rider_name : shortTeam(S.teams.find((t) => t.team_key === k).team_name)])]
    const retain = await q(`WITH sp AS (
  SELECT f.rider_key, s.terrain, SUM(s.distance_km) / (SUM(f.finish_time) / 3600.0) AS kmh
  FROM fact_results f JOIN dim_stage s USING (stage_key) GROUP BY 1, 2
)
SELECT g.rider_key, g.rider_name, g.team_name, t.team_key, g.gc_rank,
       ROUND(fl.kmh, 1)::float8 AS flat, ROUND(mo.kmh, 1)::float8 AS mountain,
       ROUND(100 * mo.kmh / fl.kmh, 1)::float8 AS kept_pct
FROM v_gc g JOIN dim_team t USING (team_name)
JOIN sp fl ON fl.rider_key = g.rider_key AND fl.terrain = 'Flat'
JOIN sp mo ON mo.rider_key = g.rider_key AND mo.terrain = 'Mountain'
ORDER BY kept_pct DESC LIMIT 8`)
    sweep()
    slot.replaceChildren(h('div', { class: 'row', style: 'align-items:flex-start;gap:14px' },
      h('div', { style: 'flex:1 1 380px;min-width:0' }, chart((t) => ({
        ...baseOpt(t), grid: { left: 42, right: 10, top: 30, bottom: 24 },
        xAxis: { type: 'category', data: cats, ...axisStyle(t), splitLine: { show: false } },
        yAxis: { type: 'value', name: 'km/h', nameTextStyle: { color: t.muted }, ...axisStyle(t) },
        tooltip: { ...baseOpt(t).tooltip, trigger: 'axis', axisPointer: { type: 'shadow', shadowStyle: { color: t.line, opacity: .4 } }, valueFormatter: (v) => `${v} km/h` },
        series: entities.map(([k, n], i) => ({ name: n, type: 'bar', barMaxWidth: 16, barGap: '20%', itemStyle: { color: k === 0 ? t.axis : t.s[i - 1], borderRadius: [4, 4, 0, 0] }, data: cats.map((c) => rows.find((r) => r.segment === c && r.key === k)?.kmh ?? null) })),
      }), { height: 280 })),
      h('div', { style: 'flex:1 1 340px;min-width:0' }, table({ rows: retain, onRow: (r) => open({ t: 'rider', id: r.rider_key }), cols: [riderCol(), { k: 'gc_rank', l: 'GC', n: 1 }, { k: 'flat', l: 'Flat', n: 1 }, { k: 'mountain', l: 'Mountain', n: 1 }, { k: 'kept_pct', l: 'Kept %', n: 1 }] }))))
    sweep()
  }
  await drawSp()
}

export default { id: 'stages', label: 'Stages', render: pageStages }
