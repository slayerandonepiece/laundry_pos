# Express Laundry store workspace

Frontend prototype built with Next.js App Router, React and TypeScript.
The public website is maintained separately in `../vendor_websites/express-laundry`.

```bash
npm install
npm run dev
```

Open `http://localhost:3000/`: signed-out users go to `/login`; signed-in owners
see the dashboard. Employees land at `/admin/sales`. Old `/admin/login` and
`/admin/dashboard` URLs redirect to the canonical routes.

Data currently lives in browser storage. Login and role guards are frontend demo
behavior, not production authentication. No application database/API backend is
implemented yet.

## Project and agent documentation

- [Shared agent guidance](.agents/README.md)
- [Implemented frontend and architecture](.agents/CURRENT-STATE.md)
- [Backend implementation plan within Next.js](.agents/BACKEND-PLAN.md)

Codex/GPT uses `AGENTS.md`; Claude and Gemini have `CLAUDE.md` and `GEMINI.md`
entry files referencing the same guidance. Tools that do not load repository
instructions automatically should be directed to `AGENTS.md` explicitly.

Components render UI; containers own state and behavior. For code changes run
`npm run lint` and `npx tsc --noEmit`; see the agent guidance for behavioral checks. 
