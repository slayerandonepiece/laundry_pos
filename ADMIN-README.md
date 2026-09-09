# Express Laundry admin — moved

This file described an early localStorage-only prototype (demo login,
browser-stored records). That prototype is gone: the admin app is now
server-backed by Postgres, with real per-store accounts and no demo
credentials — see [.agents/CURRENT-STATE.md](.agents/CURRENT-STATE.md) for
the current implementation, routes, and source map.

Admin source is still isolated in `src/features/admin` (route files in
`src/app/admin`), and admin CSS still extends the public-site fonts/theme
without replacing the website's own stylesheet.

`ADMIN-FIXES.md` remains a dated changelog of frontend fixes from before the
backend migration — read it as history, not current behavior.
