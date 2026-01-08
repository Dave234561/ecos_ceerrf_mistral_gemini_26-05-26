# ⚡ Solution Rapide: "No activity found for this date"

## 🔍 Problème

L'erreur "No activity found for this date" survient même si des snapshots existent pour la date. **C'est un problème de filtrage de sécurité.**

Le code applique deux filtres pour déterminer quels snapshots un enseignant peut voir:

1. ✅ **Scénarios créés par l'enseignant** (`scenarios.created_by = votre_email`)
2. ✅ **Étudiants dans les training sessions assignées** (via `training_session_teachers`)

Si **aucun** des deux critères n'est rempli, tous les snapshots sont filtrés → erreur "No activity found".

## 🚀 Solution Rapide (2 minutes)

### Option 1: Modifier le propriétaire du scénario

Exécutez cette requête SQL dans Supabase Dashboard → SQL Editor:

```sql
-- Remplacez 5 par l'ID du scénario que vous testez
-- Remplacez cherubindavid@gmail.com par votre email
UPDATE scenarios
SET created_by = 'cherubindavid@gmail.com'
WHERE id = 5;
```

**Résultat**: Tous les snapshots du scénario 5 seront maintenant visibles pour vous.

### Option 2: Créer une training session de test

```sql
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
  'Session de test - Novembre 2025',
  'Training session pour voir tous les étudiants actifs',
  'cherubindavid@gmail.com',
  'active',
  '2025-11-01'::DATE,
  '2025-12-31'::DATE,
  NOW()
) RETURNING id;

-- NOTEZ L'ID RETOURNÉ, puis exécutez les étapes suivantes

-- Étape 2: Vous assigner comme enseignant (remplacez 123 par l'ID ci-dessus)
INSERT INTO training_session_teachers (
  training_session_id,
  teacher_email,
  role,
  assigned_by
) VALUES (
  123,  -- REMPLACEZ PAR L'ID DE L'ÉTAPE 1
  'cherubindavid@gmail.com',
  'owner',
  'cherubindavid@gmail.com'
);

-- Étape 3: Assigner tous les étudiants actifs aujourd'hui
INSERT INTO training_session_students (
  training_session_id,
  student_email,
  assigned_at,
  status
)
SELECT DISTINCT
  123,  -- REMPLACEZ PAR L'ID DE L'ÉTAPE 1
  sps.student_email,
  NOW(),
  'active'
FROM student_progress_snapshots sps
WHERE sps.timestamp >= '2025-11-03T00:00:00Z'
  AND sps.timestamp <= '2025-11-03T23:59:59.999Z'
ON CONFLICT (training_session_id, student_email) DO NOTHING;
```

## ✅ Vérification

Après avoir appliqué une solution, testez à nouveau:

1. Allez sur `/teacher/cherubindavid@gmail.com`
2. Onglet "Suivi en temps réel"
3. Section "Synthèse de Session"
4. Sélectionnez la date d'aujourd'hui
5. Cliquez "Générer Synthèse"

**Résultat attendu**: La synthèse se génère avec succès! 🎉

## 🔍 Diagnostic Complet

Pour comprendre exactement ce qui se passe, exécutez cette requête de diagnostic:

```sql
-- Cette requête montre combien de snapshots existent vs. combien vous pouvez voir
WITH teacher_email AS (
  SELECT 'cherubindavid@gmail.com'::VARCHAR as email
),
all_snapshots AS (
  SELECT
    sps.*,
    s.student_email as session_student_email,
    sc.created_by as scenario_created_by
  FROM student_progress_snapshots sps
  LEFT JOIN sessions s ON sps.session_id = s.id
  LEFT JOIN scenarios sc ON sps.scenario_id = sc.id
  WHERE sps.timestamp >= '2025-11-03T00:00:00Z'
    AND sps.timestamp <= '2025-11-03T23:59:59.999Z'
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
  COUNT(*) as total_snapshots,
  COUNT(*) FILTER (
    WHERE scenario_created_by = (SELECT email FROM teacher_email)
  ) as accessible_via_scenario,
  COUNT(*) FILTER (
    WHERE session_student_email IN (SELECT student_email FROM assigned_students)
  ) as accessible_via_training,
  COUNT(*) FILTER (
    WHERE scenario_created_by = (SELECT email FROM teacher_email)
       OR session_student_email IN (SELECT student_email FROM assigned_students)
  ) as total_accessible
FROM all_snapshots;
```

**Interprétation des résultats:**

| Colonne | Signification |
|---------|---------------|
| `total_snapshots` | Nombre total de snapshots pour la date |
| `accessible_via_scenario` | Snapshots des scénarios que vous avez créés |
| `accessible_via_training` | Snapshots des étudiants de vos training sessions |
| `total_accessible` | **Total que vous pouvez voir** |

Si `total_accessible = 0` alors que `total_snapshots > 0`, vous avez besoin d'appliquer une solution.

## 📋 Requêtes de Diagnostic Supplémentaires

### Voir tous les snapshots d'aujourd'hui (sans filtre)

```sql
SELECT
  sps.id,
  sps.student_email,
  sps.scenario_id,
  sc.title as scenario_title,
  sc.created_by as scenario_owner,
  sps.timestamp,
  sps.exchange_count
FROM student_progress_snapshots sps
LEFT JOIN scenarios sc ON sps.scenario_id = sc.id
WHERE sps.timestamp >= '2025-11-03T00:00:00Z'
  AND sps.timestamp <= '2025-11-03T23:59:59.999Z'
ORDER BY sps.timestamp DESC;
```

### Vérifier vos training sessions

```sql
SELECT
  ts.id,
  ts.title,
  ts.created_by,
  tst.teacher_email,
  tst.role,
  COUNT(tss.student_email) as num_students
FROM training_sessions ts
LEFT JOIN training_session_teachers tst
  ON ts.id = tst.training_session_id
LEFT JOIN training_session_students tss
  ON ts.id = tss.training_session_id
WHERE ts.created_by = 'cherubindavid@gmail.com'
   OR tst.teacher_email = 'cherubindavid@gmail.com'
GROUP BY ts.id, ts.title, ts.created_by, tst.teacher_email, tst.role;
```

Si cette requête retourne **0 lignes**, vous n'avez aucune training session → utilisez **Option 2** ci-dessus.

### Vérifier les scénarios que vous avez créés

```sql
SELECT id, title, created_by
FROM scenarios
WHERE created_by = 'cherubindavid@gmail.com';
```

Si cette requête retourne **0 lignes**, vous n'êtes propriétaire d'aucun scénario → utilisez **Option 1** ci-dessus.

## 🎯 Recommandation

**Pour le développement/test**: Utilisez **Option 1** (plus rapide, 1 requête)

**Pour la production**: Utilisez **Option 2** (plus propre, respecte le modèle de sécurité)

## 📚 Documentation Complète

Pour un diagnostic complet avec toutes les requêtes, consultez:
- `docs/DIAGNOSTIC-NO-ACTIVITY.sql` - Toutes les requêtes de diagnostic
- `server/services/realtime-analysis.service.ts:586-590` - Code du filtrage

## 💡 Notes Techniques

### Pourquoi ce filtrage existe-t-il?

Le filtrage de sécurité garantit que les enseignants ne voient que les étudiants qu'ils supervisent, soit via:
- Les scénarios qu'ils ont créés
- Les training sessions où ils sont assignés

Cela empêche un enseignant de voir les étudiants d'un autre enseignant.

### Comment désactiver temporairement le filtrage (DEV ONLY)

⚠️ **ATTENTION: À utiliser uniquement en développement local**

Dans `server/services/realtime-analysis.service.ts:586-590`, commentez le filtrage:

```typescript
// TEMPORAIRE: Désactiver le filtrage pour test
const filteredSnapshotsRaw = allSnapshotsRaw; // Voir TOUS les snapshots
// const filteredSnapshotsRaw = allSnapshotsRaw.filter((item: any) => {
//   const isScenarioOwner = item.scenarios?.created_by === teacherEmail;
//   const isTrainingSessionStudent = assignedStudentEmails.includes(item.sessions?.student_email);
//   return isScenarioOwner || isTrainingSessionStudent;
// });
```

**N'oubliez pas de réactiver le filtrage après vos tests!**

## 🐛 Si le problème persiste

Si après avoir appliqué une solution vous obtenez toujours "No activity found", vérifiez:

1. **La date est correcte** (format: YYYY-MM-DD)
2. **Des snapshots existent vraiment** (requête "Voir tous les snapshots" ci-dessus)
3. **Le timezone** (les snapshots doivent être entre 00:00:00Z et 23:59:59.999Z)
4. **Les logs serveur** pour voir les valeurs exactes:
   ```
   RealtimeAnalysis: No accessible snapshots after teacher filtering
   totalSnapshotsFound: X
   assignedTrainingSessions: Y
   assignedStudents: Z
   ```

Si `totalSnapshotsFound > 0` mais `total_accessible = 0`, le filtrage est trop restrictif.
