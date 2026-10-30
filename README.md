# מרכז המשחקים והלמידה · Learning Hub v3

פרויקט React + TypeScript מבוסס Vite עם Supabase Auth, PostgreSQL, RLS, Google OAuth, שלושה מסכי Admin וקטלוג משחקים מוגבל-הרשאות. המשחק הראשון (״מסע הכפל שלי״) נשמר ללא שינוי.

**למדריך הפעלה מפורט בעברית:** [README_HUB.md](README_HUB.md)

**להגדרה הראשונה של Google, Supabase ו־Resend:** [README_CLOUD.md](README_CLOUD.md)

## Quickstart

```sh
cp .env.example .env.local
npm install
npm run dev
```

SQL: הרץ תחילה את המיגרציה המקורית `20261030_cloud.sql` ואחר כך `20261030_learning_hub.sql` בפרויקט חדש. בפרויקט שכבר משתמש ב־Cloud v2 הרץ *רק* את השנייה, לאחר גיבוי.

הפרויקט לא כולל מפתחות גישה. ללא הגדרות אמיתיות לא תתאפשר התחברות או שמירה. GitHub Pages דורש Workflow מתיקיית `.github`, לא פרסום Vite מה־root.
