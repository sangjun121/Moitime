# Supabase setup

## 1. Create the database

1. Create a Supabase project.
2. Open **SQL Editor**.
3. Run the complete contents of `supabase/schema.sql`.

The SQL creates the meetings, participants, credentials, and responses tables, enables RLS, creates the password-checking RPC functions, and adds the response tables to Realtime.

## 2. Configure local development

Create `.env.local` from `.env.example` and fill in values from the Supabase project settings:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
VITE_GOOGLE_CLIENT_ID=your-google-web-client-id
```

The legacy `VITE_SUPABASE_ANON_KEY` name is also accepted, but do not use a `service_role` key in this frontend app.

## 3. Configure GitHub Pages

In **GitHub repository Settings > Secrets and variables > Actions > Variables**, add:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_GOOGLE_CLIENT_ID`

The Pages workflow injects these values only during `npm run build`. Do not commit `.env.local`.

## 4. Verify

```bash
npm run build
npm run dev
```

New meeting links use `#board?id=<uuid>`. Older query-based prototype links remain available as a local fallback and do not use Supabase.
