-- ============================================================================
-- MIGRATION: Add teacher_email column to session_summaries
-- ============================================================================
--
-- PROBLÈME RÉSOLU:
-- La table session_summaries existe mais n'a pas la colonne teacher_email
-- qui est requise par le code applicatif
--
-- CAUSE:
-- La migration initiale (realtime-dashboard-tables.sql) n'a pas été appliquée
-- ou la table a été créée manuellement sans toutes les colonnes
--
-- SOLUTION:
-- Ajouter la colonne teacher_email si elle n'existe pas déjà
--
-- ============================================================================

-- ============================================================================
-- ÉTAPE 1: Vérifier si la table existe
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name = 'session_summaries'
  ) THEN
    RAISE EXCEPTION 'Table session_summaries does not exist. Please run realtime-dashboard-tables.sql first.';
  END IF;
END $$;

-- ============================================================================
-- ÉTAPE 2: Ajouter la colonne teacher_email si elle n'existe pas
-- ============================================================================

DO $$
BEGIN
  -- Check if column exists
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'session_summaries'
      AND column_name = 'teacher_email'
  ) THEN
    -- Add the column
    ALTER TABLE session_summaries
    ADD COLUMN teacher_email VARCHAR(255);

    RAISE NOTICE 'Column teacher_email added to session_summaries';
  ELSE
    RAISE NOTICE 'Column teacher_email already exists in session_summaries';
  END IF;
END $$;

-- ============================================================================
-- ÉTAPE 3: Mettre à jour les lignes existantes avec une valeur par défaut
-- ============================================================================

-- If there are existing rows without teacher_email, set a default value
-- This is safe because we're using DO IF EXISTS
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'session_summaries'
      AND column_name = 'teacher_email'
  ) THEN
    -- Update NULL values with a placeholder
    -- In production, you should update these with actual teacher emails
    UPDATE session_summaries
    SET teacher_email = 'unknown@system.local'
    WHERE teacher_email IS NULL;

    RAISE NOTICE 'Updated existing rows with default teacher_email';
  END IF;
END $$;

-- ============================================================================
-- ÉTAPE 4: Ajouter la contrainte NOT NULL
-- ============================================================================

-- Now make the column NOT NULL since we've populated existing rows
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'session_summaries'
      AND column_name = 'teacher_email'
      AND is_nullable = 'YES'
  ) THEN
    ALTER TABLE session_summaries
    ALTER COLUMN teacher_email SET NOT NULL;

    RAISE NOTICE 'Set teacher_email as NOT NULL';
  END IF;
END $$;

-- ============================================================================
-- ÉTAPE 5: Créer l'index si il n'existe pas
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_summary_teacher ON session_summaries(teacher_email);

-- ============================================================================
-- ÉTAPE 6: Recréer la contrainte UNIQUE avec teacher_email
-- ============================================================================

-- Drop old constraint if it exists (without teacher_email)
DO $$
BEGIN
  -- Check if there's a unique constraint on session_date only or session_date+scenario_id
  IF EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    WHERE t.relname = 'session_summaries'
      AND c.contype = 'u'
      AND c.conname NOT LIKE '%teacher_email%'
  ) THEN
    -- Drop any old unique constraints that don't include teacher_email
    -- We'll recreate the correct one below
    RAISE NOTICE 'Old unique constraint exists without teacher_email';
  END IF;
END $$;

-- Create the correct unique constraint
-- Format: UNIQUE(session_date, teacher_email, scenario_id)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    WHERE t.relname = 'session_summaries'
      AND c.contype = 'u'
      AND c.conname = 'session_summaries_session_date_teacher_email_scenario_id_key'
  ) THEN
    -- Drop any existing unique constraint first
    ALTER TABLE session_summaries
    DROP CONSTRAINT IF EXISTS session_summaries_session_date_scenario_id_key;

    ALTER TABLE session_summaries
    DROP CONSTRAINT IF EXISTS session_summaries_session_date_key;

    -- Add the correct unique constraint
    ALTER TABLE session_summaries
    ADD CONSTRAINT session_summaries_session_date_teacher_email_scenario_id_key
    UNIQUE (session_date, teacher_email, scenario_id);

    RAISE NOTICE 'Created unique constraint with teacher_email';
  ELSE
    RAISE NOTICE 'Unique constraint with teacher_email already exists';
  END IF;
END $$;

-- ============================================================================
-- ÉTAPE 7: Vérification finale
-- ============================================================================

DO $$
DECLARE
  col_exists BOOLEAN;
  col_nullable BOOLEAN;
  rows_count INTEGER;
BEGIN
  -- Check if column exists
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'session_summaries'
      AND column_name = 'teacher_email'
  ) INTO col_exists;

  -- Check if column is nullable
  SELECT (is_nullable = 'YES') INTO col_nullable
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'session_summaries'
    AND column_name = 'teacher_email';

  -- Count rows
  SELECT COUNT(*) INTO rows_count FROM session_summaries;

  RAISE NOTICE '';
  RAISE NOTICE '=== MIGRATION COMPLETED ===';
  RAISE NOTICE 'Column teacher_email exists: %', col_exists;
  RAISE NOTICE 'Column teacher_email nullable: %', col_nullable;
  RAISE NOTICE 'Total rows in session_summaries: %', rows_count;
  RAISE NOTICE '';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '1. Verify application can now generate summaries';
  RAISE NOTICE '2. Update existing rows with correct teacher emails if needed';
  RAISE NOTICE '3. Test summary generation via API';
  RAISE NOTICE '';
END $$;

-- ============================================================================
-- SQL pour mettre à jour les lignes existantes (OPTIONNEL)
-- ============================================================================

-- Si vous avez des synthèses existantes sans teacher_email correcte,
-- vous pouvez les mettre à jour comme ceci:

-- UPDATE session_summaries
-- SET teacher_email = 'correct-teacher@example.com'
-- WHERE teacher_email = 'unknown@system.local';

-- ============================================================================
-- ROLLBACK (Si besoin d'annuler - ATTENTION)
-- ============================================================================

-- -- ATTENTION: Décommenter seulement si vous voulez annuler la migration
-- ALTER TABLE session_summaries DROP COLUMN IF EXISTS teacher_email;
-- DROP INDEX IF EXISTS idx_summary_teacher;

-- ============================================================================
