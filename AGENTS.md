# Rules for AI assistants editing this dashboard

This repository is a static web page edited by four people. Each person edits only their own file in `modules/`, so changes merge without conflicts. Follow these rules exactly.

## Git workflow

Everyone works on `main`. Run the git commands for the user; many of them are new to Git.

1. Before editing: `git pull`.
2. Edit and test (see below).
3. Show the user the change: run `git diff modules/<file>.js` and explain in plain words what each part does. Wait until the user says yes. If they want changes, go back to step 2.
4. Commit only the user's own module file: `git add modules/<file>.js`, then `git commit -m "<module>: <what changed>"`.
5. `git pull --rebase`, then `git push`.

Never force push, never commit other files, and never resolve a conflict in a file the user does not own. If a pull or push fails, stop and explain the message to the user.

Do not add any AI attribution to commits, comments or files: no `Co-Authored-By` lines, no "Generated with" notes, no tool names. Commit messages contain only the module and the change.

## Which file you may edit

Ask the user which module they own, then edit only that file.

| Module | File | Suggested functions |
|---|---|---|
| GC and Young rider | `modules/gc.js` | E1, E4 (young), E7, E10, brief b and c |
| Stages and terrain | `modules/stages.js` | E2, E4 (mountain proxy), E5, E6, E11, E15 |
| Teams | `modules/teams.js` | E3, E12, E13, E14 |
| Nations | `modules/nations.js` | E8, E9 |

Do not edit anything else: `index.html`, `shared/`, `data/`, `lib/`. The integrator owns them. If you need a new shared helper, write a local function inside your own module file instead. If you need a style that does not exist, use an inline `style` attribute.

Each module file also owns one dossier in the side drawer: `gc.js` the rider dossier, `stages.js` the stage dossier, `teams.js` the team dossier, `nations.js` the nation dossier.

## How to run and test

The page must be served over HTTP; opening `index.html` directly will not work.

- Mac: double-click `start-mac.command`, or run `python3 -m http.server 8765` in this folder.
- Windows: double-click `start-windows.bat`, or run `python -m http.server 8765` in this folder.
- Open http://localhost:8765 and click your tab. Reload after every change.
- Check the browser console for errors and confirm the numbers below still hold.

## The database

PostgreSQL 18 (PGlite) runs in the browser from a fixed snapshot (`data/tdf-db.b64.txt`; the same database as plain SQL is `data/full-database.sql`). You cannot add tables or views. Put any extra logic in your query, for example as a CTE. All times are in seconds.

Star schema, one fact row per rider per stage (3,602 rows):

- `fact_results`: rider_key, stage_key, team_key, country_key, finish_time, time_bonus, time_penalty, adjusted_time, stage_rank, gap_to_winner, speed_kmh, is_win, is_podium, is_top10
- `dim_rider`: rider_key, bib_number, rider_name, dob, age_at_start, age_band, young_at_start, young_born_2000, team_name, rider_country_code, rider_country_name, race_status ('Finished' or 'Exited'), exit_stage, exit_reason
- `dim_stage`: stage_key, stage_id (1 to 21), stage_date, race_week, stage_type, terrain ('Flat', 'Hilly', 'Mountain', 'ITT'), distance_km, start_location, start_country, finish_location, finish_country, route, coefficient, winner_points
- `dim_team`: team_key, team_name, team_country_code, team_country_name
- `dim_country`: country_key, country_code, country_name (bib 78 maps to 'UNK')

Views:

- `v_gc`: final GC for the 160 finishers. gc_rank, gap, total_adjusted, total_finish, total_bonus, total_penalty, wins, podiums, top10s, young_at_start, young_born_2000
- `v_gc_progress`: rider_key, stage_id, cum_adjusted, gc_rank, gap_to_leader after every stage
- `v_mountain_proxy`: rider_key, mountain_time, mountain_rank
- `v_finish_points`: rider_key, finish_points, stage_wins, points_rank
- `v_team_classification`: team_key, team_time, team_rank

The normalized Task 2 tables (Country, Team, Rider, Location, Stage, Result, RiderExit, Classification) and the rule tables `ref_stage_coefficient` and `ref_points_scale` are also loaded.

## Rule priority

1. P0: the assignment brief (`BT5110 Project Tour de France 2026`).
2. P1: the 2025 race regulations. The French text is binding (Article 31).
3. P2: if neither settles a question, do not decide it yourself. Stop and ask the user, who takes it to the group.

## Definitions you must keep

- GC: lowest cumulative adjusted time (P0). Only riders who finished all 21 stages count (P1, Article 24 a).
- Adjusted time = finish_time − time_bonus + time_penalty (P0; P1, Articles 24 a, 25 and 26). Bonuses are 10, 6 and 4 seconds for the first three on road stages.
- Best Team: lowest aggregate time of a team's three fastest riders (P0), counted on every stage (P1, Article 24 e). Use finish_time without bonuses, which are individual.
- Young rider: under 26 on 5 July 2025, the first race day (P0: the suggested functions, E4, anchor the age filter at race start), column `young_at_start`. `young_born_2000` is the regulations' rule (P1, Article 24 d), shown only as a comparison.
- Points classification: P0 asks for it but gives no rule, so it uses the official stage-finish scale (P1, Articles 22 and 24 b). The data has no intermediate sprints, so always label it "Points classification (stage finishes only)" or keep a note saying so, and never present it as the official green jersey. Pogacar leads it here; Milan won the official classification.
- King of the Mountains: P0 asks for it, but P1 needs climb results, which the data does not have. Use the mountain proxy from the suggested functions (E4), adjusted time on Mountain stages, labelled "Mountain proxy". Never call it the polka-dot jersey.
- Bib 78 (Vlasov) has no nationality in the data. It is NULL in the Task 2 table, which the schema allows, and shows as Unknown in the star schema (P2, decided by the group).

## Check numbers

These match the published 2025 results. If your change alters one, your query is wrong:

- 184 starters, 160 finishers
- GC: Pogacar first, Vingegaard +4'24", Lipowitz +11'00"
- Team classification: Visma | Lease a Bike first, 232h01'32"
- 38 French riders; 27 nationalities (26 in the data plus Vlasov's)

These come from our own rules and differ from or have no published equivalent:

- Young rider top three: Lipowitz, Onley, Johannessen; 50 eligible finishers. The published standings use the regulations' birth-date rule, which gives Vauquelin third.
- Points from stage finishes: Pogacar 287, Vingegaard 182, Milan 160.

Do not compare total times with published results. On stage 21 the official times were taken early because of rain, so our totals are about one hour longer. Ranks and gaps are unaffected.

## How to write a panel

Copy an existing panel in your file and change it. The pattern:

```js
const sql = `SELECT ... ;`
const p = panel(root, { title: 'Title', tag: 'E3', span: 6, sql, note: 'One or two plain sentences on how to read it.' })
p.body.append(table({ rows: await q(sql), cols: [riderCol(), { k: 'wins', l: 'Wins', n: 1 }] }))
```

- `panel` options: `title`, `tag` (the E number), `span` (columns out of 12; omit for full width), `sql` (needed for the Open SQL button), `note`.
- `table` columns: `k` is the field, `l` the header, `n: 1` right-aligns numbers, `f` formats a cell. Use `riderCol()`, `teamCol()`, `natLink(code)`, `stageLink(id)` so clicks open the drawer.
- `chart((t) => option, { height, onClick })` wraps an ECharts option. Take colours from `t.s[0]` to `t.s[7]` and the text colours on `t`, and start from `...baseOpt(t)` and `...axisStyle(t)`.
- Never write a colour code or font name in your file. All colours and fonts come from the theme in `shared/style.css`, which the integrator will change at the end. Hard-coded values would not follow that change, or dark mode.
- Format times with `fmtTime`, gaps with `fmtGap`, numbers with `fmtNum`.
- `open({ t: 'rider' | 'team' | 'stage' | 'nation', id })` opens the drawer. Rider, team and stage use their keys; nation uses the country code.

Keep the page text in English and short. Every number shown must come from a query.
