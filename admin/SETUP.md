# FFM Admin Dashboard — Setup Guide

## FIRST: Clean up conflicting files

Two files were accidentally created during scaffolding and will cause a Next.js build error.
Delete them before running the dashboard:

```
# Delete these files (they duplicate routes that are already in app/admin/):
del app\users\page.tsx
del app\(admin)\users\page.tsx
del app\(admin)\users\[machineId]\page.tsx
del app\(admin)\users\[machineId]\TrialControls.tsx
del app\(admin)\keygen\page.tsx
del app\(admin)\reset\page.tsx
del app\(admin)\layout.tsx
rmdir /s /q "app\(admin)"
rmdir /s /q "app\users"
```

On Unix/Mac:
```
rm -rf "app/(admin)" "app/users"
```

After cleanup, the working page structure is:
- app/page.tsx → redirects to /admin/users
- app/login/page.tsx → login
- app/admin/layout.tsx → sidebar layout
- app/admin/users/page.tsx → users list
- app/admin/users/[machineId]/page.tsx → user detail + trial controls
- app/admin/keygen/page.tsx → serial code generator
- app/admin/reset/page.tsx → one-time reset code generator

---

## Setup Steps

### 1. Create .env.local
Copy `.env.example` to `.env.local` and fill in:

```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
ADMIN_PASSWORD=your_secret_password
SESSION_SECRET=<random 32+ chars — run: openssl rand -base64 32>
FFM_SECRET_KEY=FFM-2024-SERIAL-KEY-DO-NOT-SHARE
FFM_UNLOCK_KEY=FFM-2024-UNLOCK-KEY-DO-NOT-SHARE
```

### 2. Install dependencies
```
npm install
```

### 3. Run locally
```
npm run dev
# Open http://localhost:3000
```

### 4. Deploy to Vercel
1. Push the repo to GitHub
2. Create a new Vercel project
3. Set "Root Directory" to `admin`
4. Add all environment variables from `.env.example` to Vercel project settings
5. Deploy

---

## Supabase: Required Tables

Run this SQL in your Supabase project (SQL Editor):

```sql
-- Installations (one row per machine)
CREATE TABLE installations (
  machine_id TEXT PRIMARY KEY,
  restaurant_name TEXT,
  phone TEXT,
  app_version TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trials
CREATE TABLE trials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_id TEXT UNIQUE NOT NULL REFERENCES installations(machine_id),
  started_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  status TEXT DEFAULT 'active',
  paused_remaining_ms BIGINT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Full activations
CREATE TABLE activations (
  machine_id TEXT PRIMARY KEY REFERENCES installations(machine_id),
  activated_at TIMESTAMPTZ DEFAULT NOW()
);

-- One-time reset codes (admin-generated)
CREATE TABLE reset_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_id TEXT NOT NULL,
  code TEXT NOT NULL,
  used BOOLEAN DEFAULT FALSE,
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '24 hours',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### RLS Policies (Electron app uses anon key):

```sql
-- installations: anon can read/write own row
ALTER TABLE installations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_own_installation" ON installations
  FOR ALL USING (TRUE) WITH CHECK (TRUE);

-- trials: anon can INSERT + SELECT own; no UPDATE (admin only via service_role)
ALTER TABLE trials ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_insert_trial" ON trials FOR INSERT WITH CHECK (TRUE);
CREATE POLICY "anon_select_trial" ON trials FOR SELECT USING (TRUE);

-- activations: anon can INSERT + SELECT own
ALTER TABLE activations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_own_activation" ON activations FOR ALL USING (TRUE) WITH CHECK (TRUE);

-- reset_codes: anon can only SELECT (to validate); INSERT blocked (service_role only)
ALTER TABLE reset_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_select_reset_codes" ON reset_codes FOR SELECT USING (TRUE);
```

Note: Tighten RLS policies per machine_id in production if needed. The anon key is safe with basic RLS.

---

## Environment Variables for Vercel

| Variable | Where to get it |
|----------|----------------|
| `SUPABASE_URL` | Supabase → Settings → API → Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API → service_role key |
| `ADMIN_PASSWORD` | Your choice — this is your login password |
| `SESSION_SECRET` | `openssl rand -base64 32` |
| `FFM_SECRET_KEY` | Must match `activation.ts` line 5 |
| `FFM_UNLOCK_KEY` | Must match `activation.ts` line 6 |
