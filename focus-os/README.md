# FocusOS

FocusOS is a personal productivity dashboard built with Angular standalone components, Signals, SCSS, and Supabase Auth/Postgres. Supabase is the source of truth for signed-in data; the browser copy is used only for the one-time import from the former local-only version.

## Configure Supabase

1. Create a Supabase project and enable email/password authentication with email confirmation.
2. Set the project URL and publishable key in `src/environments/environment.ts`. These values are visible in the browser by design; never put a `service_role` key in the frontend.
3. Run the migrations in timestamp order in the Supabase SQL Editor:
   - `supabase/migrations/202610230001_initial_schema.sql` creates the user-owned activity tables, Row Level Security policies, the automatic Sport habit trigger, and the atomic legacy import function.
   - `supabase/migrations/202610250001_versioned_goals.sql` creates goal definitions and their version history, applies Row Level Security, and migrates existing weekly targets.
   - `supabase/migrations/202610280001_independent_deep_work.sql` separates activity areas from Deep Work, backfills existing sessions and timers, and updates stored goal filters.
4. Add these Authentication redirect URLs, adjusting the local port if needed:
   - `http://localhost:4200/auth/callback`
   - `http://localhost:4200/reset-password`
   - `https://alessandro-bonomo.de/focus-os/auth/callback`
   - `https://alessandro-bonomo.de/focus-os/reset-password`
5. Configure custom SMTP before inviting users outside the Supabase organization. The built-in mail service is for testing and is restricted.

The project URL and publishable key are the only Supabase values needed by the browser application. RLS policies restrict every table to `auth.uid() = user_id`; do not disable RLS or expose a service-role key.

## Run and build

```sh
npm install
npm start
```

Build for the existing static hosting subfolder with:

```sh
npm run build -- --base-href /focus-os/
```

Email redirects are generated from the deployed document base URL, so local development and `/focus-os/` use the matching path.

## MVP features

- Email/password registration, email confirmation, sign-in, sign-out, and password reset.
- User-isolated focus sessions, projects, habits, habit check-ins, sport entries, goal definitions, and timer state.
- Goals for focus, sport, and habits. Progress and period history are evaluated from existing activity records; goal definitions are stored separately and do not create activity entries.
- Editing a goal schedules a version for the next period, keeping previous targets intact for historical evaluation. New goals can start in an earlier week or month to evaluate existing activity.
- A confirmation prompt imports existing LocalStorage data once into an empty account. The local snapshot is removed after the database transaction succeeds.
- The generated Sport habit is derived from workout entries and counts distinct workout days.
- Writes are online-only and shown as saved only after Supabase accepts them.

## Database maintenance

Schema changes belong in timestamped files under `supabase/migrations/`. For projects without automatic database backups, schedule regular logical exports using the Supabase CLI and store them separately from the application host.
