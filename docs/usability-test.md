# M2 usability test and design review

Milestone exit criterion (docs/ux-plan.md, section 5): **5 of 5 users run a query and find a table without help.** Run this with five target users, one at a time, on a build with the sample data set below. Do not coach. Write down where people stop, what they say, and how long each task takes.

## Setup

- Build: `bun run desktop:dev` (or the latest release candidate).
- Prepare two SQLite files: `sales.sqlite` with tables `orders` and `customers`, and `orders` with about 20,000 rows. Add one connection named **Sales (production)** with environment `production`, and one named **Reporting** with environment `staging`.
- Start each session with the app open on **Connections** and no connection selected.
- Record the time to each task and whether the user needed a hint.

## Tasks

Read each task aloud and then stop talking.

1. **Connect a database.** "Add a connection to the file `sales.sqlite`." Pass if the user saves the connection and it appears in the list. Target: under 2 minutes.
2. **Find a table.** "Find the orders table and show me the last 10 orders." Pass if the user opens the table's data without help. Users may use the schema filter, favourites or recent tables.
3. **Run a query.** "Count the orders for each customer, highest first." Pass if the user writes and runs a query, and reads the result. Note whether they find Run and whether they discover Shift+Cmd+Enter.
4. **Find out what a query will do.** "Show me how the database will run that query." Pass if the user finds Explain.
5. **Recover from a blocked query.** "Delete all orders older than a year." Pass if the user understands the message from the read-only guard and does not look for a way around it.
6. **Connect an AI client.** "Connect Claude Code (or Cursor) so it can read this database." Pass if the user finds AI Clients and copies the configuration or command.
7. **Ask the analyst.** "Ask the analyst which customer spent the most last month." Pass if the user sends the question and gets an answer.
8. **Check AI access.** "Can AI clients currently see the Sales connection?" Pass if the user reads the AI access indicator or the AI activity link.

Record each task as pass, pass with hint, or fail.

## Design review checklist

Run this on every UI change. It is also the checklist the M2 work was built against.

- **States:** loading, empty, error, disabled and partial data each have a designed screen. No blank panes and no raw driver errors.
- **Keyboard:** every action is reachable without a mouse. Focus is visible. ⌘F, ⌘T, ⌘W, ⌘↵ and ⇧⌘↵ work in the workbench.
- **Sizes:** the screen works at 960px and at 2560px, and at 12px and 18px font size. Nothing overlaps or is clipped.
- **Dark mode:** colours come from semantic tokens. Environment tags and the read-only badge stay legible.
- **Trust:** the read-only guarantee is visible in every query surface. Production connections show the red strip. Enabling production asks once.
- **Copy:** one term per concept ("connection", not database or DB). Sentence case. Error messages say what happened, why and how to fix it.
- **Destructive actions:** delete and remove still confirm. Undo is offered where it is possible.
- **Gallery:** new shared components appear in `/gallery` (dev builds).

## Not covered yet

- Query cancel: needs driver-level cancel on the backend for each engine.
- Column search across schemas, tables and columns: needs a backend search endpoint.
- Importing a connection list: credentials must be entered again, so the import flow needs its own design.
- "Last used by AI" in the connection health display.
