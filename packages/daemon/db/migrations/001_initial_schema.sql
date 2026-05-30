-- ========================================
-- TransferVault — Supabase Schema
-- ========================================

-- Profiles (extends auth.users)
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  is_admin BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own profile"
  ON public.profiles FOR SELECT
  USING ((SELECT auth.uid()) = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING ((SELECT auth.uid()) = id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.email));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ========================================
-- Transfers
-- ========================================
CREATE TABLE public.transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pair_code TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'uploading', 'ready', 'expired', 'deleted')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  download_count INTEGER DEFAULT 0,
  max_downloads INTEGER DEFAULT NULL,  -- NULL = unlimited
  password_hash TEXT,                  -- Argon2 hash, NULL = no password
  size_bytes BIGINT DEFAULT 0,
  file_count INTEGER DEFAULT 0,
  title TEXT,
  message TEXT,
  is_encrypted BOOLEAN DEFAULT FALSE,
  daemon_confirmed BOOLEAN DEFAULT FALSE  -- laptop confirmed files exist
);

ALTER TABLE public.transfers ENABLE ROW LEVEL SECURITY;

-- Anyone can look up a transfer by pair_code (needed for downloads)
CREATE POLICY "Anyone can read transfers by pair_code"
  ON public.transfers FOR SELECT
  USING (TRUE);

-- Only owner can update/delete
CREATE POLICY "Owner can update own transfers"
  ON public.transfers FOR UPDATE
  USING ((SELECT auth.uid()) = owner_id);

CREATE POLICY "Owner can delete own transfers"
  ON public.transfers FOR DELETE
  USING ((SELECT auth.uid()) = owner_id);

-- Service role inserts (daemon syncs via service key)
-- Anon/auth inserts handled by daemon API → service role
CREATE POLICY "Authenticated users can insert transfers"
  ON public.transfers FOR INSERT
  WITH CHECK (TRUE);  -- Daemon uses service role

CREATE INDEX IF NOT EXISTS idx_transfers_pair_code ON public.transfers (pair_code);
CREATE INDEX IF NOT EXISTS idx_transfers_owner ON public.transfers (owner_id);
CREATE INDEX IF NOT EXISTS idx_transfers_status ON public.transfers (status);
CREATE INDEX IF NOT EXISTS idx_transfers_expires ON public.transfers (expires_at);

-- ========================================
-- Files (metadata only)
-- ========================================
CREATE TABLE public.files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_id UUID NOT NULL REFERENCES public.transfers(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  size_bytes BIGINT NOT NULL,
  mime_type TEXT,
  checksum TEXT,           -- SHA-256
  storage_path TEXT,       -- Relative path on laptop
  sort_order INTEGER DEFAULT 0
);

ALTER TABLE public.files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read files for valid transfers"
  ON public.files FOR SELECT
  USING (TRUE);

CREATE POLICY "Service can insert files"
  ON public.files FOR INSERT
  WITH CHECK (TRUE);

CREATE INDEX IF NOT EXISTS idx_files_transfer ON public.files (transfer_id);

-- ========================================
-- Audit Logs
-- ========================================
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_id UUID REFERENCES public.transfers(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL
    CHECK (event_type IN (
      'upload_started', 'upload_completed', 'upload_failed',
      'download_started', 'download_completed', 'download_failed',
      'transfer_expired', 'transfer_deleted',
      'password_attempt_failed', 'pair_code_lookup_failed'
    )),
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb
);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Only admins can read audit logs
CREATE POLICY "Admins can read audit logs"
  ON public.audit_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = (SELECT auth.uid()) AND is_admin = TRUE
    )
  );

CREATE POLICY "Service can insert audit logs"
  ON public.audit_logs FOR INSERT
  WITH CHECK (TRUE);

CREATE INDEX IF NOT EXISTS idx_audit_transfer ON public.audit_logs (transfer_id);
CREATE INDEX IF NOT EXISTS idx_audit_event ON public.audit_logs (event_type);
CREATE INDEX IF NOT EXISTS idx_audit_created ON public.audit_logs (created_at);

-- ========================================
-- Sessions (active connections tracking)
-- ========================================
CREATE TABLE public.sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_id UUID REFERENCES public.transfers(id) ON DELETE CASCADE,
  client_id TEXT NOT NULL,
  session_type TEXT NOT NULL CHECK (session_type IN ('upload', 'download')),
  connected_at TIMESTAMPTZ DEFAULT NOW(),
  last_seen TIMESTAMPTZ DEFAULT NOW(),
  bytes_transferred BIGINT DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE
);

ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service can manage sessions"
  ON public.sessions
  USING (TRUE)
  WITH CHECK (TRUE);

CREATE INDEX IF NOT EXISTS idx_sessions_transfer ON public.sessions (transfer_id);
CREATE INDEX IF NOT EXISTS idx_sessions_active ON public.sessions (is_active);
