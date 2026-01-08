# Migration: Ajouter teacher_email à session_summaries

## 🐛 Problème identifié

L'erreur suivante apparaît lors de la génération de synthèses de session:

```
ERROR: 42703: column "teacher_email" does not exist
LINE 2: WHERE teacher_email = 'cherubindavid@gmail.com'
```

## 🔍 Cause

La table `session_summaries` existe dans la base de données mais **ne contient pas la colonne `teacher_email`** qui est requise par le code applicatif.

Cela peut se produire si:
1. La migration initiale (`realtime-dashboard-tables.sql`) n'a jamais été appliquée
2. La table a été créée manuellement sans toutes les colonnes
3. Une migration partielle a été exécutée

## ✅ Solution

Cette migration ajoute la colonne `teacher_email` de manière sécurisée à la table `session_summaries`.

### Caractéristiques de la migration:

- ✅ **Idempotente**: Peut être exécutée plusieurs fois sans erreur
- ✅ **Sécurisée**: Ne supprime pas de données existantes
- ✅ **Non-destructive**: Ajoute uniquement la colonne si elle n'existe pas
- ✅ **Gestion des données existantes**: Met à jour les lignes existantes avec une valeur par défaut

## 📋 Instructions d'application

### Option 1: Via Supabase Dashboard (Recommandé)

1. Connectez-vous à [Supabase Dashboard](https://app.supabase.com)
2. Sélectionnez votre projet `ECOS-infirmier`
3. Allez dans **SQL Editor** (menu de gauche)
4. Créez une nouvelle query (bouton `New query`)
5. Copiez le contenu de `migrations/add-teacher-email-to-session-summaries.sql`
6. Collez-le dans l'éditeur SQL
7. Cliquez sur **Run** (ou Ctrl+Enter)
8. Vérifiez les messages NOTICE pour confirmer le succès

### Option 2: Via psql CLI

```bash
# Depuis le répertoire racine du projet
psql $DATABASE_URL -f migrations/add-teacher-email-to-session-summaries.sql
```

### Option 3: Via script Node.js (si disponible)

```bash
node scripts/apply-migration-supabase.js add-teacher-email-to-session-summaries.sql
```

## ✅ Vérification post-migration

### 1. Vérifier que la colonne existe

Exécutez cette requête SQL dans Supabase Dashboard:

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'session_summaries'
  AND column_name = 'teacher_email';
```

**Résultat attendu:**
```
column_name   | data_type         | is_nullable
teacher_email | character varying | NO
```

### 2. Vérifier les contraintes

```sql
SELECT conname, contype
FROM pg_constraint
WHERE conrelid = 'session_summaries'::regclass
  AND conname LIKE '%teacher_email%';
```

**Résultat attendu:**
```
conname                                                      | contype
session_summaries_session_date_teacher_email_scenario_id_key | u
```

### 3. Tester la génération de synthèse

Depuis l'interface enseignant:
1. Allez sur `/teacher/[votre-email]`
2. Cliquez sur l'onglet "Suivi en temps réel"
3. Descendez à "Synthèse de Session"
4. Sélectionnez la date d'aujourd'hui
5. Cliquez sur "Générer Synthèse"
6. Vérifiez qu'il n'y a plus d'erreur 42703

### 4. Vérifier via API (optionnel)

```bash
# Générer une synthèse
curl -X POST https://ecos-infirmier-b-20.vercel.app/api/teacher/realtime/generate-summary \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_FIREBASE_TOKEN" \
  -d '{
    "sessionDate": "2025-11-03",
    "email": "cherubindavid@gmail.com"
  }'

# Récupérer une synthèse
curl "https://ecos-infirmier-b-20.vercel.app/api/teacher/realtime/summary/2025-11-03?email=cherubindavid@gmail.com" \
  -H "Authorization: Bearer YOUR_FIREBASE_TOKEN"
```

## 📊 Impact de la migration

### Données existantes

Si des synthèses existent déjà dans la table (sans `teacher_email`):
- La migration ajoute automatiquement `teacher_email = 'unknown@system.local'`
- **Action recommandée**: Mettre à jour manuellement avec les vrais emails:

```sql
-- Exemple: Mettre à jour pour votre email
UPDATE session_summaries
SET teacher_email = 'cherubindavid@gmail.com'
WHERE teacher_email = 'unknown@system.local';
```

### Performance

- ⚡ Impact minimal: La migration s'exécute en < 1 seconde
- 📈 Index créé: `idx_summary_teacher` pour optimiser les requêtes
- 🔒 Contrainte UNIQUE: Empêche les doublons (date + teacher + scenario)

## 🚨 Troubleshooting

### Erreur: "Table session_summaries does not exist"

**Solution**: Appliquez d'abord la migration principale:
```bash
psql $DATABASE_URL -f migrations/realtime-dashboard-tables.sql
```

### Erreur de permission

**Solution**: Assurez-vous d'utiliser le service role key de Supabase, pas l'anon key.

### Contrainte UNIQUE violation après migration

**Cause**: Il existe déjà des doublons dans la table.

**Solution**: Nettoyez les doublons avant d'appliquer la contrainte:
```sql
-- Identifier les doublons
SELECT session_date, scenario_id, COUNT(*)
FROM session_summaries
GROUP BY session_date, scenario_id
HAVING COUNT(*) > 1;

-- Supprimer les doublons (garde le plus récent)
DELETE FROM session_summaries a
USING session_summaries b
WHERE a.id < b.id
  AND a.session_date = b.session_date
  AND (a.scenario_id = b.scenario_id OR (a.scenario_id IS NULL AND b.scenario_id IS NULL));
```

## 📝 Notes techniques

### Schéma de la colonne

```sql
teacher_email VARCHAR(255) NOT NULL
```

### Index créé

```sql
CREATE INDEX idx_summary_teacher ON session_summaries(teacher_email);
```

### Contrainte UNIQUE mise à jour

```sql
UNIQUE (session_date, teacher_email, scenario_id)
```

Cette contrainte garantit qu'un enseignant ne peut avoir qu'une seule synthèse par date et par scénario.

## 🔄 Rollback (Annuler la migration)

**⚠️ ATTENTION: Cette action supprime la colonne et toutes ses données!**

```sql
ALTER TABLE session_summaries DROP COLUMN IF EXISTS teacher_email CASCADE;
DROP INDEX IF EXISTS idx_summary_teacher;
```

## 📚 Liens connexes

- Migration principale: `migrations/realtime-dashboard-tables.sql`
- Documentation: `migrations/README-realtime-dashboard.md`
- Service: `server/services/realtime-analysis.service.ts`
- Routes: `server/routes.ts` (lignes 1180-1220)

## ✅ Checklist post-migration

- [ ] Migration appliquée avec succès (messages NOTICE visibles)
- [ ] Colonne `teacher_email` existe et est NOT NULL
- [ ] Index `idx_summary_teacher` créé
- [ ] Contrainte UNIQUE mise à jour
- [ ] Test de génération de synthèse réussi
- [ ] Pas d'erreur 42703 dans les logs
- [ ] Données existantes mises à jour si nécessaire

## 🎯 Prochaines étapes

Après avoir appliqué cette migration:
1. ✅ Le code applicatif fonctionnera correctement
2. ✅ La génération de synthèses ne produira plus d'erreur
3. ✅ Les enseignants verront leurs propres synthèses
4. ⏳ Optionnel: Mettre à jour les données existantes avec les vrais emails

## 💡 Support

Si vous rencontrez des problèmes:
1. Vérifiez les logs Supabase Dashboard → Logs
2. Consultez les messages NOTICE de la migration
3. Vérifiez le schéma avec `\d+ session_summaries` (via psql)
4. Consultez le code applicatif pour comprendre l'utilisation
