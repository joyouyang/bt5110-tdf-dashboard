// Page: General Classification and Young rider (E1, E4, E7, E10, brief b and c).
// Owner: GC and Young module. Also owns the rider dossier in the drawer.
import {
  $, h, boot, q, str, pad, fmtTime, fmtGap,
  fmtNum, fmtInt, shortTeam, TERRAIN, GLYPH, terrainVar, terrain, table,
  riderCol, teamLink, teamCol, natLink, stageLink, live, tokens, baseOpt,
  axisStyle, chart, sweep, redrawAll, panel, seg, select, S,
  loadLookups, riderColor, open, closeDrawer, VIEWS, kv, sqlShow, hooks,
  toConsole,
} from '../shared/core.js'

async function riderView(key, title, body) {
  const [r] = await q(`SELECT r.*, g.gc_rank, g.gap, g.total_adjusted, g.total_bonus, g.total_penalty, g.wins, g.podiums, g.top10s, t.team_key
    FROM dim_rider r JOIN dim_team t USING (team_name) LEFT JOIN v_gc g USING (rider_key) WHERE r.rider_key = ${Number(key)}`)
  title.textContent = `${r.bib_number} · ${r.rider_name}`
  const sql = `SELECT s.stage_id, s.terrain, s.route, f.stage_rank, f.adjusted_time, f.time_bonus, f.time_penalty,
       f.gap_to_winner, p.gc_rank, p.gap_to_leader,
       p.gap_to_leader - LAG(p.gap_to_leader) OVER (ORDER BY s.stage_id) AS gap_change,
       p.gc_rank - LAG(p.gc_rank) OVER (ORDER BY s.stage_id) AS rank_change
FROM fact_results f
JOIN dim_stage s USING (stage_key)
LEFT JOIN v_gc_progress p ON p.rider_key = f.rider_key AND p.stage_id = s.stage_id
WHERE f.rider_key = ${Number(key)}
ORDER BY s.stage_id;`
  const rows = await q(sql)
  body.append(h('div', { class: 'row' }, teamLink(r.team_name, r.team_key), natLink(r.rider_country_code), h('span', { class: 'dim' }, `age ${r.age_at_start} at the start · ${r.young_at_start ? 'Young rider eligible (under 26 at race start)' : 'Not eligible for Young rider'}`)))
  if (r.race_status === 'Finished') {
    body.append(kv([[`#${r.gc_rank}`, 'GC rank'], [fmtTime(r.total_adjusted), 'Adjusted time'], [fmtGap(r.gap), 'Behind the winner'], [r.wins, 'Stage wins'], [r.podiums, 'Podiums'], [r.top10s, 'Top tens']]))
  } else {
    body.append(h('div', { class: 'call' }, `Left the race at stage ${r.exit_stage}: ${r.exit_reason}. Recorded ${rows.length} stage results.`))
  }
  const swings = rows.filter((x) => x.gap_change != null)
  if (swings.length) {
    const pivot = swings.reduce((a, b) => (Math.abs(b.gap_change) > Math.abs(a.gap_change) ? b : a))
    const lost = pivot.gap_change > 0
    body.append(h('div', { class: 'call' }, h('b', {}, `Largest change in gap to leader: stage ${pivot.stage_id}. `),
      `Gap ${lost ? 'increased' : 'decreased'} by ${fmtGap(Math.abs(pivot.gap_change)).replace(/^[+−]/, '')} on this ${pivot.terrain.toLowerCase()} stage; GC ${pivot.gc_rank - pivot.rank_change} → ${pivot.gc_rank}. The reference is that day’s leader, who may change. Stage 1 has no prior comparison.`))
    const pid = pivot.stage_id
    body.append(chart((t) => ({
      ...baseOpt(t), legend: undefined,
      grid: { left: 58, right: 14, top: 12, bottom: 28 },
      xAxis: { type: 'category', data: rows.map((x) => `S${x.stage_id}`), ...axisStyle(t) },
      yAxis: { type: 'value', inverse: true, ...axisStyle(t), axisLabel: { ...axisStyle(t).axisLabel, formatter: (v) => fmtGap(v) } },
      tooltip: { ...baseOpt(t).tooltip, trigger: 'axis', formatter: (p) => `${p[0].name}: ${fmtGap(p[0].value)} behind the leader` },
      series: [{ type: 'line', data: rows.map((x) => x.gap_to_leader), lineStyle: { width: 2, color: t.s[0] }, itemStyle: { color: t.s[0] }, symbolSize: 6,
        markPoint: { symbol: 'circle', symbolSize: 12, itemStyle: { color: t.jaune, borderColor: t.ink, borderWidth: 1 }, label: { show: false }, data: [{ xAxis: `S${pid}`, yAxis: rows.find((x) => x.stage_id === pid).gap_to_leader }] } }],
    }), { height: 200 }))
  }
  if (rows.length) body.append(h('h3', {}, 'Stage by stage'), table({
    cols: [
      { k: 'stage_id', l: 'Stage', f: (v) => stageLink(v) }, { k: 'terrain', l: 'Type', f: (v) => terrain(v) },
      { k: 'stage_rank', l: 'Rank', n: 1 }, { k: 'adjusted_time', l: 'Adj. time', n: 1, f: fmtTime },
      { k: 'gap_to_winner', l: 'To fastest', n: 1, f: fmtGap },
      { k: 'time_bonus', l: 'Bonus', n: 1 }, { k: 'time_penalty', l: 'Pen.', n: 1 },
      { k: 'gc_rank', l: 'GC', n: 1 }, { k: 'gap_to_leader', l: 'GC gap', n: 1, f: fmtGap },
    ], rows, hit: (x) => swings.length && x.stage_id === swings.reduce((a, b) => (Math.abs(b.gap_change) > Math.abs(a.gap_change) ? b : a)).stage_id,
  }), h('p', { class: 'dim' }, 'Stage gap uses the minimum recorded finish time, which may differ from the rank-1 rider. GC gap compares with the leader at each stage; changes are not a head-to-head gap against one fixed opponent.'), sqlShow(sql))
}
VIEWS.rider = riderView

// ---------- Page: General Classification (E1, E7, E10) ----------
const SCEN = {
  official: ['Dataset baseline', 'total_finish - total_bonus + total_penalty'],
  nobonus: ['No bonuses', 'total_finish + total_penalty'],
  nopenalty: ['No penalties', 'total_finish - total_bonus'],
  raw: ['Neither', 'total_finish'],
}
async function pageGC(root) {
  const top = await q(`SELECT rider_name, total_adjusted, gap, team_name FROM v_gc ORDER BY gc_rank LIMIT 3`)
  root.append(h('div', { class: 'stat' },
    h('div', {}, h('b', {}, top[0].rider_name), h('span', {}, h('i', { class: 'jersey j-gc' }), `Baseline winner · ${fmtTime(top[0].total_adjusted)}`)),
    h('div', {}, h('b', {}, fmtGap(top[1].gap)), h('span', {}, `${top[1].rider_name} · baseline second`)),
    h('div', {}, h('b', {}, fmtGap(top[2].gap)), h('span', {}, `${top[2].rider_name} · baseline third`)),
    h('div', {}, h('b', {}, `${S.counts.finishers} of ${S.counts.riders}`), h('span', {}, 'Riders reached Paris'))))

  // Storyline
  const st = { mode: 'gap', keys: S.finishers.slice(0, 5).map((r) => r.rider_key) }
  const sp = panel(root, { title: 'How the race unfolded', tag: 'E10', note: 'Cumulative adjusted time after each stage. Shaded bands are Mountain stages. Dots mark the biggest one-day swing for each rider shown. Click a line to open that rider.', sql: '' })
  const pills = h('div', { class: 'row' })
  const addRider = select([['', 'Add a rider…'], ...S.riders.map((r) => [r.rider_key, r.rider_name])], '', (v) => { if (v && st.keys.length < 8 && !st.keys.includes(Number(v))) { st.keys.push(Number(v)); drawStory() } addRider.value = '' }, { id: 'story-add', 'aria-label': 'Add a rider' })
  const addTeam = select([['', 'Show a team…'], ...S.teams.map((t) => [t.team_name, shortTeam(t.team_name)])], '', async (v) => {
    if (v) { st.keys = (await q(`SELECT rider_key FROM v_gc WHERE team_name = ${str(v)} ORDER BY gc_rank LIMIT 8`)).map((r) => r.rider_key); drawStory() }
    addTeam.value = ''
  }, { id: 'story-team', 'aria-label': 'Show a team' })
  sp.controls(seg([['gap', 'Gap to leader'], ['cum', 'Cumulative time']], 'gap', (m) => { st.mode = m; drawStory() }), addRider, addTeam, h('button', { class: 'btn', onclick: () => { st.keys = S.finishers.slice(0, 5).map((r) => r.rider_key); drawStory() } }, 'Reset'), pills)
  const slot = h('div', {}), ribbon = h('div', { class: 'row', style: 'padding-top:8px;font-size:13.5px' })
  sp.body.append(slot, ribbon)
  const leaders = await q(`SELECT DISTINCT ON (p.stage_id) p.stage_id, r.rider_name FROM v_gc_progress p JOIN dim_rider r USING (rider_key) WHERE p.gc_rank = 1 ORDER BY p.stage_id, r.rider_name`)
  const runs = []
  for (const l of leaders) { if (runs.at(-1)?.name === l.rider_name) runs.at(-1).to = l.stage_id; else runs.push({ name: l.rider_name, from: l.stage_id, to: l.stage_id }) }
  ribbon.append(h('span', { class: 'dim' }, h('i', { class: 'jersey j-gc' }), 'Race lead:'), ...runs.map((r) => h('span', { class: 'pill' }, `S${r.from}${r.to > r.from ? `–${r.to}` : ''} ${r.name}`)))
  async function drawStory() {
    const sql = `SELECT p.stage_id, p.rider_key, r.rider_name, p.cum_adjusted, p.gap_to_leader, p.gc_rank
FROM v_gc_progress p
JOIN dim_rider r USING (rider_key)
WHERE p.rider_key IN (${st.keys.join(',')})
ORDER BY p.stage_id, p.gc_rank;`
    sp.sql = sql
    const rows = await q(sql)
    const names = st.keys.map((k) => rows.find((r) => r.rider_key === k)?.rider_name ?? S.riders.find((x) => x.rider_key === k).rider_name)
    pills.replaceChildren(...st.keys.map((k, i) => h('span', { class: 'pill' }, h('i', { style: `background:var(--s${i + 1})` }), names[i],
      h('button', { 'aria-label': `Remove ${names[i]}`, onclick: () => { if (st.keys.length === 1) return; st.keys = st.keys.filter((x) => x !== k); drawStory() }, disabled: st.keys.length === 1 }, '×'))))
    const opt = (t) => {
      const ser = st.keys.map((k, i) => {
        const pts = rows.filter((r) => r.rider_key === k)
        const data = pts.map((p) => [p.stage_id, st.mode === 'gap' ? p.gap_to_leader : p.cum_adjusted])
        const swings = pts.slice(1).map((p, j) => ({ s: p.stage_id, d: Math.abs(p.gap_to_leader - pts[j].gap_to_leader), v: st.mode === 'gap' ? p.gap_to_leader : p.cum_adjusted }))
        const big = swings.length ? swings.reduce((a, b) => (b.d > a.d ? b : a)) : null
        return {
          name: names[i], type: 'line', data, smooth: false, symbol: 'circle', symbolSize: 5, lineStyle: { width: 2, color: t.s[i] }, itemStyle: { color: t.s[i] }, riderKey: k,
          endLabel: { show: st.keys.length <= 5, formatter: () => names[i].split(' ').at(-1), color: t.ink2, fontSize: 12 }, labelLayout: { hideOverlap: true },
          markPoint: big ? { symbol: 'circle', symbolSize: 11, itemStyle: { color: t.jaune, borderColor: t.s[i], borderWidth: 2 }, label: { show: false }, data: [{ coord: big && [big.s, big.v], name: `Biggest swing: S${big.s}` }] } : undefined,
          markArea: i === 0 ? { silent: true, itemStyle: { color: t.line, opacity: .55 }, data: S.mountain.map((m) => [{ xAxis: m - .5 }, { xAxis: m + .5 }]) } : undefined,
        }
      })
      return {
        ...baseOpt(t), grid: { left: 70, right: 76, top: 30, bottom: 28 },
        xAxis: { type: 'value', min: .5, max: 21.5, interval: 1, ...axisStyle(t), splitLine: { show: false }, axisLabel: { ...axisStyle(t).axisLabel, formatter: (v) => (Number.isInteger(v) ? `S${v}` : '') } },
        yAxis: { type: 'value', inverse: st.mode === 'gap', scale: st.mode !== 'gap', ...axisStyle(t), axisLabel: { ...axisStyle(t).axisLabel, formatter: (v) => (st.mode === 'gap' ? fmtGap(v) : `${Math.round(v / 3600)}h`) } },
        tooltip: { ...baseOpt(t).tooltip, trigger: 'axis', axisPointer: { type: 'line', lineStyle: { color: t.axis } }, formatter: (ps) => {
          const s = S.stages.find((x) => x.stage_id === ps[0].value[0])
          return `<b>Stage ${s.stage_id} · ${s.terrain}</b><br>` + ps.slice().sort((a, b) => a.value[1] - b.value[1]).map((p) => `${p.marker}${p.seriesName}: ${st.mode === 'gap' ? fmtGap(p.value[1]) : fmtTime(p.value[1])}`).join('<br>')
        } },
        series: ser,
      }
    }
    sweep()
    slot.replaceChildren(chart(opt, { height: 380, onClick: (e) => { const k = st.keys[e.seriesIndex]; if (k) open({ t: 'rider', id: k }) } }))
    sweep()
  }
  await drawStory()

  // Leaderboard with counterfactuals
  const lb = panel(root, { title: 'GC leaderboard', tag: 'E1 E7', note: '160 finishers, ranked by cumulative time. Scenario buttons affect this table only; all other panels stay on baseline. Click a rider for stage details.', sql: '' })
  const noteEl = h('div', { class: 'call' }), tableSlot = h('div', {})
  lb.body.append(noteEl, tableSlot)
  lb.controls(seg(Object.entries(SCEN).map(([k, v]) => [k, v[0]]), 'official', drawLb))
  async function drawLb(s) {
    const sql = `WITH scenario AS (
  SELECT rider_key, rider_name, team_name, rider_country_code, total_bonus, total_penalty,
         gc_rank AS official_rank, ${SCEN[s][1]} AS scenario_time
  FROM v_gc
)
SELECT RANK() OVER (ORDER BY scenario_time) AS scenario_rank, sc.*, t.team_key,
       scenario_time - MIN(scenario_time) OVER () AS gap
FROM scenario sc JOIN dim_team t USING (team_name)
ORDER BY scenario_rank, rider_key;`
    lb.sql = sql
    const rows = await q(sql)
    const moved = rows.filter((r) => Number(r.scenario_rank) !== Number(r.official_rank))
    const into = rows.filter((r) => r.scenario_rank <= 10 && r.official_rank > 10)
    const out = rows.filter((r) => r.scenario_rank > 10 && r.official_rank <= 10)
    const baselineGap = Number(top[1].gap)
    const scenarioGap = Number(rows[1].gap)
    const delta = scenarioGap - baselineGap
    const margin = `First-to-second margin: ${fmtGap(scenarioGap)}; baseline ${fmtGap(baselineGap)}${delta === 0 ? ' (unchanged)' : ` (${Math.abs(delta)} seconds ${delta < 0 ? 'smaller' : 'larger'})`}.`
    noteEl.textContent = s === 'official'
      ? `Baseline margin: ${fmtGap(baselineGap)}. Calculated from supplied results; published total times may differ. Time-only ranks.`
      : `${moved.length === 0 ? 'Ranks unchanged.' : `${moved.length} riders change rank.`} ${margin} ${into.length || out.length ? `Into top ten: ${into.map((r) => r.rider_name).join(', ') || 'none'}; out: ${out.map((r) => r.rider_name).join(', ') || 'none'}.` : 'Top-ten membership unchanged.'}`
    tableSlot.replaceChildren(table({
      limit: 10, rows, hit: (r) => r.scenario_rank <= 3,
      onRow: (r) => open({ t: 'rider', id: r.rider_key }),
      cols: [{ k: 'scenario_rank', l: 'Rank', n: 1 },
        { k: 'official_rank', l: 'Move', n: 1, sortBy: (r) => r.official_rank - r.scenario_rank, f: (v, r) => { const d = v - r.scenario_rank; return d === 0 ? h('span', { class: 'dim' }, '–') : h('span', { class: d > 0 ? 'up' : 'down' }, `${d > 0 ? '▲' : '▼'}${Math.abs(d)}`) } },
        riderCol(), teamCol(), { k: 'rider_country_code', l: 'Nat.', f: (v) => natLink(v) },
        { k: 'scenario_time', l: 'Time', n: 1, f: fmtTime }, { k: 'gap', l: 'Gap', n: 1, f: fmtGap },
        { k: 'total_bonus', l: 'Bonus', n: 1 }, { k: 'total_penalty', l: 'Penalty', n: 1 }],
    }))
  }
  await drawLb('official')
  root.insertBefore(lb.el, sp.el)
  await headToHead(root)
  await pivotalStages(root)
  await classificationPanels(root)
}

// Fixed opponents keep the reference unchanged when the race leader changes.
async function headToHead(root) {
  const st = { a: S.finishers[0].rider_key, b: S.finishers[1].rider_key }
  const p = panel(root, { title: 'Largest daily change against a fixed rival', tag: 'E1 E10', sql: '',
    note: 'Compare two finishers against the same opponent throughout the race. Negative means rider A is ahead; positive means rider B is ahead. This panel uses baseline adjusted time, independently of the GC scenario buttons above. Stage 1 is included in totals but excluded from the biggest day-to-day swing.' })
  const options = S.finishers.map((r) => [r.rider_key, r.rider_name])
  const chartSlot = h('div', {}), summary = h('p', {}), detail = h('div', {})
  p.body.append(summary, chartSlot, detail)
  p.controls(select(options, st.a, (v) => { st.a = Number(v); draw() }, { 'aria-label': 'Rivalry rider A' }),
    select(options, st.b, (v) => { st.b = Number(v); draw() }, { 'aria-label': 'Rivalry rider B' }))
  let revision = 0
  async function draw() {
    const rev = ++revision
    const a = Number(st.a), b = Number(st.b)
    if (a === b) { p.sql = ''; summary.textContent = 'Choose two different riders to compare.'; chartSlot.replaceChildren(); detail.replaceChildren(); sweep(); return }
    const nameA = S.finishers.find((r) => r.rider_key === a).rider_name
    const nameB = S.finishers.find((r) => r.rider_key === b).rider_name
    const sql = `WITH paired AS (
  SELECT x.stage_id, s.terrain, x.cum_adjusted - y.cum_adjusted AS gap_a_minus_b
  FROM v_gc_progress x
  JOIN v_gc_progress y ON y.stage_id = x.stage_id AND y.rider_key = ${b}
  JOIN dim_stage s ON s.stage_id = x.stage_id
  WHERE x.rider_key = ${a}
)
SELECT *, gap_a_minus_b - LAG(gap_a_minus_b) OVER (ORDER BY stage_id) AS daily_change
FROM paired ORDER BY stage_id;`
    p.sql = sql
    const rows = await q(sql)
    if (rev !== revision) return
    const swings = rows.filter((r) => r.daily_change != null)
    const pivot = swings.reduce((a, b) => Math.abs(Number(b.daily_change)) > Math.abs(Number(a.daily_change)) ? b : a)
    const last = rows.at(-1), gap = Number(last.gap_a_minus_b)
    summary.replaceChildren(h('b', {}, `${nameA} versus ${nameB}. `),
      `Final difference: ${fmtGap(Math.abs(gap))} (${gap < 0 ? nameA : gap > 0 ? nameB : 'neither rider'}${gap === 0 ? ' leads: tied' : ' ahead'}). `,
      `Largest daily swing: stage ${pivot.stage_id}, ${pivot.terrain}, ${fmtGap(Math.abs(Number(pivot.daily_change)))} towards ${Number(pivot.daily_change) < 0 ? nameA : nameB}.`)
    chartSlot.replaceChildren(chart((t) => ({ ...baseOpt(t), legend: undefined,
      grid: { left: 80, right: 25, top: 20, bottom: 40 },
      xAxis: { type: 'category', data: rows.map((r) => `S${r.stage_id}`), ...axisStyle(t) },
      yAxis: { type: 'value', ...axisStyle(t), axisLabel: { ...axisStyle(t).axisLabel, formatter: (v) => `${v < 0 ? '−' : '+'}${Math.abs(v)}s` } },
      tooltip: { ...baseOpt(t).tooltip, trigger: 'axis', formatter: (ps) => { const r = rows[ps[0].dataIndex]; return `Stage ${r.stage_id} · ${r.terrain}<br>A minus B: ${fmtGap(Number(r.gap_a_minus_b))}<br>Daily change: ${r.daily_change == null ? 'No previous stage' : fmtGap(Number(r.daily_change))}` } },
      series: [{ type: 'line', data: rows.map((r) => Number(r.gap_a_minus_b)), itemStyle: { color: t.s[0] }, lineStyle: { color: t.s[0], width: 2 },
        markLine: { silent: true, data: [{ yAxis: 0 }], label: { show: false } },
        markPoint: { data: [{ coord: [`S${pivot.stage_id}`, Number(pivot.gap_a_minus_b)] }], symbolSize: 35, label: { formatter: () => `S${pivot.stage_id}` } } }],
    }), { height: 270, onClick: (e) => { if (e.dataIndex != null && rows[e.dataIndex]) open({ t: 'stage', id: rows[e.dataIndex].stage_id }) } }))
    detail.replaceChildren(h('details', {}, h('summary', {}, 'Compare daily changes'), table({ rows, limit: 5, cols: [
      { k: 'stage_id', l: 'Stage', f: (v) => stageLink(v) }, { k: 'terrain', l: 'Terrain', f: terrain },
      { k: 'gap_a_minus_b', l: 'A minus B', n: 1, f: (v) => fmtGap(Number(v)) },
      { k: 'daily_change', l: 'Daily change', n: 1, f: (v) => v == null ? '—' : fmtGap(Number(v)) },
    ] })))
    sweep()
  }
  await draw()
}

async function pivotalStages(root) {
  const disclosure = h('details', { style: 'grid-column:1 / -1' }, h('summary', {}, 'Explore whole-field rank changes'))
  root.append(disclosure)
  const p = panel(disclosure, { title: 'Rank churn versus time gaps', tag: 'E1 E10', sql: '',
    note: 'This is rank churn, not a measure of route difficulty or of the winner’s advantage. Compare riders present on both consecutive stages; exits can cause passive moves. The rank-1–10 cohort includes ties on the previous stage and riders also present today, so it can contain more than ten riders. Stage 1 has no prior comparison.' })
  const slot = h('div', {})
  p.body.append(slot)
  const st = { scope: 'all', sort: 'magnitude' }
  p.controls(seg([['all', 'Whole field'], ['top10', 'Previous rank 1–10']], st.scope, (v) => { st.scope = v; draw() }),
    seg([['magnitude', 'By movement magnitude'], ['count', 'By riders moved']], st.sort, (v) => { st.sort = v; draw() }))
  let revision = 0
  async function draw() {
    const rev = ++revision
    const sql = `SELECT p.stage_id, s.terrain, COUNT(*) AS comparable_riders,
       COUNT(*) FILTER (WHERE p.gc_rank <> prev.gc_rank) AS riders_moved,
       SUM(ABS(p.gc_rank - prev.gc_rank)) AS total_rank_movement,
       ROUND(AVG(ABS(p.gc_rank - prev.gc_rank)), 2) AS mean_rank_movement,
       MAX(ABS(p.gc_rank - prev.gc_rank)) AS largest_move
FROM v_gc_progress p
JOIN v_gc_progress prev ON prev.rider_key = p.rider_key AND prev.stage_id = p.stage_id - 1
JOIN dim_stage s ON s.stage_id = p.stage_id
${st.scope === 'top10' ? 'WHERE prev.gc_rank <= 10' : ''}
GROUP BY p.stage_id, s.terrain
ORDER BY ${st.sort === 'magnitude' ? 'mean_rank_movement DESC, total_rank_movement DESC' : 'riders_moved DESC, mean_rank_movement DESC'}, p.stage_id;`
    p.sql = sql
    const rows = await q(sql)
    if (rev !== revision) return
    slot.replaceChildren(table({ rows, limit: 5, cols: [
      { k: 'stage_id', l: 'Stage', f: (v) => stageLink(v) }, { k: 'terrain', l: 'Terrain', f: terrain },
      { k: 'riders_moved', l: 'Riders moved', n: 1 }, { k: 'comparable_riders', l: 'Compared', n: 1 },
      { k: 'mean_rank_movement', l: 'Mean absolute move', n: 1 },
      { k: 'total_rank_movement', l: 'Total absolute moves', n: 1 }, { k: 'largest_move', l: 'Largest move', n: 1 },
    ] }))
  }
  await draw()
}

// ---------- Parallel classifications (brief b and c, E4) ----------
async function classificationPanels(root) {
  const cumSql = `SELECT 'General' AS class, r.rider_name AS leader, g.total_adjusted AS value FROM v_gc g JOIN dim_rider r USING (rider_key) WHERE g.gc_rank = 1
UNION ALL
SELECT 'Young rider', g.rider_name, g.total_adjusted FROM v_gc g WHERE g.young_at_start ORDER BY 3 LIMIT 1;`
  const [gc] = await q(`SELECT rider_name, total_adjusted FROM v_gc ORDER BY gc_rank LIMIT 1`)
  const [yg] = await q(`SELECT rider_name, total_adjusted FROM v_gc WHERE young_at_start ORDER BY total_adjusted LIMIT 1`)
  const [mt] = await q(`SELECT r.rider_name, m.mountain_time FROM v_mountain_proxy m JOIN dim_rider r USING (rider_key) ORDER BY m.mountain_rank LIMIT 1`)
  const [pt] = await q(`SELECT r.rider_name, p.finish_points FROM v_finish_points p JOIN dim_rider r USING (rider_key) ORDER BY p.points_rank LIMIT 1`)
  const [tm] = await q(`SELECT t.team_name, c.team_time FROM v_team_classification c JOIN dim_team t USING (team_key) ORDER BY c.team_rank LIMIT 1`)
  root.append(h('div', { class: 'stat' }, [['j-gc', 'General', gc.rider_name, fmtTime(gc.total_adjusted)], ['j-yng', 'Young rider', yg.rider_name, fmtTime(yg.total_adjusted)],
    ['j-kom', 'Mountain proxy', mt.rider_name, `${fmtTime(mt.mountain_time)} on 6 stages`], ['j-pts', 'Points', pt.rider_name, `${pt.finish_points} pts, stage finishes only`], ['j-team', 'Team', shortTeam(tm.team_name), fmtTime(tm.team_time)]]
    .map(([j, l, b, v]) => h('div', {}, h('b', {}, b), h('span', {}, h('i', { class: `jersey ${j}` }), `${l} · ${v}`)))))

  // Comparison
  const st = { young: 'young_at_start', only: false, detailed: false }
  const cp = panel(root, { title: 'Classification comparison', tag: 'Brief b · E4', sql: '', note: 'Young: under 26 on 5 July 2025 (group definition). Points: stage finishes only. Mountain: time proxy, not official KOM.' })
  cp.body.append(h('details', {}, h('summary', {}, 'Definitions and data limits'), h('p', {}, 'For this project, our group defines Young Rider as under 26 on the first race day, 5 July 2025. This age-based definition differs from the official 2025 French regulations, which require birth on or after 1 January 2000. Under our definition Johannessen is third; under the official birth-date rule Vauquelin is third. Points classification counts stage finishes only, on the official scale (Art. 24 b), which depends on each stage\'s coefficient. The data has no intermediate sprints, so sprinters are understated: Milan won the official classification with 372. Mountain proxy adds adjusted time on Mountain stages only, as the suggested functions propose; the data has no climb points.')))
  const sl = h('div', {}), tb = h('div', {})
  cp.body.append(tb, h('details', {}, h('summary', {}, 'Compare GC and mountain ranks visually'), sl))
  cp.controls(seg([['false', 'All finishers'], ['true', 'Young riders only']], 'false', (v) => { st.only = v === 'true'; drawCp() }),
    seg([['summary', 'Key ranks'], ['details', 'All metrics']], 'summary', (v) => { st.detailed = v === 'details'; drawCp() }))
  async function drawCp() {
    const sql = `SELECT g.rider_key, g.rider_name, g.team_name, t.team_key, g.age_at_start,
       g.gc_rank, m.mountain_rank, p.points_rank, p.finish_points,
       CASE WHEN g.${st.young} THEN RANK() OVER (PARTITION BY g.${st.young} ORDER BY g.total_adjusted) END AS young_rank,
       g.gc_rank - m.mountain_rank AS mountain_shift
FROM v_gc g
JOIN dim_team t USING (team_name)
JOIN v_mountain_proxy m USING (rider_key)
JOIN v_finish_points p USING (rider_key)
${st.only ? `WHERE g.${st.young}\n` : ''}ORDER BY g.gc_rank;`
    cp.sql = sql
    const rows = await q(sql)
    const cols = [riderCol(), { k: 'age_at_start', l: 'Age at start', n: 1 },
      { k: 'gc_rank', l: 'GC', n: 1 }, { k: 'young_rank', l: 'Young', n: 1 },
      { k: 'mountain_rank', l: 'Mountain proxy', n: 1 }, { k: 'points_rank', l: 'Finish-points rank', n: 1 }]
    if (st.detailed) cols.splice(1, 0, teamCol())
    if (st.detailed) cols.push({ k: 'finish_points', l: 'Finish points', n: 1 },
      { k: 'mountain_shift', l: 'GC minus mountain rank', n: 1 })
    tb.replaceChildren(table({ limit: 10, rows, onRow: (r) => open({ t: 'rider', id: r.rider_key }), cols }))
    const list = rows.slice(0, 20)
    const movers = [...list].sort((a, b) => Math.abs(b.mountain_shift) - Math.abs(a.mountain_shift)).slice(0, 3).map((r) => r.rider_key)
    sweep()
    sl.replaceChildren(chart((t) => ({
      ...baseOpt(t), legend: undefined, grid: { left: 130, right: 130, top: 22, bottom: 6 },
      xAxis: { type: 'category', data: ['GC rank', 'Mountain proxy rank'], position: 'top', boundaryGap: false, axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: t.ink2, fontWeight: 600 } },
      yAxis: { type: 'value', inverse: true, min: 1, max: Math.max(...list.map((r) => Math.max(r.gc_rank, r.mountain_rank))), show: false },
      tooltip: { ...baseOpt(t).tooltip, formatter: (p) => `${p.seriesName}: GC ${p.data === undefined ? '' : list[p.seriesIndex].gc_rank}, mountain ${list[p.seriesIndex].mountain_rank}` },
      series: list.map((r) => {
        const on = movers.includes(r.rider_key), i = movers.indexOf(r.rider_key)
        return { name: r.rider_name, type: 'line', data: [Number(r.gc_rank), Number(r.mountain_rank)], z: on ? 3 : 1, symbolSize: on ? 7 : 4, lineStyle: { width: on ? 2 : 1, color: on ? t.s[i] : t.axis }, itemStyle: { color: on ? t.s[i] : t.axis },
          label: { show: true, formatter: (p) => (p.dataIndex === 0 ? r.rider_name.split(' ').at(-1) : ''), position: 'left', color: on ? t.ink : t.muted, fontSize: 11 },
          endLabel: { show: on, formatter: () => r.rider_name.split(' ').at(-1), color: t.ink, fontSize: 11 } }
      }),
    }), { height: 420, onClick: (e) => open({ t: 'rider', id: list[e.seriesIndex].rider_key }) }))
    sweep()
  }
  await drawCp()
}

export default { id: 'gc', label: 'General Classification', render: pageGC }
