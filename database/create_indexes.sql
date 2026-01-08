-- ============================================================================
-- ECOS Platform - Performance Optimization Indexes
-- ============================================================================
-- This script creates indexes on critical columns to optimize query performance
-- Execute this in Supabase SQL Editor: https://supabase.com/dashboard/project/yfhvqbdcfvgzfpfxcmvw/sql
-- ============================================================================

-- ============================================================================
-- SESSIONS TABLE INDEXES (Highest Priority)
-- ============================================================================
-- These indexes optimize student session queries which are the most frequent

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

-- Index on training_session_id: Links sessions to training sessions
CREATE INDEX IF NOT EXISTS idx_sessions_training_session_id 
ON sessions(training_session_id);

-- Composite index: Optimizes queries filtering by student AND status
CREATE INDEX IF NOT EXISTS idx_sessions_student_status 
ON sessions(student_email, status);

-- ============================================================================
-- ECOS_EVALUATIONS TABLE INDEXES
-- ============================================================================
-- Optimizes evaluation report queries

-- Index on session_id: Critical for retrieving evaluation reports
CREATE INDEX IF NOT EXISTS idx_evaluations_session_id 
ON ecos_evaluations(session_id);

-- ============================================================================
-- ECOS_MESSAGES TABLE INDEXES
-- ============================================================================
-- Optimizes chat message queries

-- Index on session_id: Critical for loading chat history
CREATE INDEX IF NOT EXISTS idx_messages_session_id 
ON ecos_messages(session_id);

-- ============================================================================
-- USERS TABLE INDEXES
-- ============================================================================
-- Optimizes authentication and user lookups

-- Index on email: Used in every authentication query
CREATE INDEX IF NOT EXISTS idx_users_email 
ON users(email);

-- Index on role: Used for role-based access control
CREATE INDEX IF NOT EXISTS idx_users_role 
ON users(role);

-- ============================================================================
-- TRAINING_SESSION_STUDENTS TABLE INDEXES
-- ============================================================================
-- Optimizes training session student queries

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
-- Optimizes training session scenario queries

-- Index on training_session_id: Lists scenarios in a training session
CREATE INDEX IF NOT EXISTS idx_training_scenarios_session_id 
ON training_session_scenarios(training_session_id);

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
-- You should see 16 indexes created:
-- - 6 indexes on sessions
-- - 1 index on ecos_evaluations
-- - 1 index on ecos_messages
-- - 2 indexes on users
-- - 4 indexes on training_session_students
-- - 1 index on training_session_scenarios
-- - 1 composite index on sessions (student_email, status)
-- - 1 composite index on training_session_students (training_session_id, status)
-- ============================================================================
