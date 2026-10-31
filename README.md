# מרכז המשחקים והלמידה · Learning Hub v4

פרויקט React + TypeScript מבוסס Vite עם Supabase Auth, PostgreSQL, RLS, Google OAuth, שלושה מסכי Admin וקטלוג משחקים מוגבל-הרשאות. מסע הכפל כולל שיעורים ייחודיים, חמש צורות מענה, לוח אינטראקטיבי ושמונה משחקי בונוס. PIN הורי נבדק בשרת; תגמולים מאומתים בשרת ופעולות לא־מקוונות נשמרות בתור עמיד.

**למדריך הפעלה מפורט בעברית:** [README_HUB.md](README_HUB.md)

**להגדרה הראשונה של Google, Supabase ו־Resend:** [README_CLOUD.md](README_CLOUD.md)

## Quickstart

```sh
cp .env.example .env.local
npm install
npm run dev
```

## Database setup

Apply migrations once, in the following order (not alphabetically). For an existing project apply only migrations not already installed:

1. `20261030_cloud.sql`
2. `20261030_learning_hub.sql`
3. `20261030_audit_fixes.sql`
4. `20261030_server_privileges.sql`
5. `20261030_sync_safety.sql`
6. `20261030_admin_summary.sql`
7. `20261030_sync_conflict_response.sql`
8. `20261031_parent_pin.sql`
9. `20261031_learning_ledger.sql`
10. `20261031_learning_sync.sql`
11. `20261031_learning_order.sql`
12. `20261031_legacy_milestones.sql`

Deploy the matching Edge Functions as well as the frontend. The account owner chooses a four-digit PIN at first approved login; there is no email verification. Existing completed-stage bonuses are reserved by the legacy-milestones migration so they cannot be awarded twice.

`npm test` runs mathematical, PostgreSQL/pgcrypto, access-control, offline and Edge Function regression checks. The visual test pages in `tests/` use synthetic data and are excluded from the production Vite entry point.

הפרויקט לא כולל מפתחות גישה. ללא הגדרות אמיתיות לא תתאפשר התחברות או שמירה. GitHub Pages דורש Workflow מתיקיית `.github`, לא פרסום Vite מה־root.
