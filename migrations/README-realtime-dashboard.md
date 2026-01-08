# Migration : Tableau de Bord Enseignant Temps Réel

## Vue d'ensemble

Cette migration ajoute les tables nécessaires pour le tableau de bord enseignant avec suivi en temps réel des performances des étudiants pendant les sessions ECOS.

## Tables créées

### 1. `student_progress_snapshots`
Stocke des snapshots périodiques de la progression des étudiants pendant les sessions ECOS.

**Colonnes clés:**
- `session_id`: Référence à la session ECOS
- `student_email`: Email de l'étudiant
- `strengths`: Array JSON des points forts identifiés
- `weaknesses`: Array JSON des points faibles identifiés
- `progress_indicators`: Métriques de progression (engagement, qualité questions, etc.)
- `exchange_count`: Nombre d'échanges au moment du snapshot
- `status`: 'in_progress' ou 'completed'

### 2. `session_summaries`
Stocke les synthèses agrégées des sessions d'enseignement.

**Colonnes clés:**
- `session_date`: Date de la session
- `teacher_email`: Email de l'enseignant
- `total_students`: Nombre total d'étudiants
- `common_strengths`: Points forts récurrents dans la classe
- `common_weaknesses`: Points faibles récurrents
- `trends`: Tendances observées

## Instructions d'application

### Étape 1 : Appliquer la migration SQL

#### Option A : Via Supabase Dashboard (Recommandé)
1. Connectez-vous à [Supabase Dashboard](https://app.supabase.com)
2. Sélectionnez votre projet
3. Allez dans **SQL Editor** (menu de gauche)
4. Créez une nouvelle query
5. Copiez le contenu de `realtime-dashboard-tables.sql`
6. Exécutez la query

#### Option B : Via CLI Supabase
```bash
# Si vous avez supabase CLI installé
supabase db push

# Ou appliquer manuellement
psql $DATABASE_URL < migrations/realtime-dashboard-tables.sql
```

#### Option C : Via script Node.js
```bash
node scripts/apply-migration-supabase.js realtime-dashboard-tables.sql
```

### Étape 2 : Activer Supabase Realtime

**Important**: Cette étape doit être faite dans le Supabase Dashboard.

1. Allez dans **Database** → **Replication** (menu de gauche)
2. Trouvez la table `student_progress_snapshots`
3. Activez **Realtime** pour cette table
   - Cochez la case "Enable Realtime"
   - Cliquez sur "Save"

**Alternative via SQL** (si vous avez les permissions):
```sql
ALTER PUBLICATION supabase_realtime ADD TABLE student_progress_snapshots;
```

### Étape 3 : Vérifier l'installation

Exécutez ces requêtes pour vérifier que tout fonctionne:

```sql
-- Vérifier que les tables existent
SELECT tablename FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('student_progress_snapshots', 'session_summaries');

-- Vérifier que Realtime est activé
SELECT schemaname, tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime';

-- Tester l'insertion d'un snapshot
INSERT INTO student_progress_snapshots (
  session_id, student_email, scenario_id, strengths, weaknesses, exchange_count
) VALUES (
  1, 'test@example.com', 5,
  '["Bonne communication", "Empathie"]'::jsonb,
  '["Questions fermées"]'::jsonb,
  3
);

-- Récupérer les snapshots
SELECT * FROM student_progress_snapshots ORDER BY timestamp DESC LIMIT 5;
```

## Structure des données

### Exemple de snapshot
```json
{
  "id": 1,
  "session_id": 123,
  "student_email": "student@example.com",
  "scenario_id": 5,
  "timestamp": "2025-10-30T14:30:00Z",
  "strengths": [
    "Excellente communication empathique",
    "Bonnes questions ouvertes",
    "Écoute active démontrée"
  ],
  "weaknesses": [
    "Manque d'examen physique systématique",
    "Oubli de vérifier les allergies"
  ],
  "progress_indicators": {
    "engagement_score": 0.85,
    "question_quality": 0.78,
    "empathy_level": 0.92
  },
  "exchange_count": 8,
  "status": "in_progress"
}
```

### Exemple de synthèse de session
```json
{
  "id": 1,
  "session_date": "2025-10-30",
  "teacher_email": "teacher@example.com",
  "scenario_id": 5,
  "total_students": 25,
  "summary_data": {
    "average_exchanges": 12.4,
    "completion_rate": 0.96,
    "average_duration_minutes": 18.5
  },
  "common_strengths": [
    "Communication empathique généralement bonne",
    "Bonne gestion du temps",
    "Questions pertinentes"
  ],
  "common_weaknesses": [
    "Manque d'examen physique systématique (60% des étudiants)",
    "Oubli des antécédents familiaux (40%)",
    "Pas de plan de traitement clair (35%)"
  ],
  "trends": {
    "improvement_areas": ["examen_physique", "anamnese_complete"],
    "strong_areas": ["communication", "empathie"],
    "time_trend": "stable"
  }
}
```

## Politique de rétention des données

### Snapshots
- **Conservation**: 90 jours
- **Raison**: Permettre l'analyse historique des progressions
- **Nettoyage automatique**: À implémenter via cron job

```sql
-- Exemple de requête de nettoyage (à exécuter périodiquement)
DELETE FROM student_progress_snapshots
WHERE timestamp < NOW() - INTERVAL '90 days';
```

### Synthèses
- **Conservation**: Illimitée
- **Raison**: Données agrégées utiles pour analyse long terme

## Sécurité et Permissions

### RLS (Row Level Security)
Les politiques RLS ont été configurées pour:
- Permettre aux enseignants de voir tous les snapshots (TODO: restreindre aux sessions dont ils sont responsables)
- Permettre au système backend d'insérer/mettre à jour les snapshots
- Permettre aux enseignants de voir leurs propres synthèses

### Permissions recommandées

Pour production, modifiez les politiques RLS:

```sql
-- Restreindre l'accès aux enseignants authentifiés uniquement
DROP POLICY "Teachers can view all progress snapshots" ON student_progress_snapshots;

CREATE POLICY "Teachers can view progress snapshots"
  ON student_progress_snapshots
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM training_sessions ts
      WHERE ts.created_by = auth.email()
        AND ts.id IN (
          SELECT training_session_id FROM sessions
          WHERE sessions.id = student_progress_snapshots.session_id
        )
    )
  );
```

## Troubleshooting

### Realtime ne fonctionne pas
1. Vérifier que Realtime est activé dans Supabase Dashboard
2. Vérifier la connexion WebSocket dans les DevTools (Network tab)
3. Vérifier les logs Supabase pour erreurs de permissions

### Snapshots non créés
1. Vérifier que le service `RealtimeAnalysisService` est actif
2. Vérifier les logs backend pour erreurs d'insertion
3. Vérifier les permissions RLS

### Performances lentes
1. Vérifier les index (déjà créés dans la migration)
2. Limiter le nombre de snapshots par session (recommandé: 1 snapshot toutes les 3-5 échanges)
3. Nettoyer les vieux snapshots régulièrement

## Statut d'implémentation

### ✅ Phases complétées

1. **Phase 1 : Infrastructure Base de Données** ✅
   - Tables `student_progress_snapshots` et `session_summaries` créées
   - Index optimisés pour performance
   - Politiques RLS configurées

2. **Phase 2 : Services Backend** ✅
   - `RealtimeAnalysisService` implémenté avec analyse IA
   - Snapshots créés automatiquement tous les 3 échanges
   - Génération automatique de synthèses avec OpenAI (gpt-4o-mini)
   - Fallback heuristique en cas d'échec IA

3. **Phase 3 : Composants Frontend** ✅
   - `RealtimeDashboard` : Vue d'ensemble des étudiants actifs
   - `StudentProgressCard` : Vue détaillée d'un étudiant avec historique
   - `SessionSummaryView` : Synthèse agrégée avec tendances
   - Intégration dans page enseignant (onglet "Suivi Temps Réel")

4. **Phase 5 : Génération Automatique de Synthèses** ✅
   - Analyse IA des patterns communs
   - Agrégation des indicateurs de progression
   - Calcul des tendances moyennes
   - Stockage avec upsert pour mises à jour

### ⏳ Phase optionnelle

**Phase 4 : Supabase Realtime WebSockets** (Non implémenté)
- **Raison** : Polling toutes les 10 secondes via TanStack Query déjà implémenté
- **Avantages polling** : Plus simple, plus fiable, adéquat pour ce cas d'usage
- **Si besoin** : WebSockets peuvent être ajoutés ultérieurement sans modifications majeures

## Architecture Technique

### Backend : Analyse en Temps Réel

**Service : `server/services/realtime-analysis.service.ts`**

Fonctionnement :
1. **Déclenchement automatique** : Après chaque message de l'étudiant
2. **Analyse périodique** : Tous les 3 échanges (configurable)
3. **Analyse IA** : OpenAI gpt-4o-mini pour rapidité/coût
4. **Création snapshot** : Stockage dans `student_progress_snapshots`
5. **Non-bloquant** : Fire-and-forget, échec n'affecte pas l'étudiant

Méthodes principales :
```typescript
analyzeSessionProgress(sessionId, options?)  // Analyse et crée snapshot
finalizeSession(sessionId)                   // Snapshot final
generateSessionSummary(date, teacher, scenario?) // Synthèse globale
getActiveStudents(teacherEmail)              // Liste étudiants actifs
```

### API Routes

**Endpoints disponibles :**

```
GET  /api/teacher/realtime/active-students?email={teacherEmail}
     → Retourne liste des étudiants actifs avec dernier snapshot

GET  /api/teacher/realtime/student-progress/:sessionId?email={teacherEmail}
     → Retourne historique complet des snapshots d'un étudiant

POST /api/teacher/realtime/generate-summary
     Body: { email, sessionDate, scenarioId? }
     → Génère synthèse IA pour une date donnée

GET  /api/teacher/realtime/summary/:sessionDate?email={teacherEmail}&scenarioId={id}
     → Récupère synthèse existante
```

### Frontend : Composants React

**Hooks TanStack Query** (`client/src/hooks/useRealtimeProgress.ts`):
```typescript
useActiveStudents(teacherEmail)           // Poll every 10s
useStudentProgress(sessionId, teacherEmail) // Poll every 10s
useGenerateSessionSummary(teacherEmail)   // Mutation
useSessionSummary(sessionDate, teacherEmail) // Static
```

**Composants** :
- `RealtimeDashboard` : Tableau avec filtres, stats, étudiants actifs
- `StudentProgressCard` : Détail individuel avec timeline
- `SessionSummaryView` : Vue synthèse avec génération manuelle

**Intégration** :
- Page enseignant : `/teacher/:email`
- Onglet "Suivi Temps Réel"
- Mise à jour automatique toutes les 10 secondes

## Guide d'utilisation

### Pour les enseignants

1. **Suivi en temps réel** :
   - Aller sur page enseignant
   - Cliquer sur onglet "Suivi Temps Réel"
   - Voir les étudiants actifs avec progression
   - Cliquer sur "👁" pour voir détails d'un étudiant

2. **Génération de synthèse** :
   - Dans même onglet, descendre à "Synthèse de Session"
   - Sélectionner une date
   - Cliquer "Générer Synthèse"
   - Voir points forts/faibles récurrents et tendances

3. **Lecture des indicateurs** :
   - **Engagement** : Niveau d'interaction de l'étudiant
   - **Qualité Questions** : Pertinence des questions
   - **Empathie** : Niveau d'empathie démontré
   - **Raisonnement Clinique** : Qualité du raisonnement

### Pour les développeurs

**Intégration dans nouvelle page** :
```typescript
import { RealtimeDashboard } from '@/components/teacher/realtime/RealtimeDashboard';

function MyPage() {
  return (
    <RealtimeDashboard
      teacherEmail="teacher@example.com"
      onViewDetails={(student) => console.log(student)}
    />
  );
}
```

**Déclencher analyse manuelle** :
```typescript
import { realtimeAnalysisService } from './services/realtime-analysis.service';

// Forcer snapshot
await realtimeAnalysisService.analyzeSessionProgress(sessionId, {
  forceSnapshot: true
});

// Finaliser session
await realtimeAnalysisService.finalizeSession(sessionId);
```

## Configuration

### Paramètres ajustables

Dans `server/services/realtime-analysis.service.ts` :
```typescript
SNAPSHOT_INTERVAL = 3;              // Snapshots tous les N échanges
MIN_EXCHANGES_FOR_ANALYSIS = 2;    // Minimum avant première analyse
CACHE_DURATION_MS = 5 * 60 * 1000; // Durée cache (5 min)
```

Dans `client/src/hooks/useRealtimeProgress.ts` :
```typescript
refetchInterval: 10000,  // Polling toutes les 10 secondes
staleTime: 5000         // Données considérées fraîches 5 secondes
```

## Next Steps

Après application de cette migration:
1. ✅ Tables créées
2. ⏳ Realtime activé (optionnel, polling déjà en place)
3. ✅ `RealtimeAnalysisService` implémenté
4. ✅ Routes API créées
5. ✅ Composants frontend créés
6. ✅ Génération automatique de synthèses

## Support

Pour toute question ou problème avec cette migration:
- Consulter les logs Supabase Dashboard → Logs
- Vérifier le schéma avec `\d+ student_progress_snapshots` (via psql)
- Tester les endpoints API avec curl ou Postman
- Vérifier les DevTools Network tab pour polling TanStack Query
- Contacter l'équipe de développement
