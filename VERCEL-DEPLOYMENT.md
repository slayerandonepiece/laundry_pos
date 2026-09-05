# Deploy Express Laundry to Vercel

Verified against Vercel's official CLI documentation on 5 September 2026.

## 1. Open the project

```bash
cd /Users/reddygona/Documents/skills/express_laundry
```

## 2. Sign in (fixes “No existing credentials found”)

```bash
npx vercel login
```

Follow the terminal's browser authorization instructions. If the browser does not open, open the URL printed in the terminal. Complete sign-in with the Vercel account that should own the project and return to Terminal. Wait for confirmation.

Never put your account password or access token into vercel.json or share them in chat.

Verify the account:

```bash
npx vercel whoami
```

Do not proceed until this returns your intended account.

## 3. Check the build

```bash
npm run build
```

## 4. Create the first deployment

```bash
npx vercel
```

Prompt wording can vary. Choose:

- Set up and deploy this directory: Yes.
- Scope/team: the account or team that should own Express Laundry.
- Link to existing project: No if this is your first project; otherwise select the existing Express Laundry project.
- Project name: express-laundry.
- Code directory: ./ (the current folder containing package.json).
- Framework: Next.js if asked.
- Override detected settings: No.

The existing vercel.json specifies Next.js, npm ci and npm run build.
Leave output directory at the Next.js default. Do not set it to public or out.
No environment variables are required for this browser-only prototype.

Vercel's current documentation says the first deployment of a new project is production even without --prod. Treat this step as publishing: this is demo-only software, and review deployment protection before sharing it.
Wait for the deployment to finish, then open the deployment URL printed by the CLI.

## 5. Test the deployment

- Open / and check the public site.
- Open /admin/login and test the demo owner login.
- Check Dashboard, Products, Sales, Expenses, Employees and Profile.
- Test mobile layouts and opening an order.

This application is a prototype. Its authentication and role checks are client-side, and data lives in browser storage. It is not suitable for real customer records or secure production use.
Localhost data does not migrate to the deployed origin. Demo imports initialize separately there. Employee accounts and orders do not synchronize across devices.

## 6. Publish later updates

```bash
npx vercel --prod
```

This deploys to the project's production domain. Review deployment protection before sharing the URL.

For later manual updates, run the same command from this project after checking the build.

## Troubleshooting

- No credentials: rerun npx vercel login, then npx vercel whoami.
- Wrong account: npx vercel logout, then npx vercel login.
- Build failed: read the first build error in the deployment logs; signing in does not fix dependency or application build failures.
- Wrong project: use npx vercel link and select the intended project before deploying.
- The temporary-deployment option in the error is not needed for this account-owned deployment.

## Official references

- Login: https://vercel.com/docs/cli/login
- Deploy: https://vercel.com/docs/cli/deploy
- CLI: https://vercel.com/docs/cli
- Configuration: https://vercel.com/docs/project-configuration/vercel-json
