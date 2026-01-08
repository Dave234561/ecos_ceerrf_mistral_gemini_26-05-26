-- ============================================================================
-- MIGRATION: Training Session Teachers & Enrollment Tokens
-- ============================================================================
--
-- OBJECTIF:
-- Permettre à plusieurs enseignants de gérer une même session de formation
-- et permettre aux étudiants de s'inscrire via un lien unique
--
-- TABLES MODIFIÉES/CRÉÉES:
-- 1. training_session_teachers (NEW)
-- 2. training_sessions (ADD enrollment_token, token_expires_at)
-- 3. training_session_students (ADD status if not exists)
--
-- ============================================================================

-- ============================================================================
-- ÉTAPE 1: Créer la table training_session_teachers
-- ============================================================================

CREATE TABLE IF NOT EXISTS training_session_teachers (
  id SERIAL PRIMARY KEY,
  training_session_id INTEGER NOT NULL REFERENCES training_sessions(id) ON DELETE CASCADE,
  teacher_email VARCHAR(255) NOT NULL,
  role VARCHAR(50) DEFAULT 'teacher' CHECK (role IN ('owner', 'teacher', 'observer')),
  assigned_at TIMESTAMP DEFAULT NOW(),
  assigned_by VARCHAR(255),  -- Email de celui qui a assigné l'enseignant

  -- Contrainte: Un enseignant ne peut être assigné qu'une seule fois par session
  CONSTRAINT unique_teacher_per_session UNIQUE(training_session_id, teacher_email)
);

-- Index pour recherche rapide par session
CREATE INDEX IF NOT EXISTS idx_session_teachers_training_session
ON training_session_teachers(training_session_id);

-- Index pour recherche rapide par enseignant
CREATE INDEX IF NOT EXISTS idx_session_teachers_email
ON training_session_teachers(teacher_email);

COMMENT ON TABLE training_session_teachers IS
'Enseignants assignés à des sessions de formation - peuvent voir tous les étudiants de la session';

COMMENT ON COLUMN training_session_teachers.role IS
'Rôle: owner (créateur), teacher (co-enseignant), observer (lecture seule)';

-- ============================================================================
-- ÉTAPE 2: Ajouter colonnes enrollment à training_sessions
-- ============================================================================

-- Ajouter colonne enrollment_token (unique)
ALTER TABLE training_sessions
ADD COLUMN IF NOT EXISTS enrollment_token VARCHAR(255);

-- Ajouter contrainte unique si la colonne existe déjà
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'training_sessions_enrollment_token_key'
  ) THEN
    ALTER TABLE training_sessions
    ADD CONSTRAINT training_sessions_enrollment_token_key UNIQUE (enrollment_token);
  END IF;
END $$;

-- Ajouter colonne token_expires_at
ALTER TABLE training_sessions
ADD COLUMN IF NOT EXISTS token_expires_at TIMESTAMP;

-- Index pour recherche rapide par token
CREATE INDEX IF NOT EXISTS idx_training_sessions_token
ON training_sessions(enrollment_token);

COMMENT ON COLUMN training_sessions.enrollment_token IS
'Token unique pour le lien d''inscription des étudiants (format: ts_<32chars>)';

COMMENT ON COLUMN training_sessions.token_expires_at IS
'Date d''expiration du lien d''inscription';

-- ============================================================================
-- ÉTAPE 3: Ajouter status à training_session_students (si pas déjà présent)
-- ============================================================================

ALTER TABLE training_session_students
ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'active';

COMMENT ON COLUMN training_session_students.status IS
'Statut de l''étudiant: active, completed, withdrawn';

-- ============================================================================
-- ÉTAPE 4: Vérification et affichage
-- ============================================================================

DO $$
DECLARE
  teachers_count INTEGER;
  sessions_with_token INTEGER;
BEGIN
  -- Compter les enseignants assignés
  SELECT COUNT(*) INTO teachers_count FROM training_session_teachers;

  -- Compter les sessions avec token
  SELECT COUNT(*) INTO sessions_with_token
  FROM training_sessions
  WHERE enrollment_token IS NOT NULL;

  RAISE NOTICE '';
  RAISE NOTICE '=== MIGRATION COMPLETED ===';
  RAISE NOTICE 'training_session_teachers table: EXISTS';
  RAISE NOTICE 'Current teacher assignments: %', teachers_count;
  RAISE NOTICE 'Sessions with enrollment tokens: %', sessions_with_token;
  RAISE NOTICE '';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '1. Use TrainingSessionService to create sessions with tokens';
  RAISE NOTICE '2. Assign teachers using training_session_teachers';
  RAISE NOTICE '3. Share enrollment URL with students';
  RAISE NOTICE '';
END $$;

-- ============================================================================
-- ÉTAPE 5: Exemple de données (OPTIONNEL - décommenter pour tester)
-- ============================================================================

-- -- Exemple: Créer une session de formation avec token
-- INSERT INTO training_sessions (
--   title,
--   description,
--   created_by,
--   start_date,
--   end_date,
--   enrollment_token,
--   token_expires_at
-- ) VALUES (
--   'Formation Test',
--   'Session de test pour le système d''enrollment',
--   'admin@example.com',
--   NOW(),
--   NOW() + INTERVAL '1 year',
--   'ts_test_token_123456789abcdef',
--   NOW() + INTERVAL '1 year'
-- ) RETURNING id;

-- -- Exemple: Assigner des enseignants (remplacer <session_id> par l'ID ci-dessus)
-- INSERT INTO training_session_teachers (
--   training_session_id,
--   teacher_email,
--   role,
--   assigned_by
-- ) VALUES
--   (<session_id>, 'admin@example.com', 'owner', 'admin@example.com'),
--   (<session_id>, 'prof1@example.com', 'teacher', 'admin@example.com'),
--   (<session_id>, 'prof2@example.com', 'observer', 'admin@example.com');

-- ============================================================================
-- ROLLBACK (Si besoin d'annuler - ATTENTION: perte de données)
-- ============================================================================

-- -- ATTENTION: Décommenter seulement si vous voulez annuler la migration
-- DROP TABLE IF EXISTS training_session_teachers CASCADE;
-- ALTER TABLE training_sessions DROP COLUMN IF EXISTS enrollment_token;
-- ALTER TABLE training_sessions DROP COLUMN IF EXISTS token_expires_at;
-- ALTER TABLE training_session_students DROP COLUMN IF EXISTS status;

-- ============================================================================
