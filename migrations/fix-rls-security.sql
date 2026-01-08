-- ============================================================================
-- CORRECTION CRITIQUE : Politiques RLS Sécurisées
-- ============================================================================
--
-- PROBLÈME IDENTIFIÉ :
-- Les politiques RLS actuelles utilisent USING (true) qui permet à N'IMPORTE
-- QUI (même non authentifié) d'accéder aux données sensibles des étudiants.
--
-- SOLUTION :
-- Cette migration corrige les politiques pour implémenter une sécurité robuste
-- basée sur les relations enseignant-étudiant via training_sessions.
--
-- ============================================================================

-- Étape 1 : Supprimer les politiques dangereuses existantes
DROP POLICY IF EXISTS "Teachers can view all progress snapshots" ON student_progress_snapshots;
DROP POLICY IF EXISTS "System can insert progress snapshots" ON student_progress_snapshots;
DROP POLICY IF EXISTS "System can update progress snapshots" ON student_progress_snapshots;
DROP POLICY IF EXISTS "Teachers can view their summaries" ON session_summaries;
DROP POLICY IF EXISTS "System can insert session summaries" ON session_summaries;
DROP POLICY IF EXISTS "System can update session summaries" ON session_summaries;

-- ============================================================================
-- APPROCHE DE SÉCURITÉ
-- ============================================================================
--
-- Le projet utilise Firebase Auth (pas Supabase Auth), donc auth.uid() et
-- auth.email() ne fonctionnent pas dans les politiques RLS.
--
-- ARCHITECTURE ACTUELLE :
-- - Frontend : Utilise anon key Supabase (pour Realtime potentiellement)
-- - Backend : Utilise service_role key (bypass RLS automatiquement)
--
-- DÉCISION DE SÉCURITÉ :
-- Option 1 (IMPLÉMENTÉE) : Bloquer tout accès direct depuis le frontend
-- - Le backend avec service_role fait toutes les opérations
-- - Le frontend ne peut PAS accéder directement aux tables
-- - Realtime nécessitera Supabase Auth (non implémenté pour l'instant)
--
-- Option 2 (À IMPLÉMENTER SI BESOIN) : Migrer vers Supabase Auth
-- - Implémenter Supabase Auth en complément de Firebase
-- - Utiliser auth.email() dans les politiques
-- - Activer Realtime sécurisé
--
-- ============================================================================

-- ============================================================================
-- OPTION 1 : Bloquer Tout Accès Direct (SÉCURISÉ)
-- ============================================================================

-- Politique 1 : AUCUN accès SELECT via anon key
-- Seul le service_role (backend) peut lire
CREATE POLICY "block_anon_select_snapshots"
  ON student_progress_snapshots
  FOR SELECT
  USING (false);  -- Bloque tout accès SELECT

-- Politique 2 : AUCUN accès INSERT via anon key
CREATE POLICY "block_anon_insert_snapshots"
  ON student_progress_snapshots
  FOR INSERT
  WITH CHECK (false);  -- Bloque tout INSERT

-- Politique 3 : AUCUN accès UPDATE via anon key
CREATE POLICY "block_anon_update_snapshots"
  ON student_progress_snapshots
  FOR UPDATE
  USING (false);  -- Bloque tout UPDATE

-- Politique 4 : AUCUN accès DELETE via anon key
CREATE POLICY "block_anon_delete_snapshots"
  ON student_progress_snapshots
  FOR DELETE
  USING (false);  -- Bloque tout DELETE

-- Politiques similaires pour session_summaries
CREATE POLICY "block_anon_select_summaries"
  ON session_summaries
  FOR SELECT
  USING (false);

CREATE POLICY "block_anon_insert_summaries"
  ON session_summaries
  FOR INSERT
  WITH CHECK (false);

CREATE POLICY "block_anon_update_summaries"
  ON session_summaries
  FOR UPDATE
  USING (false);

CREATE POLICY "block_anon_delete_summaries"
  ON session_summaries
  FOR DELETE
  USING (false);

-- ============================================================================
-- OPTION 2 (COMMENTÉE) : Politiques Sécurisées avec Supabase Auth
-- ============================================================================
--
-- Si vous migrez vers Supabase Auth, décommentez ces politiques :
--
-- -- Fonction helper pour vérifier si un utilisateur est enseignant d'un étudiant
-- CREATE OR REPLACE FUNCTION is_teacher_of_student(p_student_email TEXT)
-- RETURNS BOOLEAN AS $$
-- BEGIN
--   RETURN EXISTS (
--     SELECT 1
--     FROM training_sessions ts
--     JOIN training_session_students tss ON tss.training_session_id = ts.id
--     WHERE ts.created_by = auth.email()
--       AND tss.student_email = p_student_email
--   );
-- END;
-- $$ LANGUAGE plpgsql SECURITY DEFINER;
--
-- -- Politique : Enseignants voient snapshots de LEURS étudiants uniquement
-- CREATE POLICY "teachers_view_own_students_snapshots"
--   ON student_progress_snapshots
--   FOR SELECT
--   USING (
--     auth.email() IS NOT NULL  -- Utilisateur authentifié
--     AND is_teacher_of_student(student_email)
--   );
--
-- -- Politique : Backend service peut insérer (pour le système)
-- CREATE POLICY "service_can_insert_snapshots"
--   ON student_progress_snapshots
--   FOR INSERT
--   WITH CHECK (
--     auth.jwt()->>'role' = 'service_role'  -- Seulement le backend
--   );
--
-- -- Politique similaire pour UPDATE
-- CREATE POLICY "service_can_update_snapshots"
--   ON student_progress_snapshots
--   FOR UPDATE
--   USING (
--     auth.jwt()->>'role' = 'service_role'
--   );
--
-- -- Politique : Enseignants voient LEURS synthèses uniquement
-- CREATE POLICY "teachers_view_own_summaries"
--   ON session_summaries
--   FOR SELECT
--   USING (
--     auth.email() IS NOT NULL
--     AND teacher_email = auth.email()
--   );
--
-- -- Politique : Service peut gérer les synthèses
-- CREATE POLICY "service_can_manage_summaries"
--   ON session_summaries
--   FOR ALL
--   USING (
--     auth.jwt()->>'role' = 'service_role'
--   );

-- ============================================================================
-- VÉRIFICATION POST-MIGRATION
-- ============================================================================

-- Test 1 : Vérifier que RLS est activé
DO $$
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE relname = 'student_progress_snapshots') THEN
    RAISE EXCEPTION 'RLS not enabled on student_progress_snapshots!';
  END IF;

  IF NOT (SELECT relrowsecurity FROM pg_class WHERE relname = 'session_summaries') THEN
    RAISE EXCEPTION 'RLS not enabled on session_summaries!';
  END IF;

  RAISE NOTICE '✅ RLS is enabled on both tables';
END $$;

-- Test 2 : Lister toutes les politiques actives
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename IN ('student_progress_snapshots', 'session_summaries')
ORDER BY tablename, policyname;

-- ============================================================================
-- DOCUMENTATION
-- ============================================================================

COMMENT ON POLICY "block_anon_select_snapshots" ON student_progress_snapshots IS
'Bloque tout accès SELECT via anon key. Seul le backend avec service_role peut lire.';

COMMENT ON POLICY "block_anon_insert_snapshots" ON student_progress_snapshots IS
'Bloque tout accès INSERT via anon key. Seul le backend avec service_role peut insérer.';

COMMENT ON POLICY "block_anon_update_snapshots" ON student_progress_snapshots IS
'Bloque tout accès UPDATE via anon key. Seul le backend avec service_role peut mettre à jour.';

COMMENT ON POLICY "block_anon_delete_snapshots" ON student_progress_snapshots IS
'Bloque tout accès DELETE via anon key. Seul le backend avec service_role peut supprimer.';

-- ============================================================================
-- AVERTISSEMENT IMPORTANT
-- ============================================================================
--
-- ⚠️  AVEC CETTE CONFIGURATION :
--
-- ✅ SÉCURISÉ : Aucun accès direct aux données sensibles depuis le frontend
-- ✅ BACKEND : Le service_role bypass automatiquement RLS (comme prévu)
-- ❌ REALTIME : Supabase Realtime NE FONCTIONNERA PAS avec anon key
--
-- POUR ACTIVER REALTIME DE MANIÈRE SÉCURISÉE :
-- 1. Implémenter Supabase Auth (en plus de Firebase Auth)
-- 2. Utiliser les politiques de l'Option 2 (commentées ci-dessus)
-- 3. Configurer le frontend pour s'authentifier avec Supabase
-- 4. Tester rigoureusement les permissions
--
-- ALTERNATIVE (ACTUELLE) :
-- - Utiliser polling HTTP via le backend (déjà implémenté)
-- - Plus sécurisé car passe par les routes Express avec validation
-- - Pas de connexion WebSocket directe à la base de données
--
-- ============================================================================
