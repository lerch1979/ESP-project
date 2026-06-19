-- Expo push tokens, one row per device. A user may have several devices;
-- a token is globally unique and "moves" to whichever user last registered it
-- (handled by an upsert on expo_push_token in the controller). ON DELETE CASCADE
-- so deactivating a user drops their tokens. Dead tokens are pruned by the push
-- service when Expo returns DeviceNotRegistered.
CREATE TABLE IF NOT EXISTS user_push_tokens (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expo_push_token text NOT NULL UNIQUE,
  platform        varchar(16),
  device_name     text,
  last_used_at    timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_push_tokens_user ON user_push_tokens(user_id);
