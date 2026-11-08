// Tour de France OLAP dashboard. Every number on the page comes from a SQL query
// that runs against the star schema in PGlite, so any panel can be reopened in the console.
// This file only wires the tabs together. Each team member's tab lives in its own file under modules/.
import { $, h, boot, loadLookups, live, hooks, q } from './core.js'
import gc from '../modules/gc.js'
import stages from '../modules/stages.js'
import teams from '../modules/teams.js'
import nations from '../modules/nations.js'
import explorer from './explorer.js'
import sqlConsole from './console.js'

// null draws a divider between the module pages and the tools.
const TABS = [gc, stages, teams, nations, null, explorer, sqlConsole]
const pages = new Map()
async function show(id) {
  const tab = TABS.find((t) => t?.id === id) ?? TABS[0]
  for (const b of $('#tabs').querySelectorAll('button')) b.setAttribute('aria-selected', String(b.dataset.id === tab.id))
  for (const [k, el] of pages) el.hidden = k !== tab.id
  if (!pages.has(tab.id)) {
    const el = h('div', { class: 'page', id: `page-${tab.id}` })
    pages.set(tab.id, el)
    $('#main').append(el)
    el.done = tab.render(el).catch((e) => { el.append(h('div', { class: 'err' }, `This page failed to load: ${e.message}`)); console.error(e) })
  }
  await pages.get(tab.id).done
  requestAnimationFrame(() => { for (const e of live) if (e.inst && e.el.clientWidth) e.inst.resize() })
}
$('#tabs').append(...TABS.map((t) => (t ? h('button', { role: 'tab', 'data-id': t.id, 'aria-selected': 'false', onclick: () => { location.hash = t.id; show(t.id) } }, t.label) : h('span', { class: 'sep' }))))
hooks.toConsole = (sql) => {
  location.hash = 'console'
  show('console').then(() => sqlConsole.setSql(sql))
}
try {
  await boot()
  await loadLookups()
  $('#boot').remove()
  addEventListener('hashchange', () => show(location.hash.slice(1)))
  await show(location.hash.slice(1) || 'gc')
} catch (e) {
  console.error(e)
  $('#bootmsg').textContent = `The database did not start: ${e.message}. Reload the page to try again.`
}
window.tdf = { q }
