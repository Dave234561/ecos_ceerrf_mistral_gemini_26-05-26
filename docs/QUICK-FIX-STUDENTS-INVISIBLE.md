# ⚡ Solution Rapide: Étudiants invisibles dans suivi temps réel

## 🔍 Problème

Les étudiants ne sont pas pris en compte dans les sessions. Ils n'apparaissent pas dans le suivi en temps réel.

## 📋 Diagnostic Rapide (2 minutes)

Exécutez cette requête SQL dans **Supabase Dashboard → SQL Editor**:

```sql
-- Remplacez la date par aujourd'hui
WITH
active_sessions AS (
  SELECT s.id, s.session_id, s.student_email, s.scenario_id,
         COUNT(e.id) as message_count
  FROM sessions s
  LEFT JOIN exchanges e ON s.id = e.session_id
  WHERE s.start_time >= '2025-11-04T00:00:00Z'
  GROUP BY s.id, s.session_id, s.student_email, s.scenario_id
),
active_snapshots AS (
  SELECT DISTINCT session_id, COUNT(*) as snapshot_count
  FROM student_progress_snapshots
  WHERE timestamp >= '2025-11-04T00:00:00Z'
  GROUP BY session_id
),
teacher_training_sessions AS (
  SELECT DISTINCT training_session_id
  FROM training_session_teachers
  WHERE teacher_email = 'cherubindavid@gmail.com'
),
authorized_students AS (
  SELECT DISTINCT student_email
  FROM training_session_students
  WHERE training_session_id IN (SELECT training_session_id FROM teacher_training_sessions)
    AND status = 'assigned'
),
teacher_scenarios AS (
  SELECT id FROM scenarios WHERE created_by = 'cherubindavid@gmail.com'
)
SELECT
  acs.student_email,
  acs.message_count,
  COALESCE(asp.snapshot_count, 0) as snapshots,
  CASE
    WHEN acs.scenario_id IN (SELECT id FROM teacher_scenarios) THEN '✅ Via Scenario'
    WHEN acs.student_email IN (SELECT student_email FROM authorized_students) THEN '✅ Via Training'
    ELSE '❌ NOT ACCESSIBLE'
  END as access,
  CASE
    WHEN acs.message_count >= 3 AND COALESCE(asp.snapshot_count, 0) = 0 THEN '❌ MISSING SNAPSHOTS'
    WHEN COALESCE(asp.snapshot_count, 0) > 0 THEN '✅ HAS SNAPSHOTS'
    ELSE '⏳ TOO FEW MESSAGES'
  END as status
FROM active_sessions acs
LEFT JOIN active_snapshots asp ON acs.id = asp.session_id
ORDER BY acs.student_email;
```

### Interprétation des résultats:

| Colonne | Signification | Action |
|---------|---------------|--------|
| `access = '❌ NOT ACCESSIBLE'` | Vous ne pouvez pas voir cet étudiant | → Appliquer SOLUTION 0 (API), 1 (SQL) ou 2 (Scénarios) |
| `status = '❌ MISSING SNAPSHOTS'` | Snapshots manquants malgré messages | → Appliquer SOLUTION 3 |
| `status = '✅ HAS SNAPSHOTS'` | Tout fonctionne | → Aucune action |
| `status = '⏳ TOO FEW MESSAGES'` | Pas assez de messages (<3) | → Normal, attendre |

## 🚀 Solutions Rapides

### SOLUTION 0: API Automatique (⭐ LE PLUS FACILE - Recommandé)

**Méthode:** Appel API automatique depuis l'application web ou via curl

**Avantages:**
- ✅ Aucune requête SQL manuelle
- ✅ Automatique pour tous les étudiants actifs aujourd'hui
- ✅ Crée la training session + assigne enseignant + assigne étudiants
- ✅ Idempotent (peut être relancé sans problème)

**Étape 1: Via l'application web (À VENIR)**

_Interface web en développement - utilisez l'option curl ci-dessous pour l'instant_

**Étape 2: Via curl (Nécessite authentification Firebase)**

```bash
# Obtenez votre token Firebase depuis la console du navigateur
# 1. Ouvrez DevTools → Application → Local Storage
# 2. Copiez la valeur de 'firebaseToken' ou extrayez depuis firebase:auth

# Puis exécutez:
curl -X POST https://ecos-infirmier-b-20.vercel.app/api/teacher/training-sessions/auto-assign-active-students \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer VOTRE_TOKEN_FIREBASE" \
  -d '{
    "sessionDate": "2025-11-04"
  }'
```

**Réponse attendue:**
```json
{
  "success": true,
  "message": "5 étudiants assignés avec succès",
  "trainingSessionId": 48,
  "studentsAssigned": 5,
  "sessionTitle": "Session Auto 2025-11-04 - Suivi Temps Réel",
  "students": ["student1@example.com", "student2@example.com", ...],
  "scenarios": [4, 5]
}
```

**Résultat:** Tous les étudiants actifs aujourd'hui sont maintenant visibles! ✅

**Note:** Si aucune session active aujourd'hui, vous verrez:
```json
{
  "success": false,
  "message": "Aucune session active trouvée pour la date 2025-11-04",
  "studentsAssigned": 0
}
```

---

### SOLUTION 1: SQL Manuel - Créer training session avec tous les étudiants actifs

**Étape 1: Créer la training session**

```sql
INSERT INTO training_sessions (
  title, description, created_by, status, start_date, end_date, created_at
) VALUES (
  'Session Novembre 2025 - Tous les étudiants',
  'Training session pour voir tous les étudiants actifs',
  'cherubindavid@gmail.com',  -- Remplacez par votre email
  'active',
  '2025-11-01',
  '2025-12-31',
  NOW()
) RETURNING id;
```

**NOTEZ L'ID RETOURNÉ!** (exemple: 48)

**Étape 2: Vous assigner comme enseignant**

```sql
-- Remplacez 48 par l'ID de l'étape 1
INSERT INTO training_session_teachers (
  training_session_id, teacher_email, role, assigned_by
) VALUES (
  48,  -- REMPLACEZ par votre ID
  'cherubindavid@gmail.com',  -- Votre email
  'owner',
  'cherubindavid@gmail.com'
);
```

**Étape 3: Assigner TOUS les étudiants actifs aujourd'hui**

```sql
-- Remplacez 48 par l'ID de l'étape 1
INSERT INTO training_session_students (
  training_session_id, student_email, assigned_at, status
)
SELECT DISTINCT
  48,  -- REMPLACEZ par votre ID
  student_email,
  NOW(),
  'assigned'
FROM sessions
WHERE start_time >= '2025-11-04T00:00:00Z'  -- Date d'aujourd'hui
ON CONFLICT (training_session_id, student_email) DO NOTHING;
```

**Résultat:** Tous les étudiants actifs seront maintenant visibles! ✅

### SOLUTION 2: Changer propriétaire des scénarios (Plus rapide, 1 requête)

```sql
-- Change le propriétaire des scénarios 4 et 5
UPDATE scenarios
SET created_by = 'cherubindavid@gmail.com'  -- Votre email
WHERE id IN (4, 5);  -- IDs des scénarios utilisés
```

**Résultat:** Tous les étudiants de ces scénarios seront visibles! ✅

### SOLUTION 3: Si snapshots manquants malgré messages

**Vérifiez les logs Vercel:**

Cherchez ces lignes dans les logs:
```
✅ Stored user message and assistant response for session: session_X_Y_Z
✅ Real-time analysis triggered for session: session_X_Y_Z
```

**Si vous NE voyez PAS "Real-time analysis triggered":**

Le snapshot n'est pas créé. Redémarrez l'application Vercel:
1. Vercel Dashboard → Votre projet
2. Deployments → Latest → Redeploy

## 🔍 Vérification après solution

Exécutez à nouveau la requête de diagnostic:

```sql
-- Vérifiez que les étudiants sont maintenant accessibles
SELECT
  sps.student_email,
  COUNT(*) as snapshot_count,
  MAX(sps.timestamp) as last_snapshot
FROM student_progress_snapshots sps
WHERE sps.timestamp >= '2025-11-04T00:00:00Z'
GROUP BY sps.student_email
ORDER BY last_snapshot DESC;
```

**Résultat attendu:** Tous les étudiants actifs avec `snapshot_count > 0`

Puis rafraîchissez la page du suivi en temps réel:
1. Allez sur `/teacher/cherubindavid@gmail.com`
2. Onglet "Suivi en temps réel"
3. **Les étudiants devraient maintenant apparaître!** 🎉

## 📊 Comprendre le filtrage de sécurité

Le suivi en temps réel applique un filtrage de sécurité pour que chaque enseignant ne voie que SES étudiants:

```
Étudiant visible SI:
  ✅ Scénario créé par l'enseignant (scenarios.created_by = votre email)
  OU
  ✅ Étudiant dans une training session de l'enseignant
```

**Si aucun des deux critères n'est rempli → Étudiant invisible** ❌

## 🔧 Cas particuliers

### Cas 1: Vous voyiez les étudiants avant, maintenant plus

**Cause:** Les snapshots ne sont plus créés

**Solution:** Vérifiez les logs Vercel pour `analyzeSessionProgress errors`

### Cas 2: Certains étudiants visibles, d'autres non

**Cause:** Certains sont dans training sessions, d'autres non

**Solution:** SOLUTION 0 (API automatique) ou SOLUTION 1 (SQL manuel)

### Cas 3: Aucun étudiant visible malgré activité

**Cause:** Ni propriétaire des scénarios, ni training sessions

**Solution:** SOLUTION 0 (API - recommandé), SOLUTION 1 (SQL training session) ou SOLUTION 2 (SQL scénarios)

## 📝 Diagnostic complet

Pour un diagnostic complet avec toutes les requêtes, consultez:
- `docs/DIAGNOSTIC-STUDENTS-INVISIBLE.sql` - Toutes les requêtes de diagnostic

## 💡 Recommandation

**Méthode recommandée:**
- Utilisez **SOLUTION 0** (API automatique) - le plus simple, aucune requête SQL
- Automatiquement crée training session + assigne enseignant + assigne tous les étudiants actifs
- Idempotent et sécurisé

**Alternative pour la production:**
- Utilisez **SOLUTION 1** (SQL training sessions) - plus propre et respecte le modèle de sécurité
- Créez une training session par classe/groupe d'étudiants
- Assignez les enseignants aux training sessions appropriées

**Pour le développement/test (rapide mais moins propre):**
- Utilisez **SOLUTION 2** (SQL scénarios) - plus rapide, 1 requête, mais modifie ownership

## 🐛 Si le problème persiste

1. Vérifiez les logs Vercel pour erreurs
2. Exécutez la requête de diagnostic complète (voir docs/)
3. Vérifiez que `analyzeSessionProgress()` est bien appelé
4. Contactez le support avec les résultats du diagnostic

## ✅ Vérification finale

Après avoir appliqué une solution, vous devriez voir:

**Dans l'onglet "Suivi en temps réel":**
- ✅ Liste des étudiants actifs
- ✅ Progression en temps réel
- ✅ Snapshots avec points forts/faibles
- ✅ Historique de progression

**Si vous voyez encore "Aucun étudiant actif":**
- Attendez 10-20 secondes (polling automatique)
- Rafraîchissez la page (F5)
- Vérifiez qu'il y a bien des sessions actives aujourd'hui
