-- Donate feature: config + sessions tables

CREATE TABLE donate_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enabled boolean NOT NULL DEFAULT true,
  receiver_type text NOT NULL DEFAULT 'phone',
  receiver_value text NOT NULL DEFAULT '',
  receiver_name text NOT NULL DEFAULT '',
  min_amount numeric(10,2) NOT NULL DEFAULT 1,
  max_amount numeric(10,2) NOT NULL DEFAULT 100000,
  preset_amounts jsonb NOT NULL DEFAULT '[20, 50, 100, 300, 500]'::jsonb,
  allow_open_amount boolean NOT NULL DEFAULT true,
  campaign_name_th text NOT NULL DEFAULT 'สนับสนุน MoodsWatch',
  campaign_name_en text NOT NULL DEFAULT 'Support MoodsWatch',
  thank_you_th text NOT NULL DEFAULT 'ขอบคุณมาก ๆ เลยนะคะ',
  thank_you_en text NOT NULL DEFAULT 'Thank you so much!',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Seed one default row (singleton config)
INSERT INTO donate_config (id)
VALUES ('00000000-0000-0000-0000-000000000099');

CREATE TABLE donate_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  amount numeric(10,2),
  mode text NOT NULL DEFAULT 'fixed',
  qr_payload text,
  status text NOT NULL DEFAULT 'qr_generated',
  reference_id text,
  donor_name text,
  donor_message text,
  source_page text,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '15 minutes'),
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX donate_sessions_status_idx ON donate_sessions (status);
CREATE INDEX donate_sessions_created_at_idx ON donate_sessions (created_at DESC);

-- RLS: donate_config readable by everyone, writable by admin only
ALTER TABLE donate_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "donate_config_read" ON donate_config
  FOR SELECT USING (true);

CREATE POLICY "donate_config_write_admin" ON donate_config
  FOR ALL USING (
    auth.uid() IN (
      SELECT id FROM auth.users
      WHERE raw_user_meta_data->>'role' IN ('admin', 'editor')
    )
  );

-- RLS: donate_sessions insertable by anyone, readable/updatable by admin
ALTER TABLE donate_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "donate_sessions_insert" ON donate_sessions
  FOR INSERT WITH CHECK (true);

CREATE POLICY "donate_sessions_read_own" ON donate_sessions
  FOR SELECT USING (true);

CREATE POLICY "donate_sessions_admin_update" ON donate_sessions
  FOR UPDATE USING (
    auth.uid() IN (
      SELECT id FROM auth.users
      WHERE raw_user_meta_data->>'role' IN ('admin', 'editor')
    )
  );

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_donate_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER donate_config_updated_at
  BEFORE UPDATE ON donate_config
  FOR EACH ROW EXECUTE FUNCTION update_donate_updated_at();

CREATE TRIGGER donate_sessions_updated_at
  BEFORE UPDATE ON donate_sessions
  FOR EACH ROW EXECUTE FUNCTION update_donate_updated_at();
