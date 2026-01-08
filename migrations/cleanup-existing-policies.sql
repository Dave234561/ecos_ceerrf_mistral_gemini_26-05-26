-- ============================================================================
-- NETTOYAGE : Supprimer Toutes les Politiques RLS Existantes
-- ============================================================================
--
-- OBJECTIF :
-- Ce script supprime TOUTES les politiques RLS existantes sur les tables
-- student_progress_snapshots et session_summaries pour permettre une
-- réapplication propre de la migration corrigée.
--
-- UTILISATION :
-- 1. Exécuter ce script AVANT d'appliquer realtime-dashboard-tables.sql
-- 2. Vérifier que toutes les politiques sont supprimées
-- 3. Ensuite appliquer realtime-dashboard-tables.sql
--
-- ============================================================================

-- ============================================================================
-- ÉTAPE 1 : Lister les Politiques Existantes (pour référence)
-- ============================================================================

DO $$
DECLARE
  policy_record RECORD;
BEGIN
  RAISE NOTICE '=== Politiques existantes avant nettoyage ===';

  FOR policy_record IN
    SELECT tablename, policyname
    FROM pg_policies
    WHERE tablename IN ('student_progress_snapshots', 'session_summaries')
    ORDER BY tablename, policyname
  LOOP
    RAISE NOTICE 'Table: %, Politique: %', policy_record.tablename, policy_record.policyname;
  END LOOP;
END $$;

-- ============================================================================
-- ÉTAPE 2 : Supprimer TOUTES les Politiques Anciennes (Dangereuses)
-- ============================================================================

-- Anciennes politiques sur student_progress_snapshots
DROP POLICY IF EXISTS "Teachers can view all progress snapshots" ON student_progress_snapshots;
DROP POLICY IF EXISTS "System can insert progress snapshots" ON student_progress_snapshots;
DROP POLICY IF EXISTS "System can update progress snapshots" ON student_progress_snapshots;

-- Anciennes politiques sur session_summaries
DROP POLICY IF EXISTS "Teachers can view their summaries" ON session_summaries;
DROP POLICY IF EXISTS "System can insert session summaries" ON session_summaries;
DROP POLICY IF EXISTS "System can update session summaries" ON session_summaries;

-- ============================================================================
-- ÉTAPE 3 : Supprimer TOUTES les Politiques Nouvelles (Sécurisées)
-- ============================================================================

-- Nouvelles politiques sur student_progress_snapshots
DROP POLICY IF EXISTS "block_anon_select_snapshots" ON student_progress_snapshots;
DROP POLICY IF EXISTS "block_anon_insert_snapshots" ON student_progress_snapshots;
DROP POLICY IF EXISTS "block_anon_update_snapshots" ON student_progress_snapshots;
DROP POLICY IF EXISTS "block_anon_delete_snapshots" ON student_progress_snapshots;

-- Nouvelles politiques sur session_summaries
DROP POLICY IF EXISTS "block_anon_select_summaries" ON session_summaries;
DROP POLICY IF EXISTS "block_anon_insert_summaries" ON session_summaries;
DROP POLICY IF EXISTS "block_anon_update_summaries" ON session_summaries;
DROP POLICY IF EXISTS "block_anon_delete_summaries" ON session_summaries;

-- ============================================================================
-- ÉTAPE 4 : Vérifier que TOUTES les Politiques sont Supprimées
-- ============================================================================

DO $$
DECLARE
  policy_count INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO policy_count
  FROM pg_policies
  WHERE tablename IN ('student_progress_snapshots', 'session_summaries');

  IF policy_count > 0 THEN
    RAISE NOTICE '⚠️  ATTENTION : Il reste % politique(s) sur les tables', policy_count;
    RAISE NOTICE 'Vérifiez les politiques restantes ci-dessous :';

    -- Lister les politiques restantes
    PERFORM pg_catalog.pg_advisory_unlock_all();
  ELSE
    RAISE NOTICE '✅ SUCCÈS : Toutes les politiques RLS ont été supprimées';
  END IF;
END $$;

-- Afficher les politiques restantes (si elles existent)
SELECT
  tablename,
  policyname,
  cmd AS command,
  qual AS using_expression
FROM pg_policies
WHERE tablename IN ('student_progress_snapshots', 'session_summaries')
ORDER BY tablename, policyname;

-- ============================================================================
-- ÉTAPE 5 : Vérifier que RLS est toujours ACTIVÉ sur les Tables
-- ============================================================================

DO $$
BEGIN
  -- Vérifier student_progress_snapshots
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE relname = 'student_progress_snapshots') THEN
    RAISE EXCEPTION '❌ RLS n''est PAS activé sur student_progress_snapshots!';
  END IF;

  -- Vérifier session_summaries
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE relname = 'session_summaries') THEN
    RAISE EXCEPTION '❌ RLS n''est PAS activé sur session_summaries!';
  END IF;

  RAISE NOTICE '✅ RLS est toujours activé sur les deux tables';
END $$;

-- ============================================================================
-- PROCHAINES ÉTAPES
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '=== PROCHAINES ÉTAPES ===';
  RAISE NOTICE '1. ✅ Vérifier que toutes les politiques ont été supprimées (ci-dessus)';
  RAISE NOTICE '2. ✅ Vérifier que RLS est toujours activé';
  RAISE NOTICE '3. ➡️  Appliquer migrations/realtime-dashboard-tables.sql';
  RAISE NOTICE '4. ➡️  Vérifier que 8 nouvelles politiques sécurisées sont créées';
  RAISE NOTICE '';
END $$;

-- ============================================================================
-- NOTES IMPORTANTES
-- ============================================================================
--
-- ⚠️  SÉCURITÉ TEMPORAIRE :
-- Après l'exécution de ce script, les tables n'ont AUCUNE politique RLS.
-- RLS est activé, mais sans politiques, PERSONNE ne peut accéder aux données
-- (même avec anon key ou service_role via politiques RLS).
--
-- Cependant, service_role BYPASS automatiquement RLS, donc le backend
-- continuera de fonctionner normalement.
--
-- ✅ APRÈS NETTOYAGE :
-- Appliquer immédiatement migrations/realtime-dashboard-tables.sql pour
-- recréer les politiques sécurisées.
--
-- ============================================================================
