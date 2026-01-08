-- ============================================================================
-- DIAGNOSTIC: "No activity found for this date"
-- ============================================================================
--
-- Utilisez ces requêtes pour diagnostiquer pourquoi la génération de synthèse
-- retourne "No activity found for this date"
--
-- ============================================================================

-- ============================================================================
-- ÉTAPE 1: Vérifier si des snapshots existent pour aujourd'hui
-- ============================================================================

-- Remplacez '2025-11-03' par la date que vous testez
SELECT
  COUNT(*) as total_snapshots,
  COUNT(DISTINCT student_email) as unique_students,
  MIN(timestamp) as first_snapshot,
  MAX(timestamp) as last_snapshot
FROM student_progress_snapshots
WHERE timestamp >= '2025-11-03T00:00:00Z'
  AND timestamp <= '2025-11-03T23:59:59.999Z';

-- Si total_snapshots = 0, alors aucun snapshot n'existe pour cette date
-- Si total_snapshots > 0, continuez aux étapes suivantes

-- ============================================================================
-- ÉTAPE 2: Voir tous les snapshots avec détails des sessions
-- ============================================================================

SELECT
  sps.id,
  sps.student_email,
  sps.scenario_id,
  sps.timestamp,
  sps.exchange_count,
  s.session_id as session_string_id,
  s.student_email as session_student,
  s.scenario_id as session_scenario,
  sc.title as scenario_title,
  sc.created_by as scenario_owner
FROM student_progress_snapshots sps
LEFT JOIN sessions s ON sps.session_id = s.id
LEFT JOIN scenarios sc ON sps.scenario_id = sc.id
WHERE sps.timestamp >= '2025-11-03T00:00:00Z'
  AND sps.timestamp <= '2025-11-03T23:59:59.999Z'
ORDER BY sps.timestamp DESC;

-- Cette requête montre:
-- - student_email: Email de l'étudiant
-- - scenario_owner: Qui a créé le scénario (created_by)
-- Si scenario_owner = votre email, vous devriez voir ces snapshots

-- ============================================================================
-- ÉTAPE 3: Vérifier les training sessions de l'enseignant
-- ============================================================================

-- Remplacez 'cherubindavid@gmail.com' par votre email
SELECT
  ts.id,
  ts.title,
  ts.created_by,
  tst.teacher_email,
  tst.role
FROM training_sessions ts
LEFT JOIN training_session_teachers tst
  ON ts.id = tst.training_session_id
WHERE ts.created_by = 'cherubindavid@gmail.com'
   OR tst.teacher_email = 'cherubindavid@gmail.com';

-- Si cette requête retourne 0 lignes, vous n'avez aucune training session
-- Cela signifie que le filtrage par training session échouera

-- ============================================================================
-- ÉTAPE 4: Vérifier les scénarios créés par l'enseignant
-- ============================================================================

-- Remplacez 'cherubindavid@gmail.com' par votre email
SELECT
  id,
  title,
  created_by,
  created_at
FROM scenarios
WHERE created_by = 'cherubindavid@gmail.com'
ORDER BY created_at DESC;

-- Si cette requête retourne des scénarios, vous devriez voir les snapshots
-- de ces scénarios dans la synthèse

-- ============================================================================
-- ÉTAPE 5: Comprendre le filtrage actuel
-- ============================================================================

-- Cette requête simule le filtrage fait par le code applicatif
-- Remplacez 'cherubindavid@gmail.com' par votre email

WITH teacher_email AS (
  SELECT 'cherubindavid@gmail.com'::VARCHAR as email
),
-- Étape 1: Récupérer tous les snapshots pour la date
all_snapshots AS (
  SELECT
    sps.*,
    s.student_email as session_student_email,
    s.scenario_id as session_scenario_id,
    sc.created_by as scenario_created_by
  FROM student_progress_snapshots sps
  LEFT JOIN sessions s ON sps.session_id = s.id
  LEFT JOIN scenarios sc ON sps.scenario_id = sc.id
  WHERE sps.timestamp >= '2025-11-03T00:00:00Z'
    AND sps.timestamp <= '2025-11-03T23:59:59.999Z'
),
-- Étape 2: Obtenir les training sessions assignées à l'enseignant
teacher_training_sessions AS (
  SELECT DISTINCT training_session_id
  FROM training_session_teachers
  WHERE teacher_email = (SELECT email FROM teacher_email)
),
-- Étape 3: Obtenir les étudiants des training sessions
assigned_students AS (
  SELECT DISTINCT student_email
  FROM training_session_students
  WHERE training_session_id IN (SELECT training_session_id FROM teacher_training_sessions)
    AND status = 'active'
)
-- Étape 4: Filtrer les snapshots
SELECT
  COUNT(*) as total_snapshots_before_filter,
  COUNT(*) FILTER (WHERE scenario_created_by = (SELECT email FROM teacher_email)) as accessible_via_scenario_ownership,
  COUNT(*) FILTER (WHERE session_student_email IN (SELECT student_email FROM assigned_students)) as accessible_via_training_session,
  COUNT(*) FILTER (
    WHERE scenario_created_by = (SELECT email FROM teacher_email)
       OR session_student_email IN (SELECT student_email FROM assigned_students)
  ) as total_accessible_snapshots
FROM all_snapshots;

-- Résultat attendu:
-- - total_snapshots_before_filter: Tous les snapshots pour la date
-- - accessible_via_scenario_ownership: Snapshots des scénarios que vous avez créés
-- - accessible_via_training_session: Snapshots des étudiants de vos training sessions
-- - total_accessible_snapshots: Total que vous devriez voir

-- ============================================================================
-- ÉTAPE 6: Liste détaillée des snapshots ACCESSIBLES par l'enseignant
-- ============================================================================

WITH teacher_email AS (
  SELECT 'cherubindavid@gmail.com'::VARCHAR as email
),
teacher_training_sessions AS (
  SELECT DISTINCT training_session_id
  FROM training_session_teachers
  WHERE teacher_email = (SELECT email FROM teacher_email)
),
assigned_students AS (
  SELECT DISTINCT student_email
  FROM training_session_students
  WHERE training_session_id IN (SELECT training_session_id FROM teacher_training_sessions)
    AND status = 'active'
)
SELECT
  sps.id,
  sps.student_email,
  sps.scenario_id,
  sps.timestamp,
  sps.exchange_count,
  sc.title as scenario_title,
  sc.created_by as scenario_owner,
  CASE
    WHEN sc.created_by = (SELECT email FROM teacher_email) THEN 'Via Scenario Ownership'
    WHEN s.student_email IN (SELECT student_email FROM assigned_students) THEN 'Via Training Session'
    ELSE 'NOT ACCESSIBLE'
  END as access_reason
FROM student_progress_snapshots sps
LEFT JOIN sessions s ON sps.session_id = s.id
LEFT JOIN scenarios sc ON sps.scenario_id = sc.id
WHERE sps.timestamp >= '2025-11-03T00:00:00Z'
  AND sps.timestamp <= '2025-11-03T23:59:59.999Z'
  AND (
    sc.created_by = (SELECT email FROM teacher_email)
    OR s.student_email IN (SELECT student_email FROM assigned_students)
  )
ORDER BY sps.timestamp DESC;

-- Cette requête montre EXACTEMENT ce que vous devriez voir dans la synthèse
-- Si elle retourne 0 lignes, alors le filtrage est trop restrictif

-- ============================================================================
-- SOLUTIONS POSSIBLES
-- ============================================================================

-- SOLUTION 1: Si vous êtes admin et voulez voir TOUS les snapshots
-- Modifier la requête pour ignorer le filtrage (ATTENTION: Sécurité!)

-- SOLUTION 2: Créer une training session et y assigner des étudiants
-- (Voir training-session-teachers.sql pour créer une training session)

-- SOLUTION 3: Changer le created_by des scénarios existants pour être votre email
UPDATE scenarios
SET created_by = 'cherubindavid@gmail.com'
WHERE id = 5; -- Remplacez 5 par l'ID du scénario testé

-- SOLUTION 4: Ajouter une training session de test avec vos étudiants actuels
-- Étape 1: Créer une training session
INSERT INTO training_sessions (
  title,
  description,
  created_by,
  status,
  start_date,
  end_date,
  created_at
) VALUES (
  'Session de test - Tous les étudiants',
  'Training session pour voir tous les étudiants actifs',
  'cherubindavid@gmail.com',
  'active',
  NOW() - INTERVAL '1 month',
  NOW() + INTERVAL '1 year',
  NOW()
) RETURNING id;

-- Étape 2: Assigner l'enseignant (remplacez <session_id> par l'ID retourné ci-dessus)
INSERT INTO training_session_teachers (
  training_session_id,
  teacher_email,
  role,
  assigned_by
) VALUES (
  <session_id>,
  'cherubindavid@gmail.com',
  'owner',
  'cherubindavid@gmail.com'
);

-- Étape 3: Assigner TOUS les étudiants qui ont des snapshots aujourd'hui
-- (remplacez <session_id> par l'ID de la training session créée)
INSERT INTO training_session_students (
  training_session_id,
  student_email,
  assigned_at,
  status
)
SELECT
  <session_id>,
  DISTINCT student_email,
  NOW(),
  'active'
FROM student_progress_snapshots
WHERE timestamp >= '2025-11-03T00:00:00Z'
  AND timestamp <= '2025-11-03T23:59:59.999Z'
ON CONFLICT DO NOTHING;

-- ============================================================================
-- VÉRIFICATION FINALE
-- ============================================================================

-- Après avoir appliqué une solution, exécutez à nouveau l'ÉTAPE 5
-- pour vérifier que total_accessible_snapshots > 0

-- ============================================================================
