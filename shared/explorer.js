// Page: Explorer, free slice, dice, drill-down and roll-up (brief a).
// Owner: integrator.
import {
  $, h, boot, q, str, pad, fmtTime, fmtGap,
  fmtNum, fmtInt, shortTeam, TERRAIN, GLYPH, terrainVar, terrain, table,
  riderCol, teamLink, teamCol, natLink, stageLink, live, tokens, baseOpt,
  axisStyle, chart, sweep, redrawAll, panel, seg, select, S,
  loadLookups, riderColor, open, closeDrawer, VIEWS, kv, sqlShow, hooks,
  toConsole,
} from './core.js'

// ---------- Page: Explorer ----------
const DIMS = {
  terrain: { l: 'Stage type', e: 's.terrain', a: 's' }, stage: { l: 'Stage', e: `'S' || LPAD(s.stage_id::text, 2, '0')`, a: 's', natural: 1 },
  week: { l: 'Race week', e: `'Week ' || s.race_week`, a: 's', natural: 1 }, finish_country: { l: 'Finish country', e: 's.finish_country', a: 's' },
  team_country: { l: 'Team country', e: 't.team_country_name', a: 't' }, team: { l: 'Team', e: 't.team_name', a: 't' },
  nation: { l: 'Rider country', e: 'c.country_name', a: 'c' }, rider: { l: 'Rider', e: 'r.rider_name', a: 'r' },
  age: { l: 'Age band', e: 'r.age_band', a: 'r', natural: 1 }, status: { l: 'Race status', e: 'r.race_status', a: 'r' },
}
const NEXT = { terrain: 'stage', week: 'stage', stage: 'rider', finish_country: 'stage', team_country: 'team', team: 'rider', nation: 'rider', rider: 'stage', age: 'rider', status: 'rider' }
const MEAS = {
  total: { l: 'Total adjusted time', e: 'SUM(f.adjusted_time)', f: fmtTime, low: 1 }, avg: { l: 'Mean adjusted time', e: 'AVG(f.adjusted_time)::float8', f: fmtTime, low: 1 },
  gap: { l: 'Mean gap to stage winner', e: 'AVG(f.gap_to_winner)::float8', f: fmtGap, low: 1, a: [] }, speed: { l: 'Speed (km/h)', e: 'ROUND(SUM(s.distance_km) / (SUM(f.finish_time) / 3600.0), 2)::float8', f: (v) => fmtNum(v, 2), a: ['s'] },
  rank: { l: 'Mean stage rank', e: 'ROUND(AVG(f.stage_rank), 1)::float8', f: (v) => fmtNum(v, 1), low: 1 }, best: { l: 'Best stage rank', e: 'MIN(f.stage_rank)', f: fmtInt, low: 1 },
  wins: { l: 'Stage wins', e: 'SUM(f.is_win)', f: fmtInt }, podiums: { l: 'Podiums', e: 'SUM(f.is_podium)', f: fmtInt }, top10: { l: 'Top-ten finishes', e: 'SUM(f.is_top10)', f: fmtInt },
  bonus: { l: 'Bonus seconds', e: 'SUM(f.time_bonus)', f: fmtInt }, penalty: { l: 'Penalty seconds', e: 'SUM(f.time_penalty)', f: fmtInt },
  riders: { l: 'Distinct riders', e: 'COUNT(DISTINCT f.rider_key)', f: fmtInt }, teams: { l: 'Distinct teams', e: 'COUNT(DISTINCT f.team_key)', f: fmtInt }, stages: { l: 'Distinct stages', e: 'COUNT(DISTINCT f.stage_key)', f: fmtInt },
  rows: { l: 'Result rows', e: 'COUNT(*)', f: fmtInt },
}
const FOLLOW = [
  ['Mean rank by team × terrain', { rows: 'team', cols: 'terrain', measures: ['rank'] }],
  ['Top tens by rider country × terrain', { rows: 'nation', cols: 'terrain', measures: ['top10'] }],
  ['Speed by age band', { rows: 'age', measures: ['speed', 'rows'] }],
  ['Bonus seconds by team', { rows: 'team', measures: ['bonus'] }],
  ['Who won in mountains?', { rows: 'rider', measures: ['wins', 'podiums'], slices: [{ d: 'terrain', v: 'Mountain' }], maxRank: 3 }],
  ['Week-by-week speed', { rows: 'week', cols: 'terrain', measures: ['speed'] }],
  ['French riders by stage', { rows: 'stage', measures: ['top10', 'podiums'], slices: [{ d: 'nation', v: 'France' }] }],
  ['Riders still racing per stage', { rows: 'stage', measures: ['riders'] }],
]
const X = { rows: 'terrain', cols: '', measures: ['speed', 'wins'], slices: [], terrains: [...TERRAIN], from: 1, to: 21, maxRank: '', top: '20', totals: false }
function xSql() {
  const d = DIMS[X.rows], c = X.cols && X.cols !== X.rows ? DIMS[X.cols] : null
  const ms = c ? X.measures.slice(0, 1) : X.measures
  const need = new Set([d.a, c?.a])
  const where = []
  for (const sl of X.slices) { need.add(DIMS[sl.d].a); where.push(`${DIMS[sl.d].e} = ${str(sl.v)}`) }
  if (X.terrains.length < 4) { need.add('s'); where.push(`s.terrain IN (${X.terrains.map(str).join(', ') || "''"})`) }
  if (X.from > 1 || X.to < 21) { need.add('s'); where.push(`s.stage_id BETWEEN ${Number(X.from)} AND ${Number(X.to)}`) }
  if (X.maxRank) where.push(`f.stage_rank <= ${Number(X.maxRank)}`)
  for (const m of ms) for (const a of MEAS[m].a ?? []) need.add(a)
  const joins = [['r', 'dim_rider r USING (rider_key)'], ['t', 'dim_team t USING (team_key)'], ['c', 'dim_country c USING (country_key)'], ['s', 'dim_stage s USING (stage_key)']].filter(([a]) => need.has(a)).map(([, j]) => `JOIN ${j}`)
  const sel = [`${d.e} AS dim1`, c && `${c.e} AS dim2`, ...ms.map((m) => `${MEAS[m].e} AS ${m}`)].filter(Boolean)
  const totals = X.totals && !c
  const group = totals ? 'GROUP BY ROLLUP (dim1)' : `GROUP BY dim1${c ? ', dim2' : ''}`
  const lead = MEAS[ms[0]]
  const order = d.natural || c ? 'dim1' : `${ms[0]} ${lead.low ? 'ASC' : 'DESC'} NULLS LAST`
  const limit = !c && X.top !== 'all' ? `\nLIMIT ${Number(X.top) + (totals ? 1 : 0)}` : ''
  return { sql: `SELECT ${sel.join(',\n       ')}\nFROM fact_results f\n${joins.join('\n')}${joins.length ? '\n' : ''}${where.length ? `WHERE ${where.join('\n  AND ')}\n` : ''}${group}\nORDER BY ${totals ? 'dim1 IS NULL DESC, ' : ''}${order}${limit};`, ms, c, d }
}
async function pageExplorer(root) {
  const wrap = h('div', { class: 'exp' })
  root.append(wrap)
  const side = h('section', { class: 'panel', style: 'padding-block:6px' })
  const res = h('section', { class: 'panel' })
  wrap.append(side, res)
  const crumb = h('div', { class: 'crumb' }), out = h('div', {}), sqlEl = h('pre', { class: 'sqlshow' })
  res.append(h('div', { class: 'phead' }, h('h2', {}, 'Explorer'), h('span', { class: 'tag' }, 'Any dimension × any measure'), h('span', { class: 'spacer' }), h('button', { class: 'sqlbtn', onclick: () => toConsole(xSql().sql) }, 'Open SQL')),
    h('div', { class: 'pnote' }, 'Click a row or cell to drill down: it slices on that value and moves to the next level. Click an earlier crumb to roll up.'),
    h('div', { class: 'pbody' }, h('div', { class: 'qq', style: 'padding-bottom:10px' }, FOLLOW.map(([l, s]) => h('button', { onclick: () => { Object.assign(X, { cols: '', slices: [], terrains: [...TERRAIN], from: 1, to: 21, maxRank: '', totals: false }, s); drawSide(); run() } }, l))), crumb, out,
      h('details', { style: 'margin-top:10px' }, h('summary', { style: 'cursor:pointer;font-size:13.5px;color:var(--ink2)' }, 'Generated SQL'), sqlEl)))
  const opts = (o) => Object.entries(o).map(([k, v]) => [k, v.l])
  async function drawSide() {
    const f = (label, ...kids) => h('div', { class: 'field' }, h('div', { class: 'lab' }, label), kids)
    const addD = select(opts(DIMS), 'team', async () => fillV(), { id: 'x-slice-dim', 'aria-label': 'Slice dimension' })
    const addV = h('select', { id: 'x-slice-val', 'aria-label': 'Slice value' })
    const fillV = async () => {
      const k = addD.value, e = DIMS[k]
      const from = { s: 'dim_stage s', t: 'dim_team t', c: 'dim_country c', r: 'dim_rider r' }[e.a]
      const vals = await q(`SELECT DISTINCT ${e.e} AS v FROM ${from} ORDER BY 1`)
      addV.replaceChildren(...vals.map((x) => h('option', { value: x.v }, x.v)))
    }
    await fillV()
    side.replaceChildren(
      f('Rows', select(opts(DIMS), X.rows, (v) => { X.rows = v; run() }, { id: 'x-rows', 'aria-label': 'Row dimension' })),
      f('Columns (makes a cross-tab, first measure only)', select([['', 'None'], ...opts(DIMS)], X.cols, (v) => { X.cols = v; run() }, { id: 'x-cols', 'aria-label': 'Column dimension' })),
      f('Measures', h('div', { class: 'checks' }, Object.entries(MEAS).map(([k, m]) => h('label', {}, h('input', { type: 'checkbox', checked: X.measures.includes(k) ? 'checked' : false, onchange: (e) => { X.measures = e.target.checked ? [...X.measures, k] : X.measures.filter((x) => x !== k); if (!X.measures.length) X.measures = ['rows']; run() } }), m.l)))),
      f('Stage type', h('div', { class: 'row' }, TERRAIN.map((t) => h('label', { class: 'chip' }, h('input', { type: 'checkbox', checked: X.terrains.includes(t) ? 'checked' : false, onchange: (e) => { X.terrains = e.target.checked ? [...X.terrains, t] : X.terrains.filter((x) => x !== t); run() } }), t)))),
      f('Stage range', h('div', { class: 'row' }, h('input', { type: 'number', id: 'x-from', 'aria-label': 'From stage', min: 1, max: 21, value: X.from, style: 'width:64px', onchange: (e) => { X.from = Number(e.target.value); run() } }), 'to', h('input', { type: 'number', id: 'x-to', 'aria-label': 'To stage', min: 1, max: 21, value: X.to, style: 'width:64px', onchange: (e) => { X.to = Number(e.target.value); run() } }))),
      f('Only finishes at or above rank', h('input', { type: 'number', id: 'x-rank', 'aria-label': 'Maximum stage rank', min: 1, max: 184, placeholder: 'Any', value: X.maxRank, style: 'width:90px', onchange: (e) => { X.maxRank = e.target.value; run() } })),
      f('Add a slice', addD, h('div', { class: 'row' }, addV, h('button', { class: 'btn', onclick: () => { if (addV.value) { X.slices = [...X.slices, { d: addD.value, v: addV.value }]; run() } } }, 'Add'))),
      f('Show', h('div', { class: 'row' }, select([['10', 'Top 10'], ['20', 'Top 20'], ['50', 'Top 50'], ['all', 'All']], X.top, (v) => { X.top = v; run() }, { id: 'x-top', 'aria-label': 'Row limit' }),
        h('label', { class: 'chip' }, h('input', { type: 'checkbox', checked: X.totals ? 'checked' : false, onchange: (e) => { X.totals = e.target.checked; run() } }), 'ROLLUP total'))),
      h('div', { class: 'field' }, h('button', { class: 'btn', onclick: () => { Object.assign(X, { rows: 'terrain', cols: '', measures: ['speed', 'wins'], slices: [], terrains: [...TERRAIN], from: 1, to: 21, maxRank: '', top: '20', totals: false }); drawSide(); run() } }, 'Reset')))
  }
  const drill = (dim, val, dim2, val2) => {
    const already = X.slices.some((s) => s.d === NEXT[dim])
    if (dim === 'rider' && X.slices.some((s) => s.d === 'stage')) return
    if (dim === 'stage' && already) { open({ t: 'stage', id: Number(val.slice(1)) }); return }
    X.slices = [...X.slices, { d: dim, v: val, drilled: true }]
    if (dim2) X.slices.push({ d: dim2, v: val2, drilled: true })
    X.rows = NEXT[dim]; X.cols = ''
    drawSide(); run()
  }
  const lastRiders = new Map(S.riders.map((r) => [r.rider_name, r.rider_key]))
  async function run() {
    const { sql, ms, c, d } = xSql()
    sqlEl.textContent = sql
    crumb.replaceChildren(
      h('button', { class: 'lnk', onclick: () => { X.slices = []; drawSide(); run() } }, 'All results'),
      ...X.slices.flatMap((s, i) => [h('span', { class: 'sepc' }, '›'), h('span', { class: 'pill' }, h('button', { class: 'lnk', onclick: () => { X.rows = s.d; X.slices = X.slices.slice(0, i); drawSide(); run() } }, `${DIMS[s.d].l}: ${s.v}`),
        h('button', { 'aria-label': `Remove slice ${s.v}`, onclick: () => { X.slices = X.slices.filter((x) => x !== s); drawSide(); run() } }, '×'))]),
      h('span', { class: 'sepc' }, '›'), h('b', {}, c ? `${d.l} × ${c.l}` : `by ${d.l}`))
    let rows
    try { rows = await q(sql) } catch (e) { out.replaceChildren(h('div', { class: 'err' }, e.message)); return }
    sweep()
    if (!rows.length) { out.replaceChildren(h('div', { class: 'call' }, 'No results match these filters. Remove a slice or widen the stage range.')); return }
    if (c) { out.replaceChildren(pivot(rows, ms[0], d, c)); return }
    const m0 = MEAS[ms[0]]
    const body = rows.filter((r) => r.dim1 != null)
    const line = d.natural && body.length > 2
    const chartEl = chart((t) => ({
      ...baseOpt(t), legend: undefined,
      grid: line ? { left: 66, right: 16, top: 12, bottom: 26 } : { left: 8, right: 70, top: 6, bottom: 20, containLabel: true },
      [line ? 'xAxis' : 'yAxis']: { type: 'category', data: body.map((r) => (X.rows === 'team' ? shortTeam(r.dim1) : r.dim1)), inverse: !line, ...axisStyle(t), axisLabel: { color: t.ink2, fontSize: 12 }, splitLine: { show: false } },
      [line ? 'yAxis' : 'xAxis']: { type: 'value', scale: m0.f === fmtTime, ...axisStyle(t), axisLabel: { ...axisStyle(t).axisLabel, formatter: (v) => (m0.f === fmtTime ? `${Math.round(v / 3600)}h` : m0.f === fmtGap ? fmtGap(v) : fmtNum(v)) } },
      tooltip: { ...baseOpt(t).tooltip, trigger: 'axis', axisPointer: { type: line ? 'line' : 'shadow', lineStyle: { color: t.axis }, shadowStyle: { color: t.line, opacity: .4 } }, valueFormatter: (v) => m0.f(v) },
      series: [{ name: m0.l, type: line ? 'line' : 'bar', barWidth: 12, symbolSize: 6, data: body.map((r) => Number(r[ms[0]])), lineStyle: { width: 2, color: t.s[0] }, itemStyle: { color: t.s[0], borderRadius: line ? 0 : [0, 4, 4, 0] },
        label: { show: !line, position: 'right', color: t.ink2, fontFamily: t.mono, fontSize: 11, formatter: (p) => m0.f(p.value) } }],
    }), { height: line ? 260 : Math.min(40 + body.length * 22, 520), onClick: (e) => drill(X.rows, body[e.dataIndex].dim1) })
    const total = X.totals ? rows.find((r) => r.dim1 == null) : null
    const cols = [{ k: 'dim1', l: d.l, f: (v) => h('button', { class: 'lnk', onclick: (e) => { e.stopPropagation(); drill(X.rows, v) } }, X.rows === 'team' ? shortTeam(v) : v) }, ...ms.map((m) => ({ k: m, l: MEAS[m].l, n: 1, f: MEAS[m].f }))]
    const actions = X.rows === 'rider' && lastRiders.size ? [{ k: 'dim1', l: '', f: (v) => (lastRiders.has(v) ? h('button', { class: 'sqlbtn', onclick: (e) => { e.stopPropagation(); open({ t: 'rider', id: lastRiders.get(v) }) } }, 'Dossier') : '') }] : []
    out.replaceChildren(chartEl, table({ rows: body, cols: [...cols, ...actions], total: total ? { dim1: 'All', ...Object.fromEntries(ms.map((m) => [m, MEAS[m].f(total[m])])) } : undefined }))
  }
  function pivot(rows, m, d, c) {
    const f = MEAS[m].f, rowKeys = [...new Set(rows.map((r) => r.dim1))], colKeys = [...new Set(rows.map((r) => r.dim2))]
    if (c === DIMS.terrain) colKeys.sort((a, b) => TERRAIN.indexOf(a) - TERRAIN.indexOf(b)); else colKeys.sort()
    const vals = rows.map((r) => Number(r[m])), lo = Math.min(...vals), hi = Math.max(...vals)
    const shade = (v) => { const p = hi > lo ? (v - lo) / (hi - lo) : .5; const a = MEAS[m].low ? 1 - p : p; return `background:color-mix(in srgb, var(--s1) ${Math.round(4 + a * 50)}%, transparent)` }
    const cell = new Map(rows.map((r) => [`${r.dim1}|${r.dim2}`, r[m]]))
    const top = X.top === 'all' ? rowKeys.length : Number(X.top)
    const lab = (k) => (X.rows === 'team' ? shortTeam(k) : k)
    return h('div', { class: 'tw' }, h('table', { class: 'heat' },
      h('thead', {}, h('tr', {}, h('th', { class: 'nosort' }, `${d.l} \\ ${c.l}`), colKeys.map((k) => h('th', { class: 'n nosort' }, k)))),
      h('tbody', {}, rowKeys.slice(0, top).map((rk) => h('tr', {}, h('td', { class: 'lab' }, h('button', { class: 'lnk', onclick: () => drill(X.rows, rk) }, lab(rk))),
        colKeys.map((ck) => { const v = cell.get(`${rk}|${ck}`); return v == null ? h('td', { style: 'cursor:default' }) : h('td', { style: shade(Number(v)), title: `${lab(rk)} × ${ck}`, onclick: () => drill(X.rows, rk, X.cols, ck) }, f(v)) }))))),
      rowKeys.length > top ? h('div', { class: 'dim', style: 'padding-top:6px;font-size:13px' }, `Showing ${top} of ${rowKeys.length} rows. Change Show to see all.`) : null)
  }
  await drawSide()
  await run()
}

export default { id: 'explorer', label: 'Explorer', render: pageExplorer }
