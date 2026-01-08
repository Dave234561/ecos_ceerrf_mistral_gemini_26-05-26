-- Migration: Créer les tables manquantes
-- Date: 2025-11-28
-- Objectif: Créer student_progress_snapshots et session_summaries

-- 1. Table student_progress_snapshots (pour le monitoring temps réel enseignant)
CREATE TABLE IF NOT EXISTS public.student_progress_snapshots (
  id SERIAL PRIMARY KEY,
  session_id INTEGER NOT NULL,
  student_email VARCHAR(255) NOT NULL,
  scenario_id INTEGER REFERENCES public.ecos_scenarios(id),
  timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
  strengths JSONB DEFAULT '[]'::jsonb,
  weaknesses JSONB DEFAULT '[]'::jsonb,
  progress_indicators JSONB DEFAULT '{}'::jsonb,
  exchange_count INTEGER DEFAULT 0,
  status VARCHAR(50) DEFAULT 'in_progress',
  created_at TIMESTAMP DEFAULT NOW()
);

-- Index pour student_progress_snapshots
CREATE INDEX IF NOT EXISTS idx_progress_session_id ON public.student_progress_snapshots(session_id);
CREATE INDEX IF NOT EXISTS idx_progress_student_email ON public.student_progress_snapshots(student_email);
CREATE INDEX IF NOT EXISTS idx_progress_timestamp ON public.student_progress_snapshots(timestamp);
CREATE INDEX IF NOT EXISTS idx_progress_status ON public.student_progress_snapshots(status);

-- 2. Table session_summaries (pour l'analyse agrégée des sessions d'enseignement)
CREATE TABLE IF NOT EXISTS public.session_summaries (
  id SERIAL PRIMARY KEY,
  session_date DATE NOT NULL,
  teacher_email VARCHAR(255) NOT NULL,
  scenario_id INTEGER REFERENCES public.ecos_scenarios(id),
  total_students INTEGER DEFAULT 0,
  summary_data JSONB DEFAULT '{}'::jsonb,
  common_strengths JSONB DEFAULT '[]'::jsonb,
  common_weaknesses JSONB DEFAULT '[]'::jsonb,
  trends JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Index pour session_summaries
CREATE INDEX IF NOT EXISTS idx_summary_date ON public.session_summaries(session_date);
CREATE INDEX IF NOT EXISTS idx_summary_teacher ON public.session_summaries(teacher_email);
CREATE INDEX IF NOT EXISTS idx_summary_scenario ON public.session_summaries(scenario_id);

-- 3. Activer RLS sur les nouvelles tables
ALTER TABLE public.student_progress_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_summaries ENABLE ROW LEVEL SECURITY;

-- 4. Politiques RLS pour student_progress_snapshots
-- Les étudiants peuvent voir leurs propres snapshots
CREATE POLICY "Students can view own progress snapshots" ON public.student_progress_snapshots
  FOR SELECT
  USING (student_email = (auth.jwt() ->> 'email'));

-- Les enseignants peuvent voir tous les snapshots
CREATE POLICY "Teachers can view all progress snapshots" ON public.student_progress_snapshots
  FOR SELECT
  USING (public.is_teacher_or_admin());

-- Le système peut créer des snapshots
CREATE POLICY "System can create progress snapshots" ON public.student_progress_snapshots
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- 5. Politiques RLS pour session_summaries
-- Les enseignants peuvent voir leurs propres summaries
CREATE POLICY "Teachers can view own summaries" ON public.session_summaries
  FOR SELECT
  USING (teacher_email = (auth.jwt() ->> 'email') OR public.is_teacher_or_admin());

-- Les enseignants peuvent créer leurs summaries
CREATE POLICY "Teachers can create summaries" ON public.session_summaries
  FOR INSERT
  WITH CHECK (teacher_email = (auth.jwt() ->> 'email') OR public.is_teacher_or_admin());

-- Les enseignants peuvent mettre à jour leurs summaries
CREATE POLICY "Teachers can update own summaries" ON public.session_summaries
  FOR UPDATE
  USING (teacher_email = (auth.jwt() ->> 'email') OR public.is_teacher_or_admin());
