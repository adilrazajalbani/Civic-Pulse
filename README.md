# CivicPulse

A Pakistan-focused civic complaint platform with a local backend and optional shared live mode:

- **Local service desk:** Express API and SQLite persist complaints, status history, evidence, priority rules, and administrator sessions.
- **Shared live mode:** Supabase Auth, Postgres, Realtime, and Storage can back a shared deployment.

Residents can enter a province or territory, any city, town, or village, an optional district or tehsil, and a neighborhood, village, sector, or union council. Common places are suggested, but the fields accept smaller settlements too. GPS is optional; residents should include a nearby landmark because the app does not reverse-geocode coordinates into street addresses. The examples include reports from all four provinces, Islamabad Capital Territory, Gilgit-Baltistan, and Azad Jammu and Kashmir.

## Free-tier caveat

Supabase's Free plan currently includes a 500 MB database and 1 GB file storage, but free projects may pause after one week of inactivity. Vercel Hobby is for personal, non-commercial projects. These are useful for a demo or early pilot, not a municipal production service with availability guarantees. Check provider terms and current quotas before launch.

## Run locally

From the project directory, install dependencies and start the complete local service:

```powershell
npm install
npm start
```

Open <http://localhost:3000>. The SQLite database is created at `data/civicpulse.db`.

The local demo administrator is `admin@civicpulse.local` / `admin123`. Override these defaults before startup with the `ADMIN_EMAIL`, `ADMIN_PASSWORD`, and `ADMIN_NAME` environment variables. Change the password before sharing the service or deploying it anywhere reachable by other people. Use the **Administrator access** option to open the operations console; only signed-in administrators can change statuses, assign departments, add resolution evidence, or edit priority rules.

Residents can submit and track reports without signing in. Store the report reference shown after submission to look up progress later.

## Enable shared live mode

1. Create a Supabase project on the Free plan.
2. In Supabase **SQL Editor**, run `supabase/schema.sql`. Optionally run `supabase/seed.sql` to add four example reports.
3. In Supabase **Project Settings > API**, copy the Project URL and the **publishable/anon** key into `config.js`:

   ```js
   window.CIVICPULSE_CONFIG = {
     supabaseUrl: 'https://YOUR_PROJECT.supabase.co',
     supabaseAnonKey: 'YOUR_PUBLISHABLE_OR_ANON_KEY'
   };
   ```

   This browser key is public by design. Never use a `service_role` or secret key in `config.js`.
4. In Supabase **Authentication > Users**, create an administrator account with email and password.
5. In the SQL Editor, assign that account the admin role (replace the email):

   ```sql
   update auth.users
   set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
       || '{"civicpulse_admin": true}'::jsonb
   where email = 'admin@example.com';
   ```

6. Deploy the project folder to Vercel. For a Git-based deployment, commit `config.js` with only the public URL and publishable/anon key; database policies in `schema.sql` restrict privileged changes. Alternatively, set the values in a build-time configuration step before deployment.
7. Open the deployed site, use the profile menu's **Admin sign in**, and sign in with the administrator account. Residents can submit and track reports without signing in.

For a quick deploy, install the Vercel CLI, run `vercel`, and follow its prompts. A free `vercel.app` URL is sufficient; a custom domain costs extra.

## Data and permissions

- Reports and priority rules are shared in Postgres. Changes appear in other open dashboards through Supabase Realtime.
- Residents can read reports, create reports, and upload report photos. Only accounts marked `civicpulse_admin` can change report status, departments, resolution details, priority rules, or upload resolution photos.
- Evidence is public so complaint details can be transparently tracked. Do not submit personal, medical, or sensitive information. Approximate locations are preferred.
- Before using this for a specific Pakistani city or authority, confirm local names, union-council boundaries, department ownership, emergency escalation routes, and the languages residents need. The included report locations are illustrative examples, not official municipal boundaries or service integrations. The MVP interface is currently English-first; Urdu and regional-language localization should be completed before a public rollout.
- Classification and duplicate matching remain heuristic and should be reviewed by staff. No municipal department integration is configured.

## Before a real public launch

Add abuse/rate controls for anonymous submissions, a privacy notice and retention policy, moderation and incident response, accessibility review, backups/monitoring, and an always-on paid or institution-approved hosting plan. The included free services can pause and have no production SLA.
