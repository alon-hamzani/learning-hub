# מסע הכפל שלי ☁️ — React + Google + Supabase + Admin

זהו **פרויקט React + TypeScript מקור מלא** המבוסס על המשחק הקודם. המשחק עצמו נשמר; התוספות הן שער התחברות, בסיס נתונים, מעקב תרגולים, ניהול הרשאות וממשק אדמין.

## מצב היישום

**נכתב בפועל בקוד:** Google OAuth באמצעות Supabase Auth; יצירת משתמש Pending; הגדרת Super Admin לפי כתובת Google מאומתת; RLS; פרופילי ילדים והתקדמות בענן; שאלות/ניסיונות/רמזים ב־Postgres; חישוב ציון /100 בצד בסיס הנתונים; בקשת אימייל חד־פעמית דרך Edge Function ו־Resend; אדמין עם ניהול סטטוסים, נתונים, סינון וייצוא CSV; Audit Log.

**לא בוצע:** יצירת חשבון Supabase, רישום OAuth ב־Google Cloud, קבלת API keys, קישור לדומיין, הפעלת Resend, פרסום ל־GitHub או בדיקת קצה־לקצה מול פרויקט Supabase אמיתי. יש לבצע את שלבי ההגדרה הבאים כדי להפעיל את המערכת.

**תכנון אבטחה חשוב:** אין בממשק מפתח `service_role`. רק המפתח הציבורי (publishable/anon) מגיע לדפדפן. גישת API של משתמשים ממתינים/מושעים נחסמת ב־RLS גם אם מנסים לפנות ישירות לבסיס הנתונים; לכל אחד מותר לראות סטטוס של עצמו בלבד. האדמין מוגדר במסד הנתונים, לא לפי כתובת אימייל שנשלחת מהדפדפן.

## א. יצירת פרויקט Supabase (פעם אחת)

1. פתח https://supabase.com/dashboard וצור חשבון ופרויקט חדש בתוכנית החינמית (בהתאם למגבלות המעודכנות של השירות).
2. בתוך הפרויקט פתח **SQL Editor → New query**.
3. העתק את כל קובץ `supabase/migrations/20261030_cloud.sql` והרץ אותו פעם אחת. אל תריץ שוב על פרויקט שכבר הוגדר ללא מיגרציה מסודרת (יש שם `create type`).
4. ב־**Project Settings → API Keys** מצא את Project URL ואת ה־**publishable key** (או Legacy `anon` key). **אל תעתיק את `service_role` ל־React, ל־GitHub secrets של Vite או לצ'אט.**
5. בפרויקט אמיתי אפשר ליצור `.env.local` (לא להעלות ל־GitHub) בעזרת `.env.example`:

   ```env
   VITE_SUPABASE_URL=https://PROJECT_ID.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_XXXX
   ```

## ב. התחברות Google

1. פתח https://console.cloud.google.com ופתח פרויקט.
2. בתפריט **Google Auth Platform** הגדר Branding, Audience (External אם המשתמשים מחוץ לארגון) ו־Data Access: `openid`, `email`, `profile`. בעת בדיקות עם מצב Testing הוסף את המשתמשים הרצויים כ־Test Users.
3. ב־**Clients → Create client → Web application** צור OAuth Client.
4. בשדה **Authorized redirect URIs**, הכנס **בדיוק**: `https://PROJECT_ID.supabase.co/auth/v1/callback` (אותו Project ID מהפרויקט שלך).
5. העתק את `Client ID` ו־`Client secret` אל **Supabase Dashboard → Authentication → Providers → Google** והפעל את הספק.
6. כבה התחברות Email/Password אם ברצונך להשתמש רק ב־Google. חשבון האדמין יאושר אוטומטית רק כשנוצר באמצעות Google עם כתובת האימייל המוגדרת ב־SQL.
7. ב־**Authentication → URL Configuration**, הגדר Site URL ו־Redirect URLs. למשל אם מפרסמים ב־GitHub Pages:

   `https://YOUR_GITHUB_USERNAME.github.io/multiplication-quest/`

   אם ב־Netlify: `https://YOUR_SITE.netlify.app/`. הוסף גם `http://localhost:5173/**` עבור פיתוח מקומי.
8. ודא שכתובת האדמין `alon.hamzani@gmail.com` מופיעה במפורש ב־SQL ובפונקציית `admin-action`. אין צורך להעביר אותה ללקוח כהרשאת Admin.

**אם האדמין לא קיבל הרשאת Super Admin לאחר Google ראשון:** בדוק קודם שקיימת זהות Google מאומתת ב־`auth.identities` ושהאימייל נכון. ניתן לתקן **אך ורק באמצעות SQL Editor כאדמין של Supabase**:

```sql
update public.app_users u
set role='super_admin', status='approved', approved_at=now()
where lower(u.email)='alon.hamzani@gmail.com'
  and exists(select 1 from auth.identities i
    where i.user_id=u.id and i.provider='google');
```

## ג. התראת אימייל עם Resend

1. פתח https://resend.com וצור חשבון.
2. הכן כתובת שולח מאומתת לפי הדרישות של Resend (למשל `notify@YOUR_DOMAIN`). אפשר לבדוק במסלול ניסוי, אך שליחת אימייל לכתובות חיצוניות מחייבת הגדרות שולח מתאימות.
3. צור מפתח API ב־Resend. **זהו סוד שרת, לא משתנה `VITE_` ולא חלק מהקוד הגלוי.**
4. ב־Supabase Dashboard → **Edge Functions → Secrets** הגדר:

   - `RESEND_API_KEY` = המפתח הסודי שלך
   - `EMAIL_FROM` = כתובת השולח המאומתת

5. פרסם שתי Edge Functions משתי התיקיות:

   - `supabase/functions/notify-approval/index.ts` בשם `notify-approval`
   - `supabase/functions/admin-action/index.ts` בשם `admin-action`

   אפשר ליצור אותן דרך Supabase Dashboard → Edge Functions, להעתיק את קוד הקובץ המתאים ולפרסם; לחלופין באמצעות Supabase CLI לאחר ההתחברות לפרויקט:

   ```bash
   npx supabase login
   npx supabase link --project-ref PROJECT_ID
   npx supabase functions deploy notify-approval
   npx supabase functions deploy admin-action
   ```

6. השאר **Verify JWT** מופעל בפונקציות. שתי הפונקציות בודקות גם את המשתמש מול Supabase Auth. הפונקציה של ההתראות שולחת פעם אחת לכל בקשת הצטרפות חדשה (באמצעות unique constraint). שליחה כושלת תאפשר ניסיון חוזר.

**הערה:** המערכת תלויה ב־Resend. בלי הגדרת הספק אין משלוח אימייל אמיתי, אבל משתמשים עדיין יופיעו בהמתנה ב־Admin.

## ד. העלאה ל־GitHub + פרסום

1. פתח Repository חדש ב־GitHub והעלה את כל תוכן תיקיית הפרויקט הזו, **לא קובץ ה־ZIP עצמו**, כולל `.github/workflows/deploy.yml`.
2. בלשונית Repository **Settings → Secrets and variables → Actions**, צור שתי **Repository secrets**:
   - `VITE_SUPABASE_URL` — Project URL
   - `VITE_SUPABASE_PUBLISHABLE_KEY` — המפתח הציבורי בלבד
3. ב־**Settings → Pages → Build and deployment** בחר **GitHub Actions** (ולא Deploy from a branch). הפעולה `deploy.yml` תבנה Vite ותפרסם את `dist` אוטומטית עם כל push ל־`main`.
4. ב־**Actions** בדוק שה־Workflow הצליח; ב־Pages תראה את כתובת האתר.
5. עדכן את **Supabase Authentication → URL Configuration** עם כתובת Pages המדויקת לשימוש ב־Google redirect.

**Netlify**: חבר את ה־Repository ל־Netlify. Build command: `npm run build`; publish directory: `dist`. תחת Environment variables הגדר `VITE_SUPABASE_URL` ו־`VITE_SUPABASE_PUBLISHABLE_KEY` (ציבורי). עדכן Supabase Redirect URLs לכתובת Netlify.

## ה. הרצה במחשב

Node.js 22 ומעלה:

```bash
npm install
npm run dev
npm run build
```

## ו. בדיקות ידניות חובה לפני פתיחה לציבור

1. התחבר ב־Google עם המייל `alon.hamzani@gmail.com`. ודא שמופיע כפתור **ממשק ניהול** ושהמשחק נפתח.
2. התחבר בחלון גלישה פרטי עם **Google אחר**. ודא שמופיעה הודעת Pending ושהמשחק חסום.
3. בדוק מייל נכנס לאדמין פעם אחת בלבד (נסה להתחבר שוב ולוודא שאין כפילות).
4. בדוק ב־Back Office אישור משתמש והתחברות שלו לאחר האישור.
5. פתח פרופיל ילד, שחק תרגול 8 שאלות (כולל טעות ורמז), ודא הופעת Session, ניסיונות, ציון משוקלל וטעויות בדף המשתמש.
6. התנתק, התחבר במכשיר אחר עם **אותו Google** ובדוק שהילד והניקוד נטענים בענן.
7. בדוק השעיה בעת שהמשתמש מחובר (רענון / בדיקת API עצמאית) וחסימת גישה.
8. בדוק ניסיון משתמש רגיל לקרוא `app_users` של משתמש אחר, `student_profiles` של אחר, `game_sessions` של אחר, וגם ניסיון לעדכן `app_users.status` או `app_users.role` ישירות: כולם צריכים להיחסם.
9. בדוק ייצוא CSV ושמירת Audit Log לאחר אישור/השעיה.
10. בדוק מחיקת חשבון; ודא מחיקה קסקדית של פרופילים, סשנים ונסיונותיו.

## מגבלות שחשוב להכיר

- זהו **קוד אינטגרציה מוכן להגדרה ולבדיקה**, ולא שירות מחובר שכבר פעיל בחשבונות שלך.
- נתוני המשחק הקודם, שנשמרו ב־localStorage, **אינם מיובאים אוטומטית**. כדי לבצע הסבה מאובטחת נדרש כלי ייבוא נפרד ובחירת פרופיל יעד אחרי התחברות.
- בזמן משחק שינויים נשמרים בתור פעולות רציף בענן. במצב ללא רשת תופיע שגיאת שמירה; אין עדיין תור offline שמסנכרן אחרי ניתוק. מעבר בין מכשירים עובד לאחר טעינה מחדש, אבל אין מיזוג קונפליקטים אוטומטי כאשר שני מכשירים משנים אותו ילד במקביל.
- ציוני המשחק הקיימים מוצגים באמצעות הלוגיקה המקורית; PostgreSQL מחשב בנפרד **תוצאת /100 על בסיס רצף נסיונות ורמזים שנשלחו לשרת**. השרת מחשב נכונות מתמטית ולא מסתמך על boolean `correct` מהדפדפן. עדיין אין מערכת שאלות חתומות המונפקות מהשרת: משתמש מתוחכם יכול לייצר בקשות משלו ולזייף משחק אישי. ההפרדה וההרשאות בין משתמשים, לעומת זאת, נאכפות במסד הנתונים.
- לוחות הבקרה כוללים עד 1,000 רשומות בכל קטגוריה; יש להוסיף pagination למסד נתונים גדול. דוחות Mini Games שומרים אירועים ונתוני התקדמות, בעוד שברמת כל ניסיון שאלה נשמר פירוט מלא לתרגולי QuizScreen.
- `localStorage` של Supabase Auth מכיל session token (התנהגות סטנדרטית ל־SPA). שמור על מניעת XSS ותלות נקייה ועדכנית. למערכת רגישת מידע אפשר לשקול ארכיטקטורת BFF עם cookies מסוג HttpOnly.
- מאחר שמדובר בלימוד ילדים, **השתמש בחשבונות של הורים/מבוגרים**, הימנע מאיסוף תאריך לידה או פרטים עודפים, והכן הודעת פרטיות/מחיקה בהתאם לדינים הרלוונטיים לפני הפצה ציבורית.
- מחירי Free Tier, שיטות ההזדהות והתנאים עשויים להשתנות; בדוק בדפי השירות לפני הפעלה.
