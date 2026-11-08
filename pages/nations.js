// Page: Nations (brief d, E8, E9).
// Owner: Nations module. Also owns the nation dossier in the drawer.
import {
  $, h, boot, q, str, pad, fmtTime, fmtGap,
  fmtNum, fmtInt, shortTeam, TERRAIN, GLYPH, terrainVar, terrain, table,
  riderCol, teamLink, teamCol, natLink, stageLink, live, tokens, baseOpt,
  axisStyle, chart, sweep, redrawAll, panel, seg, select, S,
  loadLookups, riderColor, open, closeDrawer, VIEWS, kv, sqlShow, hooks,
  toConsole,
} from '../core.js'

async function nationView(code, title, body) {
  const [c] = await q(`SELECT country_name FROM dim_country WHERE country_code = ${str(code)}`)
  title.textContent = `${c?.country_name ?? code} (${code})`
  const sql = `SELECT r.rider_key, r.rider_name, t.team_key, t.team_name, r.race_status, r.exit_stage, g.gc_rank,
       COALESCE(SUM(f.is_win), 0) AS wins, COALESCE(SUM(f.is_podium), 0) AS podiums
FROM dim_rider r
JOIN dim_team t USING (team_name)
LEFT JOIN fact_results f USING (rider_key)
LEFT JOIN v_gc g USING (rider_key)
WHERE r.rider_country_code = ${str(code)}
GROUP BY r.rider_key, t.team_key, g.gc_rank
ORDER BY g.gc_rank NULLS LAST, r.rider_name;`
  const rows = await q(sql)
  const homeTeams = await q(`SELECT team_key, team_name FROM dim_team WHERE team_country_code = ${str(code)} ORDER BY team_name`)
  const wins = await q(`SELECT s.stage_id, s.terrain, r.rider_key, r.rider_name, f.stage_rank FROM fact_results f JOIN dim_rider r USING (rider_key) JOIN dim_stage s USING (stage_key) WHERE r.rider_country_code = ${str(code)} AND f.is_podium = 1 ORDER BY s.stage_id, f.stage_rank`)
  const best = rows.map((r) => r.gc_rank).filter(Boolean)
  body.append(kv([[rows.length, 'Riders'], [homeTeams.length, 'Teams registered here'], [best.length ? `#${Math.min(...best)}` : 'None', 'Best GC'], [rows.reduce((a, r) => a + Number(r.wins), 0), 'Stage wins'], [rows.reduce((a, r) => a + Number(r.podiums), 0), 'Podiums']]))
  if (homeTeams.length) body.append(h('div', { class: 'row' }, h('span', { class: 'dim' }, 'Teams:'), homeTeams.map((t) => teamLink(t.team_name, t.team_key))))
  if (rows.length) body.append(h('h3', {}, 'Riders and their teams'), table({ cols: [riderCol(), teamCol(), { k: 'gc_rank', l: 'GC', n: 1, f: (v, r) => v ?? (r.exit_stage ? `Out S${r.exit_stage}` : '') }, { k: 'wins', l: 'Wins', n: 1 }, { k: 'podiums', l: 'Podiums', n: 1 }], rows }))
  if (wins.length) body.append(h('h3', {}, 'Stage podiums'), table({ cols: [{ k: 'stage_id', l: 'Stage', f: (v) => stageLink(v) }, { k: 'terrain', l: 'Type', f: (v) => terrain(v) }, riderCol(), { k: 'stage_rank', l: 'Rank', n: 1 }], rows: wins }))
  body.append(sqlShow(sql))
}
VIEWS.nation = nationView

// ---------- Page: Nations (brief d, E8, E9) ----------
async function pageNations(root) {
  const sql = `WITH r AS (
  SELECT rider_country_code AS code, rider_country_name AS name, COUNT(*) AS riders,
         COUNT(*) FILTER (WHERE race_status = 'Finished') AS finishers
  FROM dim_rider GROUP BY 1, 2
), t AS (
  SELECT team_country_code AS code, team_country_name AS name, COUNT(*) AS teams
  FROM dim_team GROUP BY 1, 2
), o AS (
  SELECT c.country_code AS code, SUM(f.is_win) AS wins, SUM(f.is_podium) AS podiums
  FROM fact_results f JOIN dim_country c USING (country_key) GROUP BY 1
), b AS (
  SELECT rider_country_code AS code, MIN(gc_rank) AS best_gc FROM v_gc GROUP BY 1
)
SELECT code, COALESCE(r.name, t.name) AS name, COALESCE(riders, 0) AS riders, COALESCE(finishers, 0) AS finishers,
       COALESCE(teams, 0) AS teams, COALESCE(wins, 0) AS wins, COALESCE(podiums, 0) AS podiums, best_gc
FROM r FULL JOIN t USING (code)
LEFT JOIN o USING (code)
LEFT JOIN b USING (code)
ORDER BY riders DESC, teams DESC, code;`
  const rows = (await q(sql)).map((r) => ({ ...r, riders: Number(r.riders), teams: Number(r.teams) }))
  const bar = (key, label, list, ci) => chart((t) => ({
    ...baseOpt(t), legend: undefined, grid: { left: 8, right: 30, top: 6, bottom: 20, containLabel: true },
    xAxis: { type: 'value', minInterval: 1, ...axisStyle(t) },
    yAxis: { type: 'category', data: list.map((r) => r.name), inverse: true, ...axisStyle(t), axisLabel: { color: t.ink2, fontSize: 12 }, splitLine: { show: false } },
    tooltip: { ...baseOpt(t).tooltip, formatter: (p) => `${p.name}: ${p.value} ${label}` },
    series: [{ type: 'bar', barWidth: 11, data: list.map((r) => r[key]), itemStyle: { color: t.s[ci], borderRadius: [0, 4, 4, 0] }, label: { show: true, position: 'right', color: t.ink2, fontFamily: t.mono, fontSize: 11 } }],
  }), { height: 34 + list.length * 19, onClick: (e) => open({ t: 'nation', id: list[e.dataIndex].code }) })
  const r1 = rows.filter((r) => r.riders > 0), t1 = rows.filter((r) => r.teams > 0).sort((a, b) => b.teams - a.teams || a.name.localeCompare(b.name))
  const a = panel(root, { title: 'Riders per country', tag: 'Brief d · E8', span: 7, sql: `SELECT rider_country_name, COUNT(*) AS riders FROM dim_rider GROUP BY 1 ORDER BY 2 DESC;`, note: 'By rider nationality. Counts all 184 starters. Bib 78 has no country in the source data, so it sits under Unknown.' })
  a.body.append(bar('riders', 'riders', r1, 0))
  const b = panel(root, { title: 'Teams per country', tag: 'Brief d · E8', span: 5, sql: `SELECT team_country_name, COUNT(*) AS teams FROM dim_team GROUP BY 1 ORDER BY 2 DESC;`, note: 'By the country a team is registered in, which can differ from where its riders come from.' })
  b.body.append(bar('teams', 'teams', t1, 1))
  const c = panel(root, { title: 'National outcomes', tag: 'E9', sql, note: 'Best GC rank, stage wins and podiums by rider nationality. Open a country for its riders, teams and the stages behind the tallies.' })
  c.body.append(table({ rows, onRow: (r) => open({ t: 'nation', id: r.code }), cols: [
    { k: 'code', l: 'Code', f: (v) => natLink(v) }, { k: 'name', l: 'Country' }, { k: 'riders', l: 'Riders', n: 1 }, { k: 'finishers', l: 'Finishers', n: 1 }, { k: 'teams', l: 'Teams', n: 1 },
    { k: 'best_gc', l: 'Best GC', n: 1 }, { k: 'wins', l: 'Wins', n: 1 }, { k: 'podiums', l: 'Podiums', n: 1 }] }))
}

export default { id: 'nations', label: 'Nations', render: pageNations }
