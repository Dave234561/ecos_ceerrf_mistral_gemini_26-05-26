-- ============================================================================
-- ECOS Platform - Performance Optimization Indexes (FINAL - VERIFIED)
-- ============================================================================
-- Based on actual database schema
-- Execute this in Supabase SQL Editor
-- ============================================================================

-- ============================================================================
-- SESSIONS TABLE INDEXES (Highest Priority)
-- ============================================================================

-- Index on student_email: Used in almost every student query
CREATE INDEX IF NOT EXISTS idx_sessions_student_email 
ON sessions(student_email);

-- Index on session_id: Critical for session lookups
CREATE INDEX IF NOT EXISTS idx_sessions_session_id 
ON sessions(session_id);

-- Index on status: Used for filtering active/completed sessions
CREATE INDEX IF NOT EXISTS idx_sessions_status 
ON sessions(status);

-- Index on scenario_id: Used for scenario-specific queries
CREATE INDEX IF NOT EXISTS idx_sessions_scenario_id 
ON sessions(scenario_id);

-- Composite index: Optimizes queries filtering by student AND status
CREATE INDEX IF NOT EXISTS idx_sessions_student_status 
ON sessions(student_email, status);

-- ============================================================================
-- EVALUATIONS TABLE INDEXES
-- ============================================================================

-- Index on session_id: Critical for retrieving evaluation reports
CREATE INDEX IF NOT EXISTS idx_evaluations_session_id 
ON evaluations(session_id);

-- ============================================================================
-- EXCHANGES TABLE INDEXES (Chat messages)
-- ============================================================================

-- Index on session_id: Critical for loading chat history
CREATE INDEX IF NOT EXISTS idx_exchanges_session_id 
ON exchanges(session_id);

-- Index on email: Used for user-specific queries
CREATE INDEX IF NOT EXISTS idx_exchanges_email 
ON exchanges(utilisateur_email);

-- ============================================================================
-- USERS TABLE INDEXES
-- ============================================================================

-- Index on email: Used in every authentication query
CREATE INDEX IF NOT EXISTS idx_users_email 
ON users(email);

-- ============================================================================
-- USER_ROLES TABLE INDEXES
-- ============================================================================

-- Index on user_id: Used for role-based access control
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id 
ON user_roles(user_id);

-- Index on role: Used for filtering by role
CREATE INDEX IF NOT EXISTS idx_user_roles_role 
ON user_roles(role);

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
-- STUDENT_PROGRESS_SNAPSHOTS TABLE INDEXES (Performance Critical)
-- ============================================================================

-- Index on session_id: Critical for realtime progress tracking
CREATE INDEX IF NOT EXISTS idx_progress_snapshots_session_id 
ON student_progress_snapshots(session_id);

-- Index on timestamp: Used for ordering and filtering recent snapshots
CREATE INDEX IF NOT EXISTS idx_progress_snapshots_timestamp 
ON student_progress_snapshots(timestamp);

-- Index on student_email: Used for student-specific progress queries
CREATE INDEX IF NOT EXISTS idx_progress_snapshots_student_email 
ON student_progress_snapshots(student_email);

-- Composite index: Optimizes queries for latest snapshot per session
CREATE INDEX IF NOT EXISTS idx_progress_snapshots_session_timestamp 
ON student_progress_snapshots(session_id, timestamp DESC);

-- ============================================================================
-- SCENARIOS TABLE INDEXES
-- ============================================================================

-- Index on created_by: Used for filtering scenarios by creator
CREATE INDEX IF NOT EXISTS idx_scenarios_created_by 
ON scenarios(created_by);

-- ============================================================================
-- TRAINING_SESSIONS TABLE INDEXES
-- ============================================================================

-- Index on teacher_email: Lists sessions created by a teacher
CREATE INDEX IF NOT EXISTS idx_training_sessions_teacher_email 
ON training_sessions(teacher_email);

-- Index on status: Filters active/completed training sessions
CREATE INDEX IF NOT EXISTS idx_training_sessions_status 
ON training_sessions(status);

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
-- You should see 24 indexes created:
-- - 5 indexes on sessions
-- - 1 index on evaluations
-- - 2 indexes on exchanges
-- - 1 index on users
-- - 2 indexes on user_roles
-- - 4 indexes on training_session_students
-- - 4 indexes on student_progress_snapshots
-- - 1 index on scenarios
-- - 2 indexes on training_sessions
-- - 2 composite indexes
-- ============================================================================
