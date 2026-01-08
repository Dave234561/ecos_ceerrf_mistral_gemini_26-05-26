# 🚀 Guide de Déploiement Pas à Pas - Tableau de Bord Temps Réel

Ce guide t'accompagne **étape par étape** pour déployer le tableau de bord enseignant temps réel en production.

---

## 📋 Vue d'Ensemble

**Durée totale estimée** : 20-30 minutes

**Étapes** :
1. ✅ Préparation (5 min)
2. 🗄️ Appliquer migrations SQL (5 min)
3. 🧪 Tests de sécurité (5 min)
4. ✅ Tests fonctionnels (10 min)
5. 📊 Vérification finale (5 min)

---

## Étape 1 : Préparation (5 minutes)

### 1.1 Vérifier l'Accès Supabase

1. **Ouvrir Supabase Dashboard**
   - Va sur https://app.supabase.com
   - Connecte-toi avec ton compte
   - Sélectionne ton projet ECOS-infirmierB

2. **Vérifier les Credentials**
   ```bash
   # Vérifier que tu as ces valeurs dans ton .env
   cat .env | grep SUPABASE
   ```

   Tu devrais voir :
   ```
   SUPABASE_URL=https://xxx.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=eyJ...
   SUPABASE_ANON_KEY=eyJ...
   ```

3. **Tester la Connexion**
   - Dans Supabase Dashboard
   - Menu latéral → **Database**
   - Tu devrais voir la liste des tables existantes

✅ **Checkpoint** : Tu peux voir les tables dans Supabase ? Continue.

---

## Étape 2 : Appliquer les Migrations SQL (5 minutes)

### 2.1 Migration 1 : Créer les Tables

1. **Ouvrir SQL Editor**
   - Dans Supabase Dashboard
   - Menu latéral → **SQL Editor**
   - Cliquer sur **New Query** (bouton en haut à droite)

2. **Copier la Migration**
   ```bash
   # Dans ton terminal, afficher le contenu
   cat migrations/realtime-dashboard-tables.sql
   ```

3. **Coller dans SQL Editor**
   - Sélectionner TOUT le contenu du fichier
   - Le copier (Ctrl+C / Cmd+C)
   - Le coller dans SQL Editor (Ctrl+V / Cmd+V)

4. **Exécuter**
   - Cliquer sur **Run** (▶️) en bas à droite
   - Attendre l'exécution (~5 secondes)

5. **Vérifier le Résultat**

   Tu devrais voir en bas :
   ```
   Success. No rows returned
   ```

   Ou des messages de confirmation pour chaque table créée.

✅ **Checkpoint** : Exécution réussie ? Continue.

### 2.2 Migration 2 : Sécuriser avec RLS

1. **Nouvelle Query**
   - Dans SQL Editor, cliquer sur **New Query**

2. **Copier la Migration de Sécurité**
   ```bash
   cat migrations/fix-rls-security.sql
   ```

3. **Coller et Exécuter**
   - Même processus que précédemment
   - Copier tout le contenu
   - Coller dans SQL Editor
   - Cliquer **Run** (▶️)

4. **Vérifier les Messages**

   Tu devrais voir à la fin :
   ```
   ✅ RLS is enabled on both tables
   ```

   Puis un tableau listant toutes les politiques créées.

✅ **Checkpoint** : Tu vois "RLS is enabled" ? Continue.

### 2.3 Vérification Visuelle

1. **Aller dans Database → Tables**
   - Menu latéral → **Database** → **Tables**

2. **Chercher les Nouvelles Tables**

   Tu devrais voir :
   - ✅ `student_progress_snapshots`
   - ✅ `session_summaries`

3. **Vérifier RLS**
   - Cliquer sur `student_progress_snapshots`
   - En haut, tu devrais voir un badge **"RLS enabled"**

✅ **Checkpoint** : Les 2 tables existent avec RLS ? Continue.

---

## Étape 3 : Tests de Sécurité (5 minutes)

### 3.1 Test 1 : Vérifier que RLS Bloque l'Anon Key

1. **Récupérer l'Anon Key**
   - Dans Supabase Dashboard
   - Menu **Project Settings** (⚙️ en bas)
   - Section **API**
   - Copier **anon public** key

2. **Tester via SQL Editor**

   Dans SQL Editor, nouvelle query :
   ```sql
   -- Simuler une requête avec anon key
   SET ROLE anon;
   SELECT * FROM student_progress_snapshots LIMIT 1;
   RESET ROLE;
   ```

   **Résultat attendu** : 0 lignes retournées

   ✅ C'est normal ! RLS bloque l'accès.

### 3.2 Test 2 : Vérifier que Service Role Fonctionne

Dans SQL Editor :
```sql
-- Cette requête utilise automatiquement service_role dans le dashboard
SELECT COUNT(*) FROM student_progress_snapshots;
```

**Résultat attendu** :
```
count
-----
  0
```

✅ Ça fonctionne ! (0 car aucune donnée encore, mais pas d'erreur RLS)

### 3.3 Test 3 : Vérifier les Politiques RLS

Dans SQL Editor :
```sql
SELECT
  tablename,
  policyname,
  cmd,
  qual
FROM pg_policies
WHERE tablename IN ('student_progress_snapshots', 'session_summaries')
ORDER BY tablename, policyname;
```

**Résultat attendu** : Tu devrais voir 8 politiques listées, toutes avec `qual` contenant `false`.

✅ **Checkpoint** : 8 politiques visibles ? Continue.

---

## Étape 4 : Tests Fonctionnels (10 minutes)

### 4.1 Démarrer l'Application en Local

```bash
# Dans ton terminal, à la racine du projet
npm run dev
```

Attendre que le serveur démarre :
```
VITE v5.4.19  ready in 1234 ms
➜  Local:   http://localhost:5173/
```

### 4.2 Tester le Dashboard Enseignant

1. **Ouvrir le Dashboard**
   - Ouvrir http://localhost:5173
   - Se connecter avec un compte enseignant
   - Exemple : `cherubindavid@gmail.com`

2. **Aller sur l'Onglet Temps Réel**
   - Cliquer sur **"Suivi Temps Réel"**
   - Tu devrais voir :
     ```
     Aucun étudiant actif pour le moment

     Les étudiants apparaîtront ici dès qu'ils commenceront une session ECOS
     ```

✅ **Checkpoint** : L'onglet s'affiche sans erreur ? Continue.

### 4.3 Tester avec une Session Étudiant

1. **Ouvrir une 2ème Fenêtre/Onglet**
   - Aller sur http://localhost:5173
   - Se connecter comme étudiant (adresse différente)
   - Exemple : `etudiant@example.com`

2. **Démarrer une Session ECOS**
   - Choisir un scénario
   - Cliquer **"Commencer la consultation"**

3. **Envoyer 3-4 Messages**
   - Envoyer des messages au patient virtuel
   - Exemple :
     - "Bonjour, comment vous sentez-vous ?"
     - "Avez-vous des douleurs ?"
     - "Depuis quand ?"

4. **Retourner sur le Dashboard Enseignant**
   - Attendre ~10 secondes
   - Le tableau devrait se rafraîchir automatiquement
   - L'étudiant devrait apparaître !

**Tu devrais voir** :
```
┌──────────────────────┬──────────┬────────────┬──────────┬─────────────┐
│ Étudiant             │ Scénario │ Engagement │ Échanges │ Actions     │
├──────────────────────┼──────────┼────────────┼──────────┼─────────────┤
│ etudiant@example.com │ Scénario │   Moyen    │    3     │    👁️      │
└──────────────────────┴──────────┴────────────┴──────────┴─────────────┘
```

✅ **Checkpoint** : L'étudiant apparaît ? Continue.

### 4.4 Tester les Détails Étudiant

1. **Cliquer sur l'icône 👁️** à droite de l'étudiant

2. **Vérifier les Indicateurs**

   Tu devrais voir :
   - 📊 Indicateurs de progression (barres colorées)
   - ✅ Points forts actuels (liste verte)
   - ⚠️ Points à améliorer (liste rouge)
   - 🕐 Historique de progression (timeline)

3. **Tester l'Auto-Refresh**
   - Retourner sur la fenêtre étudiant
   - Envoyer 2-3 nouveaux messages
   - Attendre ~10 secondes
   - Les détails devraient se mettre à jour automatiquement

✅ **Checkpoint** : Les détails s'affichent et se mettent à jour ? Continue.

### 4.5 Tester la Synthèse de Session

1. **Retourner sur le Dashboard (vue globale)**
   - Cliquer sur "← Retour au tableau de bord"

2. **Descendre vers "Synthèse de Session"**

3. **Sélectionner la Date d'Aujourd'hui**
   - La date devrait déjà être pré-remplie

4. **Cliquer "Générer Synthèse"**
   - Attendre ~5-10 secondes (analyse IA en cours)
   - Une synthèse devrait s'afficher avec :
     - 📊 Total étudiants : 1
     - 📈 Tendances moyennes
     - ✅ Points forts récurrents
     - ⚠️ Points faibles récurrents

✅ **Checkpoint** : La synthèse se génère ? Continue.

---

## Étape 5 : Vérification Finale (5 minutes)

### 5.1 Vérifier les Logs Console

1. **Ouvrir DevTools** (F12)
2. **Aller sur l'onglet Console**
3. **Vérifier qu'il n'y a PAS** :
   - ❌ Erreurs rouges
   - ❌ Warnings sur RLS
   - ❌ Failed to fetch

4. **Tu devrais voir** :
   - ✅ Requêtes HTTP toutes les 10 secondes
   - ✅ Logs normaux de React Query

### 5.2 Vérifier les Logs Supabase

1. **Dans Supabase Dashboard**
   - Menu **Logs** → **Postgres Logs**

2. **Chercher les dernières requêtes**
   - Tu devrais voir des requêtes sur `student_progress_snapshots`
   - Pas d'erreurs RLS (si erreurs, c'est normal si tentatives bloquées)

3. **Vérifier API Logs** (optionnel)
   - Menu **Logs** → **API**
   - Tu devrais voir des GET requests

### 5.3 Test de Charge Léger

1. **Ouvrir 2-3 Onglets Dashboard Enseignant**
   - Tous avec le même compte
   - Tous sur "Suivi Temps Réel"

2. **Vérifier que ça reste fluide**
   - Pas de lag
   - Mises à jour synchronisées

3. **Fermer les onglets supplémentaires**

✅ **Checkpoint** : Tout fonctionne sans erreur ? Continue.

---

## 🎉 Félicitations !

**Le système est maintenant opérationnel !** 🚀

### Ce qui Fonctionne

✅ **Dashboard Temps Réel**
- Affichage des étudiants actifs
- Mise à jour automatique toutes les 10 secondes
- Indicateurs de progression en temps réel

✅ **Détails Étudiant**
- Vue détaillée avec timeline
- Points forts/faibles identifiés
- Historique complet

✅ **Synthèses de Session**
- Génération automatique avec IA
- Analyse des tendances de classe
- Points récurrents identifiés

✅ **Sécurité**
- RLS activé et vérifié
- Accès directs bloqués
- Architecture multicouche

---

## 🚀 Prochaines Étapes

### Pour Déployer en Production

1. **Appliquer les Mêmes Migrations** sur la base de données de production
   - Même processus que ci-dessus
   - Utiliser Supabase Dashboard de production

2. **Vérifier les Variables d'Environnement** sur Vercel
   ```
   DATABASE_URL=...
   SUPABASE_URL=...
   SUPABASE_SERVICE_ROLE_KEY=...
   OPENAI_API_KEY=...
   ```

3. **Déployer via Git**
   ```bash
   git push origin main
   ```

4. **Tester en Production**
   - Répéter les tests fonctionnels
   - Vérifier les logs Vercel
   - Monitorer Supabase

### Monitoring Continu

1. **Quotidien**
   - Vérifier logs Supabase (erreurs ?)
   - Vérifier logs Vercel (erreurs backend ?)

2. **Hebdomadaire**
   - Review métriques performance
   - Vérifier charge serveur

3. **Mensuel**
   - Audit politiques RLS
   - Optimiser si nécessaire

---

## 🆘 En Cas de Problème

### Problème : "Table already exists"

**Solution** :
```sql
-- Supprimer les tables existantes
DROP TABLE IF EXISTS student_progress_snapshots CASCADE;
DROP TABLE IF EXISTS session_summaries CASCADE;

-- Réappliquer la migration
-- (copier/coller realtime-dashboard-tables.sql)
```

### Problème : "RLS policy already exists"

**Erreur** :
```
ERROR: 42710: policy "block_anon_select_snapshots" for table "student_progress_snapshots" already exists
```

**Cause** : Des politiques d'une migration précédente existent déjà.

**Solution** :

**Étape 1 : Nettoyer les Politiques Existantes**
```bash
# Dans SQL Editor de Supabase
# Copier/coller le contenu de migrations/cleanup-existing-policies.sql
cat migrations/cleanup-existing-policies.sql
```

Ou directement dans SQL Editor :
```sql
-- Supprimer TOUTES les anciennes politiques
DROP POLICY IF EXISTS "Teachers can view all progress snapshots" ON student_progress_snapshots;
DROP POLICY IF EXISTS "System can insert progress snapshots" ON student_progress_snapshots;
DROP POLICY IF EXISTS "System can update progress snapshots" ON student_progress_snapshots;
DROP POLICY IF EXISTS "block_anon_select_snapshots" ON student_progress_snapshots;
DROP POLICY IF EXISTS "block_anon_insert_snapshots" ON student_progress_snapshots;
DROP POLICY IF EXISTS "block_anon_update_snapshots" ON student_progress_snapshots;
DROP POLICY IF EXISTS "block_anon_delete_snapshots" ON student_progress_snapshots;

-- Même chose pour session_summaries
DROP POLICY IF EXISTS "Teachers can view their summaries" ON session_summaries;
DROP POLICY IF EXISTS "System can insert session summaries" ON session_summaries;
DROP POLICY IF EXISTS "System can update session summaries" ON session_summaries;
DROP POLICY IF EXISTS "block_anon_select_summaries" ON session_summaries;
DROP POLICY IF EXISTS "block_anon_insert_summaries" ON session_summaries;
DROP POLICY IF EXISTS "block_anon_update_summaries" ON session_summaries;
DROP POLICY IF EXISTS "block_anon_delete_summaries" ON session_summaries;

-- Vérifier que tout est supprimé
SELECT policyname FROM pg_policies
WHERE tablename IN ('student_progress_snapshots', 'session_summaries');
-- Devrait retourner 0 lignes
```

**Étape 2 : Réappliquer la Migration Corrigée**
```bash
# Copier/coller migrations/realtime-dashboard-tables.sql
# Cela recréera les 8 politiques sécurisées
```

### Problème : "Permission denied"

**Solution** :
1. Vérifier que tu utilises le **service_role** key (pas anon)
2. Vérifier dans Supabase → Settings → API
3. Copier la bonne clé dans `.env`

### Problème : "Aucun étudiant n'apparaît"

**Vérifications** :
1. L'étudiant a bien envoyé 3+ messages ?
2. Attendre 10 secondes (délai de polling)
3. Vérifier console : Erreurs ?
4. Vérifier Network tab : Requêtes HTTP ?

### Problème : "Erreur 500 sur API"

**Vérifications** :
1. Backend démarré ? (`npm run dev`)
2. `.env` correctement configuré ?
3. Logs backend : `console.log` visible ?
4. Supabase accessible ?

---

## 📞 Besoin d'Aide ?

**Fichiers de Référence** :
- `SECURITY_RLS_CRITICAL.md` - Sécurité complète
- `ARCHITECTURE_DECISION.md` - Architecture technique
- `migrations/README-realtime-dashboard.md` - Détails techniques

**Tests à Faire** :
```bash
# Test connexion Supabase
curl https://ton-projet.supabase.co/rest/v1/student_progress_snapshots \
  -H "apikey: ton_service_role_key"

# Test API backend
curl http://localhost:5000/api/teacher/realtime/active-students?email=teacher@example.com

# Vérifier tables
psql $DATABASE_URL -c "\dt student_progress*"
```

---

## ✅ Checklist Finale

Avant de considérer le déploiement terminé :

- [ ] ✅ Migration 1 appliquée (tables créées)
- [ ] ✅ Migration 2 appliquée (RLS sécurisé)
- [ ] ✅ Test sécurité : anon key bloquée
- [ ] ✅ Test fonctionnel : étudiant apparaît
- [ ] ✅ Test détails : timeline visible
- [ ] ✅ Test synthèse : génération réussie
- [ ] ✅ Pas d'erreurs dans console
- [ ] ✅ Pas d'erreurs dans logs Supabase
- [ ] ✅ Auto-refresh fonctionne (10s)
- [ ] 📚 Documentation lue et comprise

---

**Prêt pour la production !** 🚀

Des questions ou blocages sur une étape particulière ? Je suis là pour t'aider !
