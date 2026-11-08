# Tour de France 2025 dashboard (BT5110 Group 20)

## Open it

- Mac: double-click `start-mac.command`. If macOS blocks it, right-click it, choose Open, then Open again.
- Windows: double-click `start-windows.bat`.
- Your browser opens http://localhost:8765. Keep the black window open while you use the dashboard, and close it when you are done.
- Both need Python. If neither works, ask your AI assistant: "start a static web server in this folder on port 8765".

Double-clicking `index.html` does not work; the page has to come from the small local server.

## Who edits what

| Module | Your file |
|---|---|
| GC and Young rider | `pages/gc.js` |
| Stages and terrain | `pages/stages.js` |
| Teams | `pages/teams.js` |
| Nations | `pages/nations.js` |

Edit only your own file. Everything else belongs to the integrator. Send them a message if you need a change there.

## First time only

1. Accept the GitHub invitation in your email.
2. Get a copy of the project on your computer. Either install GitHub Desktop and use File > Clone repository, or ask your AI: "clone <repository URL> into my Documents folder".

## How to make a change with your AI

1. Open the project folder in your AI coding tool and tell it: "read AGENTS.md first". That file holds the rules, the data, the code patterns and the Git steps.
2. Ask it to get the latest version first: "pull the latest changes".
3. Tell it which module you own and what you want, for example: "I own Teams. Add a chart of top-ten finishes per team by race week."
4. Reload the browser page and check your tab. Check your numbers against the CSVs in `BT5110_Task3_data_v2` or in the SQL console tab.
5. Ask it to save and upload: "commit and push my change". It first shows you what changed and waits for your yes, then commits only your file.

Every change is kept in the history on GitHub, so a mistake can always be undone. If the AI reports a conflict or an error while pushing, stop and send the message to the integrator.

## Where the numbers come from

The data and rules are the same as `BT5110_Task3_data_v2`: 2025 dates, the young rider rule from the 2025 regulations (born on or after 1 January 2000), and stage-finish points on the official scale. The data has no intermediate sprints or climb points, so the dashboard shows finish points and a mountain time proxy, not the official green and polka-dot jerseys.
