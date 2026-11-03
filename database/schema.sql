CREATE TABLE IF NOT EXISTS app_state (
  id smallint PRIMARY KEY CHECK (id = 1),
  data jsonb NOT NULL,
  revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS auth_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text NOT NULL,
  password_hash text NOT NULL,
  role text NOT NULL CHECK (role IN ('admin', 'client')),
  client_id text UNIQUE,
  failed_login_count integer NOT NULL DEFAULT 0 CHECK (failed_login_count >= 0),
  locked_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((role = 'admin' AND client_id IS NULL) OR (role = 'client' AND client_id IS NOT NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS auth_users_username_lower_unique
  ON auth_users (lower(username));
