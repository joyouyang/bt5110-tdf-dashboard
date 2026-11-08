// Page: SQL console, schema browser and the star vs normalized comparison.
// Owner: integrator.
import {
  $, h, boot, q, str, pad, fmtTime, fmtGap,
  fmtNum, fmtInt, shortTeam, TERRAIN, GLYPH, terrainVar, terrain, table,
  riderCol, teamLink, teamCol, natLink, stageLink, live, tokens, baseOpt,
  axisStyle, chart, sweep, redrawAll, panel, seg, select, S,
  loadLookups, riderColor, open, closeDrawer, VIEWS, kv, sqlShow, hooks,
  toConsole,
} from '../core.js'
import { db } from '../core.js'

// ---------- Page: SQL console ----------
const PRESETS = [
  ['Roll-up: stage type within week', `SELECT 'Week ' || s.race_week AS week, s.terrain, COUNT(DISTINCT s.stage_key) AS stages,
       SUM(f.is_top10) AS top10_rows, ROUND(AVG(f.speed_kmh), 1) AS mean_speed
FROM fact_results f
JOIN dim_stage s USING (stage_key)
GROUP BY ROLLUP (s.race_week, s.terrain)
ORDER BY s.race_week, s.terrain;`],
  ['Cube: rider country × stage type', `SELECT c.country_name, s.terrain, SUM(f.is_top10) AS top10s
FROM fact_results f
JOIN dim_country c USING (country_key)
JOIN dim_stage s USING (stage_key)
WHERE c.country_code IN ('FRA', 'BEL', 'SLO', 'DEN')
GROUP BY CUBE (c.country_name, s.terrain)
ORDER BY 1, 2;`],
  ['Slice and dice: top 5 per mountain stage', `SELECT s.stage_id, f.stage_rank, r.rider_name, t.team_name
FROM fact_results f
JOIN dim_stage s USING (stage_key)
JOIN dim_rider r USING (rider_key)
JOIN dim_team t USING (team_key)
WHERE s.terrain = 'Mountain' AND f.stage_rank <= 5
ORDER BY s.stage_id, f.stage_rank;`],
  ['Window: biggest one-day GC moves', `WITH moves AS (
  SELECT p.stage_id, r.rider_name, p.gc_rank,
         p.gap_to_leader - LAG(p.gap_to_leader) OVER (PARTITION BY p.rider_key ORDER BY p.stage_id) AS change
  FROM v_gc_progress p JOIN dim_rider r USING (rider_key)
  WHERE p.rider_key IN (SELECT rider_key FROM v_gc WHERE gc_rank <= 20)
)
SELECT * FROM moves WHERE change IS NOT NULL ORDER BY ABS(change) DESC LIMIT 15;`],
  ['Normalized schema: same GC from Task 2 tables', `SELECT r.rider_name, SUM(x.finish_time - x.time_bonus + x.time_penalty) AS adjusted_time
FROM Result x
JOIN Rider r USING (bib_number)
WHERE r.bib_number NOT IN (SELECT bib_number FROM RiderExit)
GROUP BY r.bib_number
ORDER BY adjusted_time
LIMIT 10;`],
  ['Query plan: EXPLAIN ANALYZE', `EXPLAIN ANALYZE
SELECT t.team_name, SUM(f.adjusted_time)
FROM fact_results f JOIN dim_team t USING (team_key)
GROUP BY t.team_name;`],
]
const BENCH = [
  ['Cumulative time per rider',
    `SELECT r.rider_name, SUM(f.adjusted_time) AS t FROM fact_results f JOIN dim_rider r USING (rider_key) GROUP BY r.rider_name ORDER BY t;`,
    `SELECT r.rider_name, SUM(x.finish_time - x.time_bonus + x.time_penalty) AS t FROM Result x JOIN Rider r USING (bib_number) GROUP BY r.rider_name ORDER BY t;`],
  ['Top tens by rider country and stage type',
    `SELECT c.country_name, s.terrain, SUM(f.is_top10) AS n FROM fact_results f JOIN dim_country c USING (country_key) JOIN dim_stage s USING (stage_key) GROUP BY 1, 2;`,
    `SELECT COALESCE(c.country_name, 'Unknown'), st.stage_type, COUNT(*) FILTER (WHERE x.rank <= 10) AS n FROM Result x JOIN Rider r USING (bib_number) LEFT JOIN Country c USING (country_code) JOIN Stage st USING (stage_id) GROUP BY 1, 2;`],
  ['Riders by team country and finish country',
    `SELECT t.team_country_name, s.finish_country, COUNT(DISTINCT f.rider_key) AS n FROM fact_results f JOIN dim_team t USING (team_key) JOIN dim_stage s USING (stage_key) GROUP BY 1, 2;`,
    `SELECT ct.country_name, cf.country_name, COUNT(DISTINCT x.bib_number) AS n FROM Result x JOIN Rider r USING (bib_number) JOIN Team t USING (team_name) JOIN Country ct ON ct.country_code = t.country_code JOIN Stage st USING (stage_id) JOIN Location l ON l.loc_name = st.end_loc JOIN Country cf ON cf.country_code = l.country_code GROUP BY 1, 2;`],
]
let box
let runBox = () => {}
// Called by app.js when a panel's "Open SQL" button is pressed.
const setSql = (sql) => { box.value = sql; runBox() }
async function pageConsole(root) {
  box = h('textarea', { class: 'sqlbox', id: 'sql-box', spellcheck: 'false', 'aria-label': 'SQL query' })
  const result = h('div', {}), info = h('span', { class: 'dim mono', style: 'font-size:13px' })
  const p = panel(root, { title: 'SQL console', tag: 'PostgreSQL 18', span: 8, note: 'Live PostgreSQL running in this browser, holding the normalized Task 2 tables and the star schema. Run any query. Reloading the page restores the data.' })
  runBox = async () => {
    sweep()
    const t0 = performance.now()
    try {
      const res = await db.query(box.value)
      const ms = performance.now() - t0
      const rows = res.rows ?? []
      const fields = (res.fields ?? []).map((f) => f.name)
      info.textContent = `${rows.length} rows · ${ms.toFixed(1)} ms`
      const cols = fields.map((k) => ({ k, l: k, n: rows.some((r) => typeof r[k] === 'number'), f: (v) => (v === null ? h('span', { class: 'dim' }, 'NULL') : v instanceof Date ? v.toISOString().slice(0, 10) : String(v)) }))
      const nodes = []
      const labelField = fields.find((k) => rows.every((r) => typeof r[k] === 'string'))
      const numField = fields.find((k) => rows.length && rows.every((r) => typeof r[k] === 'number' || (r[k] !== null && r[k] !== '' && !isNaN(r[k]))))
      if (rows.length > 1 && rows.length <= 40 && labelField && numField && fields.length <= 3) {
        nodes.push(chart((t) => ({
          ...baseOpt(t), legend: undefined, grid: { left: 8, right: 40, top: 6, bottom: 20, containLabel: true },
          xAxis: { type: 'value', scale: true, ...axisStyle(t) }, yAxis: { type: 'category', inverse: true, data: rows.map((r) => r[labelField]), ...axisStyle(t), axisLabel: { color: t.ink2, fontSize: 12 }, splitLine: { show: false } },
          tooltip: { ...baseOpt(t).tooltip, trigger: 'axis', axisPointer: { type: 'shadow', shadowStyle: { color: t.line, opacity: .4 } } },
          series: [{ name: numField, type: 'bar', barWidth: 12, data: rows.map((r) => Number(r[numField])), itemStyle: { color: t.s[0], borderRadius: [0, 4, 4, 0] } }],
        }), { height: Math.min(40 + rows.length * 22, 420) }))
      }
      nodes.push(rows.length ? table({ cols, rows, limit: 200 }) : h('div', { class: 'call' }, `Done. ${res.affectedRows ?? 0} rows affected.`))
      result.replaceChildren(...nodes)
    } catch (e) {
      info.textContent = ''
      result.replaceChildren(h('div', { class: 'err' }, e.message))
    }
  }
  box.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); runBox() } })
  p.controls(select([['', 'Example queries…'], ...PRESETS.map(([l], i) => [i, l])], '', (v) => { if (v !== '') { box.value = PRESETS[v][1]; runBox() } }, { id: 'sql-preset', 'aria-label': 'Example queries' }),
    h('button', { class: 'btn primary', onclick: () => runBox() }, 'Run'), h('span', { class: 'dim', style: 'font-size:13px' }, '⌘ or Ctrl + Enter'), info)
  p.body.append(box, h('div', { style: 'height:10px' }), result)

  const sc = panel(root, { title: 'Schema', span: 4, note: 'Click a column to insert it at the cursor.' })
  const cols = await q(`SELECT table_name, column_name, data_type, (SELECT table_type FROM information_schema.tables x WHERE x.table_name = c.table_name AND x.table_schema = 'public') AS kind FROM information_schema.columns c WHERE table_schema = 'public' ORDER BY table_name, ordinal_position`)
  const groups = [['Star schema', (n) => n.startsWith('dim_') || n.startsWith('fact_') || n.startsWith('ref_')], ['Analysis views', (n) => n.startsWith('v_')], ['Normalized (Task 2)', () => true]]
  const seen = new Set()
  sc.body.append(h('div', { class: 'schema' }, groups.map(([label, test]) => {
    const names = [...new Set(cols.map((c) => c.table_name))].filter((n) => !seen.has(n) && test(n))
    names.forEach((n) => seen.add(n))
    return h('div', {}, h('div', { style: 'font-weight:700;padding-top:6px' }, label), names.map((n) => h('details', { open: n === 'fact_results' ? 'open' : false }, h('summary', {}, n),
      cols.filter((c) => c.table_name === n).map((c) => h('span', { onclick: () => { const i = box.selectionStart; box.setRangeText(c.column_name, i, box.selectionEnd, 'end'); box.focus() } }, `${c.column_name} · ${c.data_type}`)))))
  })))

  const bp = panel(root, { title: 'Star vs normalized', tag: 'Task 4 preview', note: 'Runs each query pair 31 times, drops the first run, and reports the median. These are browser timings on the small 2025 dataset. Use them to see the shape of the comparison. Final report numbers should come from a PostgreSQL server.' })
  const bslot = h('div', {})
  bp.controls(h('button', { class: 'btn primary', onclick: runBench }, 'Run the comparison'))
  bp.body.append(bslot)
  const joins = (s) => (s.match(/\bJOIN\b/g) ?? []).length
  bslot.append(table({ rows: BENCH.map(([name, a, b]) => ({ name, sj: joins(a), nj: joins(b), a, b })), cols: [{ k: 'name', l: 'Query' }, { k: 'sj', l: 'Star joins', n: 1 }, { k: 'nj', l: 'Normalized joins', n: 1 },
    { k: 'a', l: '', f: (v, r) => h('span', { class: 'row' }, h('button', { class: 'sqlbtn', onclick: () => { box.value = r.a; runBox(); scrollTo(0, 0) } }, 'Star SQL'), h('button', { class: 'sqlbtn', onclick: () => { box.value = r.b; runBox(); scrollTo(0, 0) } }, 'Normalized SQL')) }] }))
  async function runBench() {
    bslot.replaceChildren(h('div', { class: 'call' }, 'Running…'))
    await new Promise((r) => setTimeout(r, 30))
    const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]
    const time = async (s) => { const xs = []; for (let i = 0; i < 31; i++) { const t = performance.now(); await db.query(s); xs.push(performance.now() - t) } return median(xs.slice(1)) }
    const rows = []
    for (const [name, a, b] of BENCH) { const sm = await time(a), nm = await time(b); rows.push({ name, sj: joins(a), nj: joins(b), sm, nm, ratio: nm / sm }) }
    bslot.replaceChildren(table({ rows, cols: [{ k: 'name', l: 'Query' }, { k: 'sj', l: 'Star joins', n: 1 }, { k: 'nj', l: 'Normalized joins', n: 1 }, { k: 'sm', l: 'Star ms', n: 1, f: (v) => fmtNum(v, 2) }, { k: 'nm', l: 'Normalized ms', n: 1, f: (v) => fmtNum(v, 2) }, { k: 'ratio', l: 'Normalized ÷ star', n: 1, f: (v) => fmtNum(v, 2) }] }))
  }
  box.value = PRESETS[0][1]
  await runBox()
}

export default { id: 'console', label: 'SQL console', render: pageConsole, setSql }
