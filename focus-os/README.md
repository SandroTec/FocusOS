# FocusOS

FocusOS is a local-first personal productivity dashboard built with Angular standalone components, strict TypeScript, SCSS, Angular Router, Signals and LocalStorage.

## Run locally

Requirements: Node.js compatible with Angular 21 and npm.

Run npm install, then npm start and open http://localhost:4200. Create a production build with npm run build.

## MVP features

- Dashboard totals and week-over-week focus time are calculated from recorded sessions, workouts and habit check-ins.
- Focus timer supports start, pause, resume and save. Elapsed time is calculated from timestamps and survives route changes and refreshes.
- Focus sessions can be added manually, edited and deleted. Each entry includes a category, optional project, focus rating and notes.
- Habits can be created, edited, checked in by local calendar date, archived and restored.
- Sports entries include activity, duration, date, intensity and notes, with edit and delete actions.
- Projects include name, description, accent color and status. Sessions can be linked to projects; tracked time is calculated from those sessions.
- All records persist in browser LocalStorage under focusos.data.v1.

## Structure

- src/app/data.models.ts contains data interfaces and local-date/week helpers.
- src/app/focus-store.service.ts owns the shared Signals state, timer behavior and LocalStorage persistence.
- src/app/app.routes.ts maps the main sections to standalone pages.
- src/app/*-page.ts and matching HTML files contain each feature screen.
- src/styles.scss contains the shared design system and responsive dashboard styling.

## Known limitations

- Data stays in the current browser profile; there is no account, cloud sync, export/import, or cross-device backup.
- Demo-data mode is not included yet. New profiles begin with empty records.
- Insights are rule-based and depend on the data entered. There is no AI integration.
- The biometric design shown in the mock-up is represented by focus-time charts; no wearable device data is collected.
- Weekly targets currently use built-in defaults and cannot be edited in the UI.
