# 🎓 Attribution Étudiant-Enseignant : Analyse et Recommandations

## 📊 État Actuel du Système

### Flux d'Attribution Actuel

**Actuellement, l'attribution se fait via les scénarios** :

```
Étudiant → Choisit un Scénario → Démarre une Session ECOS
                ↓
         Le scénario a un créateur (scenarios.created_by)
                ↓
         Enseignant voit les étudiants utilisant SES scénarios
```

### Code Actuel : Création de Session ECOS

**Fichier** : `server/routes.ts:1425-1461`

```typescript
app.post("/api/ecos/sessions", async (req, res) => {
  const { studentEmail, scenarioId } = req.body;

  // ❌ Pas de trainingSessionId
  const sessionId = `session_${scenarioId}_${Date.now()}_${random}`;

  await unifiedDb.createSession({
    sessionId,
    studentEmail,
    scenarioId: parseInt(scenarioId),
    status: 'active'
    // ❌ trainingSessionId n'est pas utilisé
  });
});
```

**Impact** :
- ✅ Simple et direct
- ✅ Fonctionne pour le cas d'usage actuel
- ❌ Ne supporte PAS le partage de scénarios entre enseignants
- ❌ Pas de lien avec les training_sessions

---

## 🏗️ Architecture de la Base de Données

### Tables Impliquées

```sql
-- Table 1: Scénarios (créés par des enseignants)
CREATE TABLE scenarios (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255),
  created_by VARCHAR(255),  -- Email de l'enseignant créateur
  ...
);

-- Table 2: Sessions ECOS (sessions d'examen individuelles)
CREATE TABLE sessions (
  id SERIAL PRIMARY KEY,
  session_id VARCHAR(255),  -- Format: session_SCENARIOID_timestamp_random
  student_email VARCHAR(255),
  scenario_id INTEGER REFERENCES scenarios(id),
  training_session_id INTEGER REFERENCES training_sessions(id),  -- ⚠️ NON UTILISÉ
  ...
);

-- Table 3: Training Sessions (sessions de formation groupées)
CREATE TABLE training_sessions (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255),
  created_by VARCHAR(255),  -- Email de l'enseignant organisateur
  start_date TIMESTAMP,
  end_date TIMESTAMP,
  ...
);

-- Table 4: Étudiants assignés à des training_sessions
CREATE TABLE training_session_students (
  id SERIAL PRIMARY KEY,
  training_session_id INTEGER REFERENCES training_sessions(id),
  student_email VARCHAR(255),
  assigned_at TIMESTAMP,
  ...
);

-- Table 5: Scénarios assignés à des training_sessions
CREATE TABLE training_session_scenarios (
  id SERIAL PRIMARY KEY,
  training_session_id INTEGER REFERENCES training_sessions(id),
  scenario_id INTEGER REFERENCES scenarios(id),
  ...
);
```

---

## 🔀 Deux Flux Possibles

### Flux 1 : Attribution Directe par Scénario (ACTUEL)

**Comment ça marche** :
1. Enseignant A crée un scénario X (`scenarios.created_by = 'enseignantA@example.com'`)
2. Étudiant choisit le scénario X
3. Étudiant démarre une session ECOS avec le scénario X
4. Enseignant A voit cet étudiant (car il a créé le scénario X)

**Notre filtrage actuel** :
```typescript
// ✅ Fonctionne pour ce flux
query = query
  .eq('scenarios.created_by', teacherEmail);
```

**Avantages** :
- ✅ Simple et direct
- ✅ Pas de configuration nécessaire
- ✅ Fonctionne immédiatement

**Limitations** :
- ❌ Si un étudiant utilise un scénario créé par un autre enseignant, le premier enseignant ne le voit pas
- ❌ Pas de notion de "classe" ou "groupe d'étudiants"
- ❌ Pas de partage de scénarios entre enseignants

---

### Flux 2 : Attribution via Training Sessions (NON IMPLÉMENTÉ)

**Comment ça pourrait marcher** :
1. Enseignant A crée une training_session "Formation Septembre 2025"
2. Enseignant A ajoute des scénarios à cette session (peuvent être créés par d'autres enseignants)
3. Enseignant A assigne des étudiants à cette session
4. Quand un étudiant démarre une session ECOS, il sélectionne la training_session
5. Enseignant A voit tous les étudiants de SA training_session

**Filtrage nécessaire** :
```typescript
// Pour implémenter ce flux
query = client
  .from('student_progress_snapshots')
  .select(`
    *,
    sessions!inner(training_session_id),
    training_sessions!inner(id, created_by)
  `)
  .eq('training_sessions.created_by', teacherEmail);
```

**Avantages** :
- ✅ Support du partage de scénarios
- ✅ Gestion de groupes d'étudiants
- ✅ Contrôle plus fin de l'attribution

**Limitations** :
- ❌ Plus complexe à implémenter
- ❌ Nécessite modification du frontend (sélection de training_session)
- ❌ Nécessite modification de la création de sessions ECOS

---

## 🔒 Sécurité Actuelle

### Notre Filtrage (Correctif Vulnérabilité #2)

**Fichier** : `server/services/realtime-analysis.service.ts`

```typescript
async getActiveStudents(teacherEmail?: string): Promise<any[]> {
  let query = client
    .from('student_progress_snapshots')
    .select(`
      *,
      sessions!inner(student_email, scenario_id, status, start_time),
      scenarios!inner(id, title, created_by)  // Jointure obligatoire
    `)
    .eq('status', 'in_progress');

  // SECURITY: Filter by scenario creator
  if (teacherEmail) {
    query = query.eq('scenarios.created_by', teacherEmail);
  }

  return await query;
}
```

**Ce que ça filtre** :
- ✅ Enseignant A voit SEULEMENT les étudiants utilisant les scénarios créés par A
- ✅ Enseignant B voit SEULEMENT les étudiants utilisant les scénarios créés par B
- ✅ Isolation complète des données entre enseignants

**Ce que ça NE filtre PAS** :
- ❌ Si Enseignant A veut superviser des étudiants utilisant des scénarios de B (via training_sessions)
- ❌ Partage de scénarios entre enseignants

---

## 🎯 Scénarios d'Utilisation

### Scénario 1 : Enseignant avec Ses Propres Scénarios

**Configuration** :
- Enseignant A crée 5 scénarios
- 20 étudiants utilisent ces scénarios

**Résultat** :
- ✅ Enseignant A voit les 20 étudiants
- ✅ Fonctionne parfaitement avec le système actuel

---

### Scénario 2 : Partage de Scénarios (NON SUPPORTÉ)

**Configuration** :
- Enseignant A crée 5 scénarios
- Enseignant B veut utiliser 3 scénarios de A pour ses étudiants
- Enseignant B crée une training_session et y ajoute les scénarios de A
- 10 étudiants de B utilisent les scénarios de A

**Résultat actuel** :
- ❌ Enseignant B ne voit PAS ses étudiants (car les scénarios sont créés par A)
- ❌ Enseignant A voit les étudiants de B (car ils utilisent ses scénarios)
- ❌ Comportement confus et incorrect

**Solution nécessaire** :
Implémenter le filtrage par training_sessions (Flux 2)

---

### Scénario 3 : Étudiants Libres (Cas Actuel)

**Configuration** :
- Les étudiants choisissent librement les scénarios disponibles
- Pas de training_sessions
- Pas d'assignation formelle

**Résultat** :
- ✅ Chaque enseignant voit les étudiants utilisant ses scénarios
- ✅ Fonctionne parfaitement avec le système actuel

---

## 💡 Recommandations

### Option 1 : Continuer avec le Flux Actuel (Recommandé à Court Terme)

**Quand utiliser** :
- Si les enseignants créent leurs propres scénarios
- Si pas besoin de partage de scénarios
- Si pas besoin de gestion de groupes d'étudiants

**Actions** :
- ✅ Aucune modification nécessaire
- ✅ Le filtrage actuel est sécurisé et fonctionnel
- ✅ Documentation claire pour les utilisateurs

**Documentation pour les enseignants** :
```
⚠️ IMPORTANT : Vous ne verrez que les étudiants utilisant VOS scénarios.
Si vous souhaitez superviser des étudiants, assurez-vous qu'ils utilisent
des scénarios que vous avez créés.
```

---

### Option 2 : Implémenter le Filtrage par Training Sessions (Moyen Terme)

**Quand utiliser** :
- Si besoin de partage de scénarios entre enseignants
- Si besoin de gestion de groupes d'étudiants
- Si besoin de supervision plus fine

**Actions nécessaires** :

**1. Backend : Modifier la création de sessions ECOS**
```typescript
app.post("/api/ecos/sessions", async (req, res) => {
  const { studentEmail, scenarioId, trainingSessionId } = req.body;  // ✅ Ajouter trainingSessionId

  await unifiedDb.createSession({
    sessionId,
    studentEmail,
    scenarioId,
    trainingSessionId  // ✅ Stocker le lien
  });
});
```

**2. Backend : Modifier le filtrage de getActiveStudents()**
```typescript
async getActiveStudents(teacherEmail?: string): Promise<any[]> {
  let query = client
    .from('student_progress_snapshots')
    .select(`
      *,
      sessions!inner(training_session_id, scenario_id),
      training_sessions(id, created_by),
      scenarios(id, created_by)
    `);

  if (teacherEmail) {
    // Option A : Sessions dans training_sessions de l'enseignant
    // Option B : OU scénarios créés par l'enseignant (fallback)
    query = query.or(
      `training_sessions.created_by.eq.${teacherEmail},scenarios.created_by.eq.${teacherEmail}`
    );
  }

  return await query;
}
```

**3. Frontend : Permettre sélection de training_session**
```typescript
// Dans le formulaire de démarrage de session ECOS
<select name="trainingSession">
  <option value="">Pas de training session</option>
  {trainingSessions.map(ts => (
    <option value={ts.id}>{ts.title}</option>
  ))}
</select>
```

**4. Tests de sécurité** :
- Vérifier qu'un enseignant voit ses étudiants (via training_sessions)
- Vérifier qu'un enseignant voit ses étudiants (via scénarios créés)
- Vérifier l'isolation entre enseignants

---

### Option 3 : Filtrage Hybride (Long Terme)

**Combiner les deux approches** :

```typescript
async getActiveStudents(teacherEmail?: string): Promise<any[]> {
  // Un enseignant voit :
  // 1. Les étudiants utilisant SES scénarios (Flux 1)
  // 2. OU les étudiants assignés à SES training_sessions (Flux 2)

  let query = client
    .from('student_progress_snapshots')
    .select(`
      *,
      sessions!inner(training_session_id, scenario_id),
      training_sessions(id, created_by),
      scenarios!inner(id, created_by)
    `)
    .eq('status', 'in_progress');

  if (teacherEmail) {
    query = query.or(
      `scenarios.created_by.eq.${teacherEmail},training_sessions.created_by.eq.${teacherEmail}`
    );
  }

  return await query;
}
```

---

## 📝 Résumé Exécutif

| Aspect | Flux Actuel (Scénarios) | Flux Training Sessions | Flux Hybride |
|--------|-------------------------|------------------------|--------------|
| **Complexité** | ✅ Simple | ❌ Complexe | ⚠️ Moyenne |
| **Partage scénarios** | ❌ Non supporté | ✅ Supporté | ✅ Supporté |
| **Gestion groupes** | ❌ Non | ✅ Oui | ✅ Oui |
| **Sécurité actuelle** | ✅ Implémentée | ❌ À implémenter | ⚠️ Partielle |
| **Modifications requis** | ✅ Aucune | ❌ Backend + Frontend | ⚠️ Backend seulement |
| **Recommandation** | ✅ Court terme | ⚠️ Moyen terme | ⚠️ Long terme |

---

## ✅ Conclusion

**Pour l'instant** : Le système actuel (Flux 1 - filtrage par `scenarios.created_by`) est :
- ✅ **Sécurisé** - Isolation complète entre enseignants
- ✅ **Fonctionnel** - Couvre le cas d'usage principal
- ✅ **Simple** - Pas de modification nécessaire

**Si besoin de partage de scénarios** : Implémenter Option 2 (Flux Training Sessions)

**Question pour décider** :
1. Les enseignants partagent-ils des scénarios entre eux ?
2. Y a-t-il besoin de groupes/classes d'étudiants ?
3. Les étudiants choisissent-ils librement ou sont-ils assignés ?

---

**Date** : 2025-10-31
**Auteur** : Claude (Assistant IA)
**Lié à** : SECURITY_DATA_LEAK_FIX.md
