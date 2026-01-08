-- ============================================================================
-- DIAGNOSTIC: Étudiants invisibles dans suivi temps réel
-- ============================================================================
--
-- Problème: Les étudiants ne sont pas pris en compte dans les sessions
--           Ils n'apparaissent pas dans le suivi en temps réel
--
-- ============================================================================

-- ============================================================================
-- ÉTAPE 1: Vérifier les sessions actives AUJOURD'HUI
-- ============================================================================

-- Remplacez la date par aujourd'hui
SELECT
  s.id,
  s.session_id,
  s.student_email,
  s.scenario_id,
  s.status,
  s.start_time,
  COUNT(e.id) as message_count
FROM sessions s
LEFT JOIN exchanges e ON s.id = e.session_id
WHERE s.start_time >= '2025-11-04T00:00:00Z'
  AND s.start_time <= '2025-11-04T23:59:59Z'
GROUP BY s.id, s.session_id, s.student_email, s.scenario_id, s.status, s.start_time
ORDER BY s.start_time DESC;

-- Si cette requête retourne 0 lignes → Aucune session aujourd'hui
-- Si elle retourne des lignes → Il y a des sessions mais pas de snapshots

-- ============================================================================
-- ÉTAPE 2: Vérifier les SNAPSHOTS créés AUJOURD'HUI
-- ============================================================================

SELECT
  sps.id,
  sps.student_email,
  sps.scenario_id,
  sps.session_id,
  sps.timestamp,
  sps.exchange_count,
  sps.status,
  s.session_id as session_string_id
FROM student_progress_snapshots sps
LEFT JOIN sessions s ON sps.session_id = s.id
WHERE sps.timestamp >= '2025-11-04T00:00:00Z'
  AND sps.timestamp <= '2025-11-04T23:59:59Z'
ORDER BY sps.timestamp DESC;

-- Si cette requête retourne 0 lignes → PROBLÈME: Aucun snapshot créé!
-- Cela signifie que analyzeSessionProgress() n'est pas appelé

-- ============================================================================
-- ÉTAPE 3: Vérifier le LIEN entre sessions et snapshots
-- ============================================================================

-- Cette requête montre les sessions AVEC et SANS snapshots
SELECT
  s.session_id,
  s.student_email,
  s.scenario_id,
  s.status,
  s.start_time,
  COUNT(DISTINCT e.id) as total_messages,
  COUNT(DISTINCT sps.id) as total_snapshots,
  MAX(sps.timestamp) as last_snapshot_time
FROM sessions s
LEFT JOIN exchanges e ON s.id = e.session_id
LEFT JOIN student_progress_snapshots sps ON s.id = sps.session_id
WHERE s.start_time >= '2025-11-04T00:00:00Z'
GROUP BY s.id, s.session_id, s.student_email, s.scenario_id, s.status, s.start_time
ORDER BY s.start_time DESC;

-- Colonne à surveiller:
-- total_messages > 0 mais total_snapshots = 0 → analyzeSessionProgress() pas appelé
-- total_messages > 3 mais total_snapshots = 0 → BUG CRITIQUE

-- ============================================================================
-- ÉTAPE 4: Vérifier les TRAINING SESSIONS de l'enseignant
-- ============================================================================

-- Remplacez par votre email
SELECT
  ts.id,
  ts.title,
  ts.created_by,
  tst.teacher_email,
  tst.role,
  COUNT(DISTINCT tss.student_email) as student_count
FROM training_sessions ts
LEFT JOIN training_session_teachers tst
  ON ts.id = tst.training_session_id
LEFT JOIN training_session_students tss
  ON ts.id = tss.training_session_id
WHERE ts.created_by = 'cherubindavid@gmail.com'
   OR tst.teacher_email = 'cherubindavid@gmail.com'
GROUP BY ts.id, ts.title, ts.created_by, tst.teacher_email, tst.role
ORDER BY ts.created_at DESC;

-- Si cette requête retourne 0 lignes → Vous n'avez aucune training session
-- Cela explique pourquoi getActiveStudents() ne trouve personne

-- ============================================================================
-- ÉTAPE 5: Vérifier les ÉTUDIANTS dans les training sessions
-- ============================================================================

-- Liste des étudiants assignés à VOS training sessions
WITH teacher_sessions AS (
  SELECT DISTINCT training_session_id
  FROM training_session_teachers
  WHERE teacher_email = 'cherubindavid@gmail.com'
)
SELECT
  tss.training_session_id,
  ts.title as session_title,
  tss.student_email,
  tss.status,
  tss.assigned_at,
  COUNT(DISTINCT s.id) as active_sessions_today
FROM training_session_students tss
INNER JOIN teacher_sessions ON tss.training_session_id = teacher_sessions.training_session_id
LEFT JOIN training_sessions ts ON tss.training_session_id = ts.id
LEFT JOIN sessions s ON s.student_email = tss.student_email
  AND s.start_time >= '2025-11-04T00:00:00Z'
GROUP BY tss.training_session_id, ts.title, tss.student_email, tss.status, tss.assigned_at
ORDER BY tss.assigned_at DESC;

-- Si cette requête retourne 0 lignes → Aucun étudiant assigné!

-- ============================================================================
-- ÉTAPE 6: DIAGNOSTIC COMPLET - Pourquoi les étudiants sont invisibles?
-- ============================================================================

WITH
-- Toutes les sessions actives aujourd'hui
active_sessions AS (
  SELECT
    s.id,
    s.session_id,
    s.student_email,
    s.scenario_id,
    COUNT(e.id) as message_count
  FROM sessions s
  LEFT JOIN exchanges e ON s.id = e.session_id
  WHERE s.start_time >= '2025-11-04T00:00:00Z'
  GROUP BY s.id, s.session_id, s.student_email, s.scenario_id
),
-- Snapshots créés aujourd'hui
active_snapshots AS (
  SELECT DISTINCT
    sps.session_id,
    sps.student_email,
    COUNT(*) as snapshot_count
  FROM student_progress_snapshots sps
  WHERE sps.timestamp >= '2025-11-04T00:00:00Z'
  GROUP BY sps.session_id, sps.student_email
),
-- Training sessions de l'enseignant
teacher_training_sessions AS (
  SELECT DISTINCT training_session_id
  FROM training_session_teachers
  WHERE teacher_email = 'cherubindavid@gmail.com'
),
-- Étudiants autorisés
authorized_students AS (
  SELECT DISTINCT student_email
  FROM training_session_students
  WHERE training_session_id IN (SELECT training_session_id FROM teacher_training_sessions)
    AND status = 'assigned'
),
-- Scénarios créés par l'enseignant
teacher_scenarios AS (
  SELECT DISTINCT id as scenario_id
  FROM scenarios
  WHERE created_by = 'cherubindavid@gmail.com'
)
-- Résultat final
SELECT
  acs.student_email,
  acs.session_id,
  acs.message_count,
  COALESCE(asp.snapshot_count, 0) as snapshot_count,
  CASE
    WHEN acs.scenario_id IN (SELECT scenario_id FROM teacher_scenarios) THEN 'Via Scenario Ownership'
    WHEN acs.student_email IN (SELECT student_email FROM authorized_students) THEN 'Via Training Session'
    ELSE '❌ NOT ACCESSIBLE'
  END as access_method,
  CASE
    WHEN acs.message_count >= 3 AND COALESCE(asp.snapshot_count, 0) = 0 THEN '❌ MISSING SNAPSHOTS'
    WHEN COALESCE(asp.snapshot_count, 0) > 0 THEN '✅ HAS SNAPSHOTS'
    ELSE '⏳ TOO FEW MESSAGES'
  END as snapshot_status
FROM active_sessions acs
LEFT JOIN active_snapshots asp ON acs.id = asp.session_id
ORDER BY acs.student_email;

-- INTERPRÉTATION:
--
-- access_method = '❌ NOT ACCESSIBLE' → L'enseignant ne peut pas voir cet étudiant
-- snapshot_status = '❌ MISSING SNAPSHOTS' → Snapshots devraient exister mais n'existent pas
-- snapshot_status = '✅ HAS SNAPSHOTS' → Tout fonctionne correctement
-- snapshot_status = '⏳ TOO FEW MESSAGES' → Pas assez de messages pour créer snapshot

-- ============================================================================
-- SOLUTIONS selon le diagnostic
-- ============================================================================

-- SOLUTION 1: Si aucune training session
-- Créez une training session et assignez les étudiants actifs

INSERT INTO training_sessions (
  title, description, created_by, status, start_date, end_date, created_at
) VALUES (
  'Session Novembre 2025 - Tous les étudiants',
  'Training session pour voir tous les étudiants actifs',
  'cherubindavid@gmail.com',
  'active',
  '2025-11-01',
  '2025-12-31',
  NOW()
) RETURNING id;

-- Notez l'ID retourné, puis remplacez <session_id> ci-dessous

-- Assignez-vous comme enseignant
INSERT INTO training_session_teachers (
  training_session_id, teacher_email, role, assigned_by
) VALUES (
  <session_id>,
  'cherubindavid@gmail.com',
  'owner',
  'cherubindavid@gmail.com'
);

-- Assignez tous les étudiants actifs aujourd'hui
INSERT INTO training_session_students (
  training_session_id, student_email, assigned_at, status
)
SELECT DISTINCT
  <session_id>,
  student_email,
  NOW(),
  'assigned'
FROM sessions
WHERE start_time >= '2025-11-04T00:00:00Z'
ON CONFLICT (training_session_id, student_email) DO NOTHING;

-- SOLUTION 2: Si snapshots manquants
-- Vérifiez que POST /api/ecos/sessions/:sessionId/messages appelle bien
-- analyzeSessionProgress() après avoir stocké les messages

-- SOLUTION 3: Si vous êtes propriétaire des scénarios
-- Changez le created_by des scénarios pour être votre email

UPDATE scenarios
SET created_by = 'cherubindavid@gmail.com'
WHERE id IN (4, 5); -- IDs des scénarios utilisés

-- ============================================================================
