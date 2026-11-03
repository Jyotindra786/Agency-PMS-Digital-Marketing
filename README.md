# Agency PMS

Static front end hosted on Vercel, with a Vercel API that stores application data in Neon PostgreSQL.

## Production setup

1. Import this repository into Vercel, or deploy the local folder with the Vercel CLI if GitHub access is unavailable. `index.html` is the site entry point and `api/[...path].js` provides the same-origin API.
2. In Vercel project settings, add `DATABASE_URL` using the Neon pooled connection string for the `agency_pms` database and `agency_pms_app` role. Add a `SESSION_SECRET` with at least 32 random characters. Set both variables for Production (and Preview only if previews should access the production database). Vercel functions are configured for Singapore (`sin1`) to stay close to Neon. Keep these values server-side; never put them in browser JavaScript.
3. Bootstrap the schema and first admin from a trusted local machine:

   ```powershell
   npm install
   $env:DATABASE_URL = "your Neon connection string"
   $env:ADMIN_USERNAME = "your-admin-login"
   $env:ADMIN_PASSWORD = "a unique password of at least 12 characters"
   npm run db:bootstrap
   ```

   The bootstrap script is safe to rerun: it does not overwrite existing data or accounts. Clear the temporary `ADMIN_PASSWORD` from the shell after setup.
4. Deploy or redeploy the Vercel project. Sign in with the admin credentials, then add client accounts from the admin panel. Client data is filtered and write permissions are enforced by the API, not only by the UI.

For local development, create an ignored `.env` file using `.env.example`, set `DATABASE_URL`, `SESSION_SECRET`, and `ADMIN_USERNAME`, then start the app:

```powershell
npm run dev
```

Open `http://localhost:3000`. Do not use VS Code Live Server for this app; it serves static files without the `/api` backend. Do not deploy until the Production environment variables and bootstrap are complete.

## Data and authentication

The browser does not store application data or password hashes. Passwords are bcrypt-hashed on the server, sessions use HTTP-only same-site cookies, and application updates use optimistic revisions to detect concurrent edits. Client API responses are limited to that client's records, and client changes are checked against the account's permissions.

The original browser-only demo data is not automatically migrated. Export or copy any data that must be retained before switching to the Neon-backed app.
