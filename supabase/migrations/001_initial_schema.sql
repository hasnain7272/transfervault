-- ========================================
-- TransferVault — Supabase Schema
-- Migration: 001_initial_schema
-- ========================================

-- ----------------------------------------
-- Profiles (extends auth.users)
-- ----------------------------------------
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

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ----------------------------------------
-- Transfers
-- ----------------------------------------
CREATE TABLE public.transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pair_code TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'uploading', 'ready', 'expired', 'deleted')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  download_count INTEGER DEFAULT 0,
  max_downloads INTEGER DEFAULT NULL,
  password_hash TEXT,
  size_bytes BIGINT DEFAULT 0,
  file_count INTEGER DEFAULT 0,
  title TEXT,
  message TEXT,
  is_encrypted BOOLEAN DEFAULT FALSE,
  daemon_confirmed BOOLEAN DEFAULT FALSE
);

ALTER TABLE public.transfers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read transfers by pair_code"
  ON public.transfers FOR SELECT
  USING (TRUE);

CREATE POLICY "Owner can update own transfers"
  ON public.transfers FOR UPDATE
  USING ((SELECT auth.uid()) = owner_id);

CREATE POLICY "Owner can delete own transfers"
  ON public.transfers FOR DELETE
  USING ((SELECT auth.uid()) = owner_id);

CREATE POLICY "Authenticated users can insert transfers"
  ON public.transfers FOR INSERT
  WITH CHECK (TRUE);

CREATE INDEX idx_transfers_pair_code ON public.transfers (pair_code);
CREATE INDEX idx_transfers_owner ON public.transfers (owner_id);
CREATE INDEX idx_transfers_status ON public.transfers (status);
CREATE INDEX idx_transfers_expires ON public.transfers (expires_at);

-- ----------------------------------------
-- Files (metadata only — no file content)
-- ----------------------------------------
CREATE TABLE public.files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_id UUID NOT NULL REFERENCES public.transfers(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  size_bytes BIGINT NOT NULL,
  mime_type TEXT,
  checksum TEXT,
  storage_path TEXT,
  sort_order INTEGER DEFAULT 0
);

ALTER TABLE public.files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read files for valid transfers"
  ON public.files FOR SELECT
  USING (TRUE);

CREATE POLICY "Service can insert files"
  ON public.files FOR INSERT
  WITH CHECK (TRUE);

CREATE INDEX idx_files_transfer ON public.files (transfer_id);

-- ----------------------------------------
-- Audit Logs
-- ----------------------------------------
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
  metadata JSONB DEFAULT '{}'
);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

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

CREATE INDEX idx_audit_transfer ON public.audit_logs (transfer_id);
CREATE INDEX idx_audit_event ON public.audit_logs (event_type);
CREATE INDEX idx_audit_created ON public.audit_logs (created_at);

-- ----------------------------------------
-- Sessions (active connections tracking)
-- ----------------------------------------
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

CREATE INDEX idx_sessions_transfer ON public.sessions (transfer_id);
CREATE INDEX idx_sessions_active ON public.sessions (is_active);

-- ----------------------------------------
-- Daemon Status (heartbeat tracking)
-- ----------------------------------------
CREATE TABLE public.daemon_status (
  id TEXT PRIMARY KEY DEFAULT 'main',
  is_online BOOLEAN DEFAULT FALSE,
  last_heartbeat TIMESTAMPTZ DEFAULT NOW(),
  disk_total_bytes BIGINT DEFAULT 0,
  disk_free_bytes BIGINT DEFAULT 0,
  active_uploads INTEGER DEFAULT 0,
  active_downloads INTEGER DEFAULT 0,
  version TEXT
);

ALTER TABLE public.daemon_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read daemon status"
  ON public.daemon_status FOR SELECT
  USING (TRUE);

CREATE POLICY "Service can manage daemon status"
  ON public.daemon_status FOR ALL
  USING (TRUE)
  WITH CHECK (TRUE);

-- Seed the single daemon status row
INSERT INTO public.daemon_status (id, is_online) VALUES ('main', FALSE);
