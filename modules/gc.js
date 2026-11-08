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
  body.append(h('div', { class: 'row' }, teamLink(r.team_name, r.team_key), natLink(r.rider_country_code), h('span', { class: 'dim' }, `age ${r.age_at_start} at the start`)))
  if (r.race_status === 'Finished') {
    body.append(kv([[`#${r.gc_rank}`, 'GC rank'], [fmtTime(r.total_adjusted), 'Adjusted time'], [fmtGap(r.gap), 'Behind the winner'], [r.wins, 'Stage wins'], [r.podiums, 'Podiums'], [r.top10s, 'Top tens']]))
  } else {
    body.append(h('div', { class: 'call' }, `Left the race at stage ${r.exit_stage}: ${r.exit_reason}. Recorded ${rows.length} stage results.`))
  }
  const swings = rows.filter((x) => x.gap_change != null)
  if (swings.length) {
    const pivot = swings.reduce((a, b) => (Math.abs(b.gap_change) > Math.abs(a.gap_change) ? b : a))
    const lost = pivot.gap_change > 0
    body.append(h('div', { class: 'call' }, h('b', {}, `Pivotal day: stage ${pivot.stage_id}. `),
      `${lost ? 'Lost' : 'Gained'} ${fmtGap(Math.abs(pivot.gap_change)).slice(1)} on the race leader on this ${pivot.terrain.toLowerCase()} stage, moving from GC ${pivot.gc_rank - pivot.rank_change} to GC ${pivot.gc_rank}. Stage 1 is left out because no gap exists before it.`))
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
      { k: 'gap_to_winner', l: 'To winner', n: 1, f: fmtGap },
      { k: 'time_bonus', l: 'Bonus', n: 1 }, { k: 'time_penalty', l: 'Pen.', n: 1 },
      { k: 'gc_rank', l: 'GC', n: 1 }, { k: 'gap_to_leader', l: 'GC gap', n: 1, f: fmtGap },
    ], rows, hit: (x) => swings.length && x.stage_id === swings.reduce((a, b) => (Math.abs(b.gap_change) > Math.abs(a.gap_change) ? b : a)).stage_id,
  }), sqlShow(sql))
}
VIEWS.rider = riderView

// ---------- Page: General Classification (E1, E7, E10) ----------
const SCEN = {
  official: ['Official', 'total_finish - total_bonus + total_penalty'],
  nobonus: ['No bonuses', 'total_finish + total_penalty'],
  nopenalty: ['No penalties', 'total_finish - total_bonus'],
  raw: ['Neither', 'total_finish'],
}
async function pageGC(root) {
  const top = await q(`SELECT rider_name, total_adjusted, gap, team_name FROM v_gc ORDER BY gc_rank LIMIT 3`)
  root.append(h('div', { class: 'stat' },
    h('div', {}, h('b', {}, top[0].rider_name), h('span', {}, h('i', { class: 'jersey j-gc' }), `GC winner · ${fmtTime(top[0].total_adjusted)}`)),
    h('div', {}, h('b', {}, fmtGap(top[1].gap)), h('span', {}, `${top[1].rider_name} in second`)),
    h('div', {}, h('b', {}, fmtGap(top[2].gap)), h('span', {}, `${top[2].rider_name} in third`)),
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
      h('button', { 'aria-label': `Remove ${names[i]}`, onclick: () => { st.keys = st.keys.filter((x) => x !== k); if (st.keys.length) drawStory() } }, '×'))))
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
  const lb = panel(root, { title: 'GC leaderboard', tag: 'E1 E7', note: 'Lowest cumulative adjusted time among the riders who finished all 21 stages. Pick a scenario to replay the standings without bonuses or penalties. Open a rider to find the day that most changed their race.', sql: '' })
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
ORDER BY scenario_rank;`
    lb.sql = sql
    const rows = await q(sql)
    const moved = rows.filter((r) => Number(r.scenario_rank) !== Number(r.official_rank))
    const into = rows.filter((r) => r.scenario_rank <= 10 && r.official_rank > 10)
    const out = rows.filter((r) => r.scenario_rank > 10 && r.official_rank <= 10)
    noteEl.textContent = s === 'official' ? 'Official standings. Sort any column, for example Bonus, to rank riders by cumulative bonus seconds.'
      : (moved.length ? `${moved.length} riders change position under “${SCEN[s][0]}”. ` : `Nobody changes position under “${SCEN[s][0]}”. Time gaps are larger than the bonuses and penalties involved. `) + (into.length || out.length ? `Into the top ten: ${into.map((r) => r.rider_name).join(', ') || 'nobody'}. Out: ${out.map((r) => r.rider_name).join(', ') || 'nobody'}.` : 'The top ten stays the same riders.')
    tableSlot.replaceChildren(table({
      limit: 20, rows, hit: (r) => r.scenario_rank <= 3,
      onRow: (r) => open({ t: 'rider', id: r.rider_key }),
      cols: [{ k: 'scenario_rank', l: 'Rank', n: 1 },
        { k: 'official_rank', l: 'Move', n: 1, sortBy: (r) => r.official_rank - r.scenario_rank, f: (v, r) => { const d = v - r.scenario_rank; return d === 0 ? h('span', { class: 'dim' }, '–') : h('span', { class: d > 0 ? 'up' : 'down' }, `${d > 0 ? '▲' : '▼'}${Math.abs(d)}`) } },
        riderCol(), teamCol(), { k: 'rider_country_code', l: 'Nat.', f: (v) => natLink(v) },
        { k: 'scenario_time', l: 'Time', n: 1, f: fmtTime }, { k: 'gap', l: 'Gap', n: 1, f: fmtGap },
        { k: 'total_bonus', l: 'Bonus', n: 1 }, { k: 'total_penalty', l: 'Penalty', n: 1 }],
    }))
  }
  await drawLb('official')
  await classificationPanels(root)
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
  const st = { young: 'young_at_start', only: false, by: 'gc_rank' }
  const cp = panel(root, { title: 'Classification comparison', tag: 'Brief b · E4', sql: '', note: 'Young rider means under 26 on the first race day, as the suggested functions set the age filter at race start. The 2025 regulations (Art. 24 d) use born on or after 1 January 2000 instead, which drops Johannessen and makes Vauquelin third, as in the published standings. Points classification counts stage finishes only, on the official scale (Art. 24 b), which depends on each stage\'s coefficient. The data has no intermediate sprints, so sprinters are understated: Milan won the official classification with 372. Mountain proxy adds adjusted time on Mountain stages only, as the suggested functions propose; the data has no climb points.' })
  const sl = h('div', {}), tb = h('div', {})
  cp.body.append(sl, tb)
  cp.controls(seg([['young_at_start', 'Young: under 26 at race start'], ['young_born_2000', 'Young: born 2000 or later (regulations)']], st.young, (v) => { st.young = v; drawCp() }),
    seg([['false', 'All finishers'], ['true', 'Young riders only']], 'false', (v) => { st.only = v === 'true'; drawCp() }))
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
    tb.replaceChildren(table({ limit: 15, rows, onRow: (r) => open({ t: 'rider', id: r.rider_key }), cols: [
      riderCol(), teamCol(), { k: 'age_at_start', l: 'Age', n: 1 },
      { k: 'gc_rank', l: 'GC', n: 1 }, { k: 'young_rank', l: 'Young', n: 1 }, { k: 'mountain_rank', l: 'Mountain proxy', n: 1 }, { k: 'points_rank', l: 'Points rank', n: 1 }, { k: 'finish_points', l: 'Points', n: 1 },
      { k: 'mountain_shift', l: 'GC vs mountain', n: 1, hint: 'Positive means the rider ranks better on mountain stages than overall', f: (v) => (v == 0 ? h('span', { class: 'dim' }, '–') : h('span', { class: v > 0 ? 'up' : 'down' }, `${v > 0 ? '▲' : '▼'}${Math.abs(v)}`)) }] }))
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
