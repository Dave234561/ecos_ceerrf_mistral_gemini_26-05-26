# Scripts de Gestion du Suivi en Temps Réel

Scripts utilitaires pour résoudre le problème des étudiants invisibles dans le suivi en temps réel.

## 🎯 Problème

Les étudiants n'apparaissent pas dans l'onglet "Suivi en temps réel" du dashboard enseignant.

**Cause:** Les étudiants doivent être liés à l'enseignant via:
- Propriété des scénarios (`scenarios.created_by = teacher_email`), OU
- Training sessions (`training_session_students` + `training_session_teachers`)

Si aucun des deux critères n'est rempli → Étudiant invisible ❌

## 🚀 Solution Rapide

### 1. Assigner automatiquement les étudiants actifs

```bash
cd scripts
./assign-active-students.sh
```

**Ce que fait ce script:**
- Récupère tous les étudiants actifs aujourd'hui
- Crée une training session automatiquement
- Assigne l'enseignant comme propriétaire
- Assigne tous les étudiants actifs à la session
- **Résultat:** Les étudiants deviennent visibles dans le suivi en temps réel ✅

**Options:**
```bash
# Date spécifique
./assign-active-students.sh 2025-11-04

# Enseignant différent
TEACHER_EMAIL=autre@email.com ./assign-active-students.sh

# Environnement local
API_URL=http://localhost:5000 ./assign-active-students.sh
```

### 2. Vérifier les étudiants actifs

```bash
./check-active-students.sh
```

**Ce que fait ce script:**
- Affiche les requêtes SQL pour vérifier:
  - Quels étudiants sont actifs aujourd'hui
  - Combien de messages ils ont envoyés
  - Si des snapshots ont été créés
- Copiez/collez les requêtes dans Supabase SQL Editor

**Diagnostic:**
- `snapshot_count = 0` et `message_count > 2` → Snapshots non créés (problème code)
- `snapshot_count > 0` mais étudiants invisibles → Pas assignés à training session (run script 1)
- `message_count < 3` → Pas assez de messages, c'est normal

## 📋 Workflow de Résolution

### Étape 1: Diagnostic
```bash
./check-active-students.sh
# Copiez les requêtes SQL et exécutez dans Supabase Dashboard
```

### Étape 2: Analyser les résultats
- **Si snapshots = 0 malgré messages > 2:**
  - Problème de code: snapshots non créés
  - Vérifiez les logs Vercel pour erreurs `analyzeSessionProgress`
  - Les commits récents devraient avoir corrigé ce problème

- **Si snapshots > 0 mais étudiants invisibles:**
  - Problème de configuration: pas de lien enseignant-étudiant
  - → Passez à l'étape 3

### Étape 3: Assigner les étudiants
```bash
./assign-active-students.sh
```

### Étape 4: Vérifier le résultat
- Rafraîchissez le dashboard enseignant
- Allez dans "Suivi en temps réel"
- Les étudiants devraient maintenant apparaître ✅

## 🔍 Détails Techniques

### API Endpoint Utilisé
```
POST /api/teacher/training-sessions/auto-assign-active-students
```

**Paramètres:**
```json
{
  "email": "cherubindavid@gmail.com",
  "sessionDate": "2025-11-04"
}
```

**Réponse succès:**
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

**Réponse vide:**
```json
{
  "success": false,
  "message": "Aucune session active trouvée pour la date 2025-11-04",
  "studentsAssigned": 0
}
```

### Filtrage de Sécurité

Le service `realtime-analysis.service.ts` applique ce filtre:

```typescript
filteredSnapshots = allSnapshots.filter(snapshot => {
  const isScenarioOwner = snapshot.scenarios?.created_by === teacherEmail;
  const isTrainingSessionStudent = assignedStudentEmails.includes(snapshot.sessions?.student_email);
  return isScenarioOwner || isTrainingSessionStudent;
});
```

**Étudiant visible SI:**
- Scénario créé par l'enseignant (`created_by`) ✅
- **OU** Étudiant dans training session de l'enseignant ✅

**Sinon:** Filtré → Invisible ❌

## 📚 Ressources Supplémentaires

Pour des diagnostics plus approfondis:
- `docs/DIAGNOSTIC-STUDENTS-INVISIBLE.sql` - Requêtes SQL complètes
- `docs/QUICK-FIX-STUDENTS-INVISIBLE.md` - Solutions alternatives (SQL manuel)

## 🐛 Dépannage

### Erreur: "User not found"
```json
{
  "error": "User not found",
  "code": "USER_NOT_FOUND"
}
```
**Solution:** L'email enseignant n'existe pas dans la table `users` avec role `teacher` ou `admin`.

**Fix SQL:**
```sql
-- Vérifier l'utilisateur
SELECT email, role FROM users WHERE email = 'cherubindavid@gmail.com';

-- Si absent, créer:
INSERT INTO users (email, role, created_at)
VALUES ('cherubindavid@gmail.com', 'teacher', NOW())
ON CONFLICT (email) DO UPDATE SET role = 'teacher';
```

### Erreur: "Failed to fetch active sessions"
**Solution:** Problème de connexion Supabase. Vérifiez:
- Variables d'environnement (`DATABASE_URL`, `SUPABASE_URL`, etc.)
- Statut Supabase Dashboard
- Logs Vercel pour erreurs de connexion

### Script retourne 0 étudiants
**Causes possibles:**
1. Aucun étudiant actif pour cette date
2. Mauvaise date (format doit être `YYYY-MM-DD`)
3. Sessions créées mais avec une date différente

**Vérification:**
```bash
# Lister les dates avec sessions
./check-active-students.sh
# Regardez start_time des sessions dans le résultat SQL
```

## ✅ Validation

Après avoir exécuté les scripts, vérifiez:

1. **Dans Supabase:**
```sql
SELECT title, created_by, status
FROM training_sessions
WHERE title LIKE 'Session Auto%'
ORDER BY created_at DESC
LIMIT 5;
```

2. **Dans le Dashboard:**
- Connectez-vous comme enseignant
- Ouvrez "Suivi en temps réel"
- Les étudiants devraient apparaître avec leurs snapshots

3. **Via API:**
```bash
curl "https://ecos-infirmier-b-20.vercel.app/api/teacher/realtime/active-students?email=cherubindavid@gmail.com"
```

## 🎯 Prochaines Étapes

### Court terme
- ✅ Scripts automatiques fonctionnels
- ⏳ Interface web pour l'assignation (bouton dans dashboard)
- ⏳ Notification visuelle quand nouveaux étudiants détectés

### Long terme
- Auto-assignation quotidienne via cron
- Dashboard enseignant pour gérer training sessions
- Bulk import d'étudiants depuis CSV

## 📞 Support

Si le problème persiste après avoir suivi ces étapes:
1. Exécutez `./check-active-students.sh` et gardez les résultats
2. Vérifiez les logs Vercel pour erreurs récentes
3. Contactez le support avec les diagnostics
