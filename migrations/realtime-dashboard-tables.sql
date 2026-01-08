-- Realtime Dashboard Migration
-- This migration adds support for teacher realtime monitoring and session summaries

-- Step 1: Create student_progress_snapshots table
-- Stores periodic snapshots of student progress during ECOS sessions
CREATE TABLE IF NOT EXISTS student_progress_snapshots (
  id SERIAL PRIMARY KEY,
  session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  student_email VARCHAR(255) NOT NULL,
  scenario_id INTEGER REFERENCES scenarios(id) ON DELETE SET NULL,
  timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
  strengths JSONB DEFAULT '[]'::jsonb,
  weaknesses JSONB DEFAULT '[]'::jsonb,
  progress_indicators JSONB DEFAULT '{}'::jsonb,
  exchange_count INTEGER DEFAULT 0,
  status VARCHAR(50) DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed')),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_progress_session_id ON student_progress_snapshots(session_id);
CREATE INDEX IF NOT EXISTS idx_progress_student_email ON student_progress_snapshots(student_email);
CREATE INDEX IF NOT EXISTS idx_progress_timestamp ON student_progress_snapshots(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_progress_status ON student_progress_snapshots(status);

-- Composite index for teacher queries (all active students)
CREATE INDEX IF NOT EXISTS idx_progress_status_timestamp ON student_progress_snapshots(status, timestamp DESC);

-- Step 2: Create session_summaries table
-- Stores aggregated summaries for teaching sessions
CREATE TABLE IF NOT EXISTS session_summaries (
  id SERIAL PRIMARY KEY,
  session_date DATE NOT NULL,
  teacher_email VARCHAR(255) NOT NULL,
  scenario_id INTEGER REFERENCES scenarios(id) ON DELETE SET NULL,
  total_students INTEGER DEFAULT 0,
  summary_data JSONB DEFAULT '{}'::jsonb,
  common_strengths JSONB DEFAULT '[]'::jsonb,
  common_weaknesses JSONB DEFAULT '[]'::jsonb,
  trends JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(session_date, teacher_email, scenario_id)
);

-- Create indexes for session summaries
CREATE INDEX IF NOT EXISTS idx_summary_date ON session_summaries(session_date DESC);
CREATE INDEX IF NOT EXISTS idx_summary_teacher ON session_summaries(teacher_email);
CREATE INDEX IF NOT EXISTS idx_summary_scenario ON session_summaries(scenario_id);

-- Step 3: Enable Realtime for student_progress_snapshots
-- Note: This must be run in Supabase Dashboard or via Supabase API
-- ALTER PUBLICATION supabase_realtime ADD TABLE student_progress_snapshots;

-- Step 4: Add RLS (Row Level Security) policies for teacher access
ALTER TABLE student_progress_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_summaries ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- POLITIQUES RLS SÉCURISÉES
-- ============================================================================
--
-- IMPORTANT : L'application utilise Firebase Auth (pas Supabase Auth)
-- Les politiques bloquent tout accès direct via anon key
-- Le backend utilise service_role qui bypass automatiquement RLS
--
-- Architecture de sécurité :
-- Frontend → Backend Express (Firebase Auth) → Supabase (service_role)
-- ============================================================================

-- Drop existing policies if they exist (for idempotency)
DROP POLICY IF EXISTS "Teachers can view all progress snapshots" ON student_progress_snapshots;
DROP POLICY IF EXISTS "System can insert progress snapshots" ON student_progress_snapshots;
DROP POLICY IF EXISTS "System can update progress snapshots" ON student_progress_snapshots;
DROP POLICY IF EXISTS "Teachers can view their summaries" ON session_summaries;
DROP POLICY IF EXISTS "System can insert session summaries" ON session_summaries;
DROP POLICY IF EXISTS "System can update session summaries" ON session_summaries;
DROP POLICY IF EXISTS "block_anon_select_snapshots" ON student_progress_snapshots;
DROP POLICY IF EXISTS "block_anon_insert_snapshots" ON student_progress_snapshots;
DROP POLICY IF EXISTS "block_anon_update_snapshots" ON student_progress_snapshots;
DROP POLICY IF EXISTS "block_anon_delete_snapshots" ON student_progress_snapshots;
DROP POLICY IF EXISTS "block_anon_select_summaries" ON session_summaries;
DROP POLICY IF EXISTS "block_anon_insert_summaries" ON session_summaries;
DROP POLICY IF EXISTS "block_anon_update_summaries" ON session_summaries;
DROP POLICY IF EXISTS "block_anon_delete_summaries" ON session_summaries;

-- ============================================================================
-- POLITIQUES SÉCURISÉES : Bloquer tout accès direct
-- ============================================================================

-- Politique 1 : AUCUN accès SELECT via anon key
CREATE POLICY "block_anon_select_snapshots"
  ON student_progress_snapshots
  FOR SELECT
  USING (false);  -- Bloque tout accès direct

-- Politique 2 : AUCUN accès INSERT via anon key
CREATE POLICY "block_anon_insert_snapshots"
  ON student_progress_snapshots
  FOR INSERT
  WITH CHECK (false);  -- Bloque tout INSERT direct

-- Politique 3 : AUCUN accès UPDATE via anon key
CREATE POLICY "block_anon_update_snapshots"
  ON student_progress_snapshots
  FOR UPDATE
  USING (false);  -- Bloque tout UPDATE direct

-- Politique 4 : AUCUN accès DELETE via anon key
CREATE POLICY "block_anon_delete_snapshots"
  ON student_progress_snapshots
  FOR DELETE
  USING (false);  -- Bloque tout DELETE direct

-- Politiques similaires pour session_summaries
CREATE POLICY "block_anon_select_summaries"
  ON session_summaries
  FOR SELECT
  USING (false);  -- Enseignants ne peuvent PAS lire directement

CREATE POLICY "block_anon_insert_summaries"
  ON session_summaries
  FOR INSERT
  WITH CHECK (false);  -- Bloque tout INSERT direct

CREATE POLICY "block_anon_update_summaries"
  ON session_summaries
  FOR UPDATE
  USING (false);  -- Bloque tout UPDATE direct

CREATE POLICY "block_anon_delete_summaries"
  ON session_summaries
  FOR DELETE
  USING (false);  -- Bloque tout DELETE direct

-- Step 5: Add comments for documentation
COMMENT ON TABLE student_progress_snapshots IS 'Stores periodic snapshots of student progress during ECOS sessions for realtime teacher monitoring';
COMMENT ON TABLE session_summaries IS 'Aggregated teaching session summaries with common patterns and trends';

COMMENT ON COLUMN student_progress_snapshots.strengths IS 'Array of identified strengths at this point in time';
COMMENT ON COLUMN student_progress_snapshots.weaknesses IS 'Array of identified weaknesses at this point in time';
COMMENT ON COLUMN student_progress_snapshots.progress_indicators IS 'Key-value pairs of progress metrics (e.g., engagement_score, question_quality)';
COMMENT ON COLUMN student_progress_snapshots.exchange_count IS 'Number of exchanges completed at snapshot time';

COMMENT ON COLUMN session_summaries.summary_data IS 'Overall session statistics and analysis';
COMMENT ON COLUMN session_summaries.common_strengths IS 'Frequently occurring strengths across all students';
COMMENT ON COLUMN session_summaries.common_weaknesses IS 'Frequently occurring weaknesses across all students';
COMMENT ON COLUMN session_summaries.trends IS 'Observed patterns and trends in student performance';

-- Verification queries (uncomment to verify)
-- SELECT 'student_progress_snapshots created' as status, COUNT(*) as count FROM student_progress_snapshots;
-- SELECT 'session_summaries created' as status, COUNT(*) as count FROM session_summaries;
