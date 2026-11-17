-- LTI 1.3 integration (LearnWorlds)
-- Stores the nonce of each accepted launch so that a launch cannot be replayed.

CREATE TABLE IF NOT EXISTS lti_nonces (
  nonce VARCHAR(64) PRIMARY KEY,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Only the backend (service role) accesses this table
ALTER TABLE lti_nonces ENABLE ROW LEVEL SECURITY;

-- Optional cleanup: a nonce is only useful for the lifetime of a launch (10 minutes)
-- DELETE FROM lti_nonces WHERE created_at < NOW() - INTERVAL '1 day';
