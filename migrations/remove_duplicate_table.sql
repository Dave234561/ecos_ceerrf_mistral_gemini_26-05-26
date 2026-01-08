-- Migration: Supprimer la table dupliquée training_session_participants
-- Date: 2025-11-28
-- Objectif: Résoudre l'incohérence entre training_session_students et training_session_participants

-- Les deux tables sont vides et ont la même structure
-- On garde training_session_students qui est définie dans le schéma Drizzle

-- 1. Supprimer les politiques RLS de training_session_participants
DROP POLICY IF EXISTS "Teachers manage participants_v2" ON public.training_session_participants;
DROP POLICY IF EXISTS "Students view own assignments_v2" ON public.training_session_participants;

-- 2. Supprimer la table dupliquée
DROP TABLE IF EXISTS public.training_session_participants;

-- Note: training_session_students reste la table officielle comme défini dans shared/schema.ts
