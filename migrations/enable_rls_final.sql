-- Migration: Activer Row Level Security (RLS) - Version finale
-- Date: 2025-11-28
-- Objectif: Sécuriser l'accès aux données sensibles

-- 1. Activer RLS sur toutes les tables critiques
ALTER TABLE public.training_session_students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exchanges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ecos_evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ecos_scenarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ecos_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ecos_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ecos_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_session_scenarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_session_participants ENABLE ROW LEVEL SECURITY;

-- 2. Fonction helper pour vérifier si l'utilisateur est enseignant/admin
CREATE OR REPLACE FUNCTION public.is_teacher_or_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()::text AND role IN ('teacher', 'admin')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Politiques pour user_roles
CREATE POLICY "Users can view own role" ON public.user_roles
  FOR SELECT
  USING (auth.uid()::text = user_id);

CREATE POLICY "Admins can manage all roles" ON public.user_roles
  FOR ALL
  USING (public.is_teacher_or_admin());

-- 4. Politiques pour ecos_scenarios
CREATE POLICY "Authenticated users can view scenarios" ON public.ecos_scenarios
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Teachers can manage scenarios" ON public.ecos_scenarios
  FOR ALL
  USING (public.is_teacher_or_admin());

-- 5. Politiques pour ecos_sessions
CREATE POLICY "Students can view own sessions" ON public.ecos_sessions
  FOR SELECT
  USING (student_email = (auth.jwt() ->> 'email') OR public.is_teacher_or_admin());

CREATE POLICY "Students can create own sessions" ON public.ecos_sessions
  FOR INSERT
  WITH CHECK (student_email = (auth.jwt() ->> 'email'));

CREATE POLICY "Students can update own sessions" ON public.ecos_sessions
  FOR UPDATE
  USING (student_email = (auth.jwt() ->> 'email') OR public.is_teacher_or_admin());

-- 6. Politiques pour ecos_evaluations
CREATE POLICY "View evaluations" ON public.ecos_evaluations
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.ecos_sessions
      WHERE ecos_sessions.id = ecos_evaluations.session_id
      AND (ecos_sessions.student_email = (auth.jwt() ->> 'email') OR public.is_teacher_or_admin())
    )
  );

CREATE POLICY "System can create evaluations" ON public.ecos_evaluations
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- 7. Politiques pour ecos_messages
CREATE POLICY "View messages" ON public.ecos_messages
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.ecos_sessions
      WHERE ecos_sessions.id = ecos_messages.session_id
      AND (ecos_sessions.student_email = (auth.jwt() ->> 'email') OR public.is_teacher_or_admin())
    )
  );

CREATE POLICY "Create messages in own sessions" ON public.ecos_messages
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.ecos_sessions
      WHERE ecos_sessions.id = ecos_messages.session_id
      AND ecos_sessions.student_email = (auth.jwt() ->> 'email')
    )
  );

-- 8. Politiques pour ecos_reports
CREATE POLICY "View reports" ON public.ecos_reports
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.ecos_sessions
      WHERE ecos_sessions.id = ecos_reports.session_id
      AND (ecos_sessions.student_email = (auth.jwt() ->> 'email') OR public.is_teacher_or_admin())
    )
  );

CREATE POLICY "System can create reports" ON public.ecos_reports
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- 9. Politiques pour training_sessions
CREATE POLICY "Teachers manage training sessions" ON public.training_sessions
  FOR ALL
  USING (public.is_teacher_or_admin());

CREATE POLICY "Students view assigned training sessions" ON public.training_sessions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.training_session_students
      WHERE training_session_students.training_session_id = training_sessions.id
      AND training_session_students.student_email = (auth.jwt() ->> 'email')
    )
  );

-- 10. Politiques pour training_session_students
CREATE POLICY "Teachers manage participants" ON public.training_session_students
  FOR ALL
  USING (public.is_teacher_or_admin());

CREATE POLICY "Students view own assignments" ON public.training_session_students
  FOR SELECT
  USING (student_email = (auth.jwt() ->> 'email'));

-- 11. Politiques pour training_session_scenarios
CREATE POLICY "Teachers manage session scenarios" ON public.training_session_scenarios
  FOR ALL
  USING (public.is_teacher_or_admin());

CREATE POLICY "Students view assigned scenarios" ON public.training_session_scenarios
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.training_session_students
      WHERE training_session_students.training_session_id = training_session_scenarios.training_session_id
      AND training_session_students.student_email = (auth.jwt() ->> 'email')
    )
  );

-- 12. Politiques pour exchanges (utilisateur_email est le nom de la colonne)
CREATE POLICY "View own exchanges" ON public.exchanges
  FOR SELECT
  USING (utilisateur_email = (auth.jwt() ->> 'email') OR public.is_teacher_or_admin());

CREATE POLICY "Create own exchanges" ON public.exchanges
  FOR INSERT
  WITH CHECK (utilisateur_email = (auth.jwt() ->> 'email'));

-- 13. Politiques pour daily_counters (utilisateur_email est le nom de la colonne)
CREATE POLICY "Authenticated users view counters" ON public.daily_counters
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "System manage counters" ON public.daily_counters
  FOR ALL
  USING (auth.uid() IS NOT NULL);

-- 14. Politiques pour sessions
CREATE POLICY "Users manage own sessions" ON public.sessions
  FOR ALL
  USING (true); -- Sessions d'authentification, accès permissif

-- 15. Politiques pour training_session_participants (doublon temporaire)
CREATE POLICY "Teachers manage participants_v2" ON public.training_session_participants
  FOR ALL
  USING (public.is_teacher_or_admin());

CREATE POLICY "Students view own assignments_v2" ON public.training_session_participants
  FOR SELECT
  USING (student_email = (auth.jwt() ->> 'email'));
