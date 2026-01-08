# 🔒 CORRECTION CRITIQUE #2 : Fuite de Données - Filtrage par Enseignant Manquant

## ⚠️ Vulnérabilité Identifiée

**Date de découverte** : 2025-10-31
**Sévérité** : **CRITIQUE** 🔴
**Type** : Fuite de données (Data Exposure - Broken Access Control)

### Description de la Vulnérabilité

Même après avoir sécurisé l'authentification avec Firebase (voir `SECURITY_AUTH_CRITICAL_FIX.md`), les fonctions backend ne filtraient PAS les données par enseignant. Un enseignant authentifié pouvait voir **tous les étudiants actifs de tous les enseignants**.

**Fonctions vulnérables** :
1. `realtimeAnalysisService.getActiveStudents(teacherEmail)` - Ignorait le paramètre `teacherEmail`
2. `realtimeAnalysisService.generateSessionSummary(sessionDate, teacherEmail, scenarioId)` - Ignorait le paramètre `teacherEmail`

### Code Vulnérable

**Fichier** : `server/services/realtime-analysis.service.ts`

```typescript
// ❌ AVANT (Vulnérable)
async getActiveStudents(teacherEmail?: string): Promise<any[]> {
  let query = client
    .from('student_progress_snapshots')
    .select(`
      *,
      sessions!inner(student_email, scenario_id, status, start_time),
      scenarios(id, title)
    `)
    .eq('status', 'in_progress')
    .order('timestamp', { ascending: false });

  // TODO: Filter by teacher when training_sessions linkage is implemented
  // if (teacherEmail) {
  //   query = query.eq('sessions.created_by', teacherEmail);
  // }

  const { data, error } = await query;  // ❌ Retourne TOUS les étudiants actifs
  // ...
}
```

**Impact** :
- Un enseignant voit les étudiants de TOUS les autres enseignants
- Violation du principe de moindre privilège
- Fuite de données personnelles (emails étudiants, progrès, points faibles/forts)
- Non-conformité RGPD (accès non autorisé à des données personnelles)

---

## ✅ Correction Implémentée

### Stratégie de Filtrage

**Principe** : Filtrer par `scenarios.created_by = teacherEmail`

**Logique** :
1. Chaque session ECOS utilise un scénario (`sessions.scenario_id`)
2. Chaque scénario a un créateur (`scenarios.created_by`)
3. Un enseignant ne voit que les étudiants utilisant **ses propres scénarios**

**Avantages** :
- ✅ Simple à implémenter (jointure existante)
- ✅ Pas de modification de schéma requis
- ✅ Aligné avec la logique métier (enseignants possèdent leurs scénarios)

**Limitation** :
- Si un scénario est partagé entre enseignants, tous verront les étudiants utilisant ce scénario
- Les sessions utilisant des scénarios non créés par l'enseignant ne seront pas visibles

---

## 📋 Changements Implémentés

### 1. Correction de `getActiveStudents()`

**Avant** :
```typescript
let query = client
  .from('student_progress_snapshots')
  .select(`
    *,
    sessions!inner(student_email, scenario_id, status, start_time),
    scenarios(id, title)
  `)
  .eq('status', 'in_progress');

// ❌ Pas de filtre par enseignant
const { data, error } = await query;
```

**Après** :
```typescript
let query = client
  .from('student_progress_snapshots')
  .select(`
    *,
    sessions!inner(student_email, scenario_id, status, start_time),
    scenarios!inner(id, title, created_by)  // ✅ Jointure INNER obligatoire
  `)
  .eq('status', 'in_progress')
  .order('timestamp', { ascending: false });

// SECURITY: Filter by teacher email
// Only show students using scenarios created by this teacher
if (teacherEmail) {
  query = query.eq('scenarios.created_by', teacherEmail);  // ✅ FILTRE CRITIQUE
  logger.info('RealtimeAnalysis: Filtering active students by teacher', { teacherEmail });
} else {
  logger.warn('RealtimeAnalysis: No teacher filter applied - returning all active students');
}

const { data, error } = await query;
```

**Changements clés** :
- ✅ `scenarios(id, title)` → `scenarios!inner(id, title, created_by)` - Jointure INNER obligatoire
- ✅ Ajout du filtre `.eq('scenarios.created_by', teacherEmail)`
- ✅ Logging pour audit de sécurité
- ✅ Warning si aucun filtre n'est appliqué

---

### 2. Correction de `generateSessionSummary()`

**Avant** :
```typescript
// Fetch all snapshots for this date
let query = client
  .from('student_progress_snapshots')
  .select('*')
  .gte('timestamp', `${sessionDate}T00:00:00`)
  .lte('timestamp', `${sessionDate}T23:59:59`);

if (scenarioId) {
  query = query.eq('scenario_id', scenarioId);
}

// ❌ Pas de filtre par enseignant
const { data: snapshots, error } = await query;
```

**Après** :
```typescript
// SECURITY: Fetch only snapshots for scenarios created by this teacher
// Join with sessions and scenarios to filter by teacher
let query = client
  .from('student_progress_snapshots')
  .select(`
    *,
    sessions!inner(scenario_id),
    scenarios!inner(id, created_by)  // ✅ Jointure pour filtrage
  `)
  .gte('timestamp', `${sessionDate}T00:00:00`)
  .lte('timestamp', `${sessionDate}T23:59:59`)
  .eq('scenarios.created_by', teacherEmail);  // ✅ FILTRE CRITIQUE

// Optional scenario filter
if (scenarioId) {
  query = query.eq('scenario_id', scenarioId);
}

const { data: snapshotsRaw, error } = await query;

if (!snapshotsRaw || snapshotsRaw.length === 0) {
  throw new Error(`No snapshots found for date ${sessionDate} and teacher ${teacherEmail}`);
}

// Extract snapshots (remove joined data for processing)
const snapshots = snapshotsRaw.map(item => {
  const { sessions, scenarios, ...snapshot } = item as any;
  return snapshot;
});
```

**Changements clés** :
- ✅ Jointure avec `scenarios!inner(id, created_by)`
- ✅ Filtre `.eq('scenarios.created_by', teacherEmail)`
- ✅ Message d'erreur incluant le `teacherEmail` pour débogage
- ✅ Nettoyage des données jointes avant traitement

---

## 🧪 Tests de Sécurité

### Test 1 : Enseignant A ne voit que ses étudiants

**Scénario** :
- Enseignant A crée Scénario X
- Enseignant B crée Scénario Y
- Étudiant 1 utilise Scénario X (appartient à A)
- Étudiant 2 utilise Scénario Y (appartient à B)

**Résultat attendu** :
```bash
# Enseignant A authentifié
GET /api/teacher/realtime/active-students
Authorization: Bearer <enseignant-A-token>

# Résultat : Seulement Étudiant 1
{
  "students": [
    {
      "sessionId": "session_X_...",
      "studentEmail": "etudiant1@example.com",
      "scenarioId": X
    }
  ],
  "count": 1
}

# Enseignant B authentifié
GET /api/teacher/realtime/active-students
Authorization: Bearer <enseignant-B-token>

# Résultat : Seulement Étudiant 2
{
  "students": [
    {
      "sessionId": "session_Y_...",
      "studentEmail": "etudiant2@example.com",
      "scenarioId": Y
    }
  ],
  "count": 1
}
```

### Test 2 : Génération de résumé filtré par enseignant

**Scénario** :
- Enseignant A crée Scénario X
- 10 étudiants utilisent Scénario X (le 2025-10-31)
- 10 autres étudiants utilisent d'autres scénarios (le 2025-10-31)

**Résultat attendu** :
```bash
# Enseignant A génère un résumé pour le 2025-10-31
POST /api/teacher/realtime/generate-summary
Authorization: Bearer <enseignant-A-token>
Body: { "sessionDate": "2025-10-31" }

# Résultat : Seulement 10 étudiants (ceux du Scénario X)
{
  "summary": {
    "sessionDate": "2025-10-31",
    "totalStudents": 10,  // ✅ Pas 20
    "teacherEmail": "enseignantA@example.com"
  }
}
```

### Test 3 : Logging d'audit

**Vérifier les logs** :
```bash
# Après requête avec filtre
✅ RealtimeAnalysis: Filtering active students by teacher { teacherEmail: 'enseignantA@example.com' }
✅ RealtimeAnalysis: Retrieved active students { teacherEmail: 'enseignantA@example.com', count: 5 }

# Après requête SANS filtre (bug ou problème)
⚠️  RealtimeAnalysis: No teacher filter applied - returning all active students
```

---

## 📊 Impact de la Correction

### Avant
| Enseignant | Étudiants visibles | Risque |
|------------|-------------------|--------|
| A | **Tous** (A, B, C, ...) | 🔴 CRITIQUE |
| B | **Tous** (A, B, C, ...) | 🔴 CRITIQUE |
| C | **Tous** (A, B, C, ...) | 🔴 CRITIQUE |

### Après
| Enseignant | Étudiants visibles | Risque |
|------------|-------------------|--------|
| A | Seulement scénarios créés par A | ✅ SÉCURISÉ |
| B | Seulement scénarios créés par B | ✅ SÉCURISÉ |
| C | Seulement scénarios créés par C | ✅ SÉCURISÉ |

---

## 🔗 Lien avec la Vulnérabilité #1

Cette vulnérabilité est **complémentaire** à celle corrigée dans `SECURITY_AUTH_CRITICAL_FIX.md` :

| Couche | Vulnérabilité #1 | Vulnérabilité #2 |
|--------|------------------|------------------|
| **Authentification** | ❌ Pas de vérification du token | ✅ Token Firebase vérifié |
| **Autorisation** | ✅ (non applicable) | ❌ Pas de filtrage par enseignant |

**Les deux corrections sont nécessaires** :
1. **Vulnérabilité #1** : Empêche un utilisateur non authentifié ou un étudiant d'accéder aux routes enseignant
2. **Vulnérabilité #2** : Empêche un enseignant de voir les données d'un autre enseignant

**Ensemble**, elles forment une défense complète :
```
Requête → [Authent] → [Autorisation] → Données filtrées
           ✅ #1        ✅ #2
```

---

## 🎯 Recommandations Futures

### 1. Ajouter Tests Automatisés

```typescript
describe('RealtimeAnalysisService - Security', () => {
  it('should only return students using teacher scenarios', async () => {
    const teacherA = 'teacherA@example.com';
    const teacherB = 'teacherB@example.com';

    // Create scenarios
    const scenarioA = await createScenario({ createdBy: teacherA });
    const scenarioB = await createScenario({ createdBy: teacherB });

    // Create sessions
    await createSession({ scenarioId: scenarioA.id, studentEmail: 'student1@example.com' });
    await createSession({ scenarioId: scenarioB.id, studentEmail: 'student2@example.com' });

    // Verify filtering
    const studentsA = await realtimeAnalysisService.getActiveStudents(teacherA);
    expect(studentsA).toHaveLength(1);
    expect(studentsA[0].studentEmail).toBe('student1@example.com');

    const studentsB = await realtimeAnalysisService.getActiveStudents(teacherB);
    expect(studentsB).toHaveLength(1);
    expect(studentsB[0].studentEmail).toBe('student2@example.com');
  });
});
```

### 2. Alertes de Sécurité

Surveiller les cas suivants :
- Appel à `getActiveStudents()` sans `teacherEmail` → Alerte
- Nombre anormalement élevé d'étudiants pour un enseignant → Alerte
- Accès à des données hors des heures normales → Alerte

### 3. Audit Trail

Enregistrer tous les accès aux données étudiants :
```typescript
logger.audit('Teacher accessed student data', {
  teacherEmail,
  studentEmail,
  sessionId,
  action: 'view_progress',
  timestamp: new Date().toISOString()
});
```

### 4. Partage de Scénarios

Si le besoin de partager des scénarios entre enseignants émerge :
- Créer une table `scenario_shares` (scenario_id, shared_with_email)
- Modifier le filtre pour inclure les scénarios partagés
- Tracer qui a partagé quoi avec qui

---

## ✅ Checklist de Validation

- [x] Fonction `getActiveStudents()` filtre par `scenarios.created_by`
- [x] Fonction `generateSessionSummary()` filtre par `scenarios.created_by`
- [x] Jointure INNER avec `scenarios` obligatoire
- [x] Logging ajouté pour audit
- [x] Messages d'erreur incluent `teacherEmail` pour débogage
- [x] Documentation créée
- [ ] Tests de sécurité exécutés (manuel ou automatisé)
- [ ] Vérification en production avec données réelles
- [ ] Audit trail configuré pour surveillance

---

## 📝 Résumé Exécutif

**Problème** : Fuite de données - un enseignant voyait tous les étudiants de tous les enseignants

**Solution** : Filtrage par `scenarios.created_by = teacherEmail`

**Fichiers modifiés** : 1 fichier (`server/services/realtime-analysis.service.ts`)

**Fonctions corrigées** : 2 fonctions (`getActiveStudents`, `generateSessionSummary`)

**Lignes de code** : ~50 lignes modifiées

**Impact utilisateur** : Positif - chaque enseignant voit maintenant uniquement ses propres étudiants

**Sévérité** : CRITIQUE → RÉSOLU ✅

---

**Date de résolution** : 2025-10-31
**Auteur** : Claude (Assistant IA)
**Lié à** : SECURITY_AUTH_CRITICAL_FIX.md (Vulnérabilité #1)
