-- ============================================================================
-- ECOS Platform - Performance Optimization Indexes (CORRECTED)
-- ============================================================================
-- Execute this in Supabase SQL Editor
-- ============================================================================

-- ============================================================================
-- ECOS_SESSIONS TABLE INDEXES (Highest Priority)
-- ============================================================================

-- Index on student_email: Used in almost every student query
CREATE INDEX IF NOT EXISTS idx_ecos_sessions_student_email 
ON ecos_sessions(student_email);

-- Index on status: Used for filtering active/completed sessions
CREATE INDEX IF NOT EXISTS idx_ecos_sessions_status 
ON ecos_sessions(status);

-- Index on scenario_id: Used for scenario-specific queries
CREATE INDEX IF NOT EXISTS idx_ecos_sessions_scenario_id 
ON ecos_sessions(scenario_id);

-- Index on training_session_id: Links sessions to training sessions
CREATE INDEX IF NOT EXISTS idx_ecos_sessions_training_session_id 
ON ecos_sessions(training_session_id);

-- Composite index: Optimizes queries filtering by student AND status
CREATE INDEX IF NOT EXISTS idx_ecos_sessions_student_status 
ON ecos_sessions(student_email, status);

-- ============================================================================
-- ECOS_EVALUATIONS TABLE INDEXES
-- ============================================================================

-- Index on session_id: Critical for retrieving evaluation reports
CREATE INDEX IF NOT EXISTS idx_ecos_evaluations_session_id 
ON ecos_evaluations(session_id);

-- ============================================================================
-- ECOS_MESSAGES TABLE INDEXES
-- ============================================================================

-- Index on session_id: Critical for loading chat history
CREATE INDEX IF NOT EXISTS idx_ecos_messages_session_id 
ON ecos_messages(session_id);

-- ============================================================================
-- USERS TABLE INDEXES
-- ============================================================================

-- Index on email: Used in every authentication query
CREATE INDEX IF NOT EXISTS idx_users_email 
ON users(email);

-- Index on role: Used for role-based access control
CREATE INDEX IF NOT EXISTS idx_users_role 
ON users(role);

-- ============================================================================
-- TRAINING_SESSION_STUDENTS TABLE INDEXES
-- ============================================================================

-- Index on training_session_id: Lists students in a training session
CREATE INDEX IF NOT EXISTS idx_training_students_session_id 
ON training_session_students(training_session_id);

-- Index on student_email: Lists training sessions for a student
CREATE INDEX IF NOT EXISTS idx_training_students_email 
ON training_session_students(student_email);

-- Index on status: Filters students by assignment status
CREATE INDEX IF NOT EXISTS idx_training_students_status 
ON training_session_students(status);

-- Composite index: Optimizes queries filtering by session AND status
CREATE INDEX IF NOT EXISTS idx_training_students_session_status 
ON training_session_students(training_session_id, status);

-- ============================================================================
-- TRAINING_SESSION_SCENARIOS TABLE INDEXES
-- ============================================================================

-- Index on training_session_id: Lists scenarios in a training session
CREATE INDEX IF NOT EXISTS idx_training_scenarios_session_id 
ON training_session_scenarios(training_session_id);

-- ============================================================================
-- REALTIME_PROGRESS_SNAPSHOTS TABLE INDEXES (Performance Critical)
-- ============================================================================

-- Index on session_id: Critical for realtime progress tracking
CREATE INDEX IF NOT EXISTS idx_realtime_snapshots_session_id 
ON realtime_progress_snapshots(session_id);

-- Index on timestamp: Used for ordering and filtering recent snapshots
CREATE INDEX IF NOT EXISTS idx_realtime_snapshots_timestamp 
ON realtime_progress_snapshots(timestamp);

-- Composite index: Optimizes queries for latest snapshot per session
CREATE INDEX IF NOT EXISTS idx_realtime_snapshots_session_timestamp 
ON realtime_progress_snapshots(session_id, timestamp DESC);

-- ============================================================================
-- VERIFICATION QUERY
-- ============================================================================
-- Run this to verify all indexes were created successfully

SELECT 
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE schemaname = 'public'
    AND indexname LIKE 'idx_%'
ORDER BY tablename, indexname;

-- ============================================================================
-- EXPECTED RESULTS
-- ============================================================================
-- You should see 18 indexes created:
-- - 5 indexes on ecos_sessions
-- - 1 index on ecos_evaluations
-- - 1 index on ecos_messages
-- - 2 indexes on users
-- - 4 indexes on training_session_students
-- - 1 index on training_session_scenarios
-- - 3 indexes on realtime_progress_snapshots
-- - 1 composite index on ecos_sessions (student_email, status)
-- - 1 composite index on training_session_students (training_session_id, status)
-- - 1 composite index on realtime_progress_snapshots (session_id, timestamp)
-- ============================================================================
