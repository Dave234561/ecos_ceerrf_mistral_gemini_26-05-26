# Guide de Configuration Supabase Realtime

⚠️ **AVERTISSEMENT DE SÉCURITÉ CRITIQUE** ⚠️

**AVANT D'ACTIVER REALTIME, LIRE ABSOLUMENT** : [`SECURITY_RLS_CRITICAL.md`](./SECURITY_RLS_CRITICAL.md)

**État Actuel** :
- ✅ **Polling HTTP** : Fonctionne de manière **sécurisée** (recommandé)
- ❌ **Realtime WebSocket** : **DÉSACTIVÉ** pour des raisons de sécurité

**Pourquoi Realtime est désactivé** :
1. L'application utilise **Firebase Auth**, pas Supabase Auth
2. Les politiques RLS ne peuvent pas utiliser `auth.email()` sans Supabase Auth
3. Activer Realtime avec l'anon key sans RLS approprié = **faille de sécurité critique**

**Options** :
- **Option 1 (Actuelle)** : Utiliser polling HTTP (10s) - **SÉCURISÉ** ✅
- **Option 2 (Avancée)** : Migrer vers Supabase Auth pour Realtime sécurisé
- **Option 3 (Complexe)** : Implémenter WebSocket relay via backend Express

**Pour plus de détails** : Lire [`SECURITY_RLS_CRITICAL.md`](./SECURITY_RLS_CRITICAL.md)

---

Ce guide explique comment activer et configurer Supabase Realtime pour le tableau de bord enseignant temps réel.

## 📋 Prérequis

1. **Projet Supabase** : Un projet Supabase actif
2. **Migration SQL** : Les tables `student_progress_snapshots` et `session_summaries` doivent être créées
3. **Variables d'environnement** : Clés Supabase configurées

---

## Étape 1 : Appliquer la Migration SQL

### Via Supabase Dashboard

1. Connecte-toi à [Supabase Dashboard](https://app.supabase.com)
2. Sélectionne ton projet
3. Menu latéral → **SQL Editor**
4. Clique sur **New Query**
5. Copie le contenu de `migrations/realtime-dashboard-tables.sql`
6. Clique sur **Run** (▶️)

### Vérification

Exécute cette requête pour vérifier que les tables existent :

```sql
SELECT tablename, schemaname
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('student_progress_snapshots', 'session_summaries');
```

Tu devrais voir 2 lignes retournées.

---

## Étape 2 : Activer Supabase Realtime

### Méthode A : Via l'Interface Supabase (Recommandé)

1. **Aller dans Database → Replication**
   - Menu latéral gauche
   - Section **Database**
   - Sous-menu **Replication**

2. **Activer Realtime pour `student_progress_snapshots`**
   - Trouve la table `student_progress_snapshots` dans la liste
   - Clique sur l'icône à droite (ressemble à une publication)
   - Dans le modal qui s'ouvre :
     - ✅ Coche **"Enable Realtime"**
     - Clique sur **Save**

3. **Confirmation**
   - Tu devrais voir un badge "Realtime enabled" sur la table

### Méthode B : Via SQL

Si tu préfères utiliser SQL directement :

```sql
-- Ajouter la table à la publication Realtime
ALTER PUBLICATION supabase_realtime
ADD TABLE student_progress_snapshots;

-- Optionnel : Ajouter aussi session_summaries si tu veux des updates en temps réel
ALTER PUBLICATION supabase_realtime
ADD TABLE session_summaries;
```

### Vérification

Exécute cette requête pour confirmer que Realtime est activé :

```sql
SELECT schemaname, tablename, pubname
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
  AND tablename = 'student_progress_snapshots';
```

Tu devrais voir 1 ligne retournée avec `student_progress_snapshots`.

---

## Étape 3 : Configurer les Variables d'Environnement

### Fichier `.env` (Backend)

Tu as déjà ces variables, mais assure-toi qu'elles sont correctes :

```env
# Supabase Configuration
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Fichier `.env.local` (Frontend - Nouveau)

Crée un fichier `.env.local` à la racine du projet :

```env
# Supabase Frontend Configuration (for Realtime)
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Important** :
- ✅ Utilise la clé **ANON** (publique) pour le frontend, pas la SERVICE_ROLE
- ✅ Préfixe avec `VITE_` pour que Vite expose ces variables au frontend
- ❌ Ne commit **JAMAIS** ce fichier (déjà dans `.gitignore`)

### Où trouver ces valeurs ?

Dans Supabase Dashboard :
1. Menu latéral → **Project Settings** (⚙️)
2. Section **API**
3. Tu trouveras :
   - **Project URL** → `VITE_SUPABASE_URL`
   - **anon public** key → `VITE_SUPABASE_ANON_KEY`

---

## Étape 4 : Installer les Dépendances Supabase (si nécessaire)

Si `@supabase/supabase-js` n'est pas déjà installé :

```bash
npm install @supabase/supabase-js
```

Vérifie dans `package.json` que tu as la version 2.x :

```json
{
  "dependencies": {
    "@supabase/supabase-js": "^2.45.0"
  }
}
```

---

## Étape 5 : Redémarrer l'Application

Après avoir ajouté les variables d'environnement :

```bash
# Arrêter le serveur de dev (Ctrl+C)

# Redémarrer
npm run dev
```

---

## ✅ Vérification du Fonctionnement

### 1. Vérifier les Logs Console

Ouvre la console du navigateur (F12) et va sur l'onglet "Suivi Temps Réel" du dashboard enseignant.

Tu devrais voir :
```
🔌 Setting up Realtime subscription for active students
📡 Realtime subscription status: SUBSCRIBED
```

### 2. Test Manuel

1. **Ouvre deux fenêtres** :
   - Fenêtre 1 : Dashboard enseignant (onglet "Suivi Temps Réel")
   - Fenêtre 2 : Session étudiant (commencer un ECOS)

2. **Envoie des messages** dans la fenêtre étudiant

3. **Observe la fenêtre enseignant** :
   - Tu devrais voir des logs dans la console :
     ```
     📡 Progress snapshot updated, refetching active students
     ```
   - Le tableau devrait se mettre à jour **instantanément** (sans attendre 10 secondes)

### 3. Test SQL Direct

Dans le SQL Editor de Supabase, insère un snapshot manuellement :

```sql
INSERT INTO student_progress_snapshots (
  session_id,
  student_email,
  scenario_id,
  strengths,
  weaknesses,
  exchange_count
) VALUES (
  999,
  'test@example.com',
  5,
  '["Excellente communication"]'::jsonb,
  '["Questions fermées"]'::jsonb,
  5
);
```

Le dashboard enseignant devrait **immédiatement** refetch les données et afficher le nouvel étudiant.

---

## 🔧 Troubleshooting

### Problème : "Supabase client not available for realtime"

**Cause** : Variables d'environnement manquantes

**Solution** :
1. Vérifie que `.env.local` existe avec `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY`
2. Redémarre le serveur de dev
3. Vérifie dans la console :
   ```javascript
   console.log(import.meta.env.VITE_SUPABASE_URL)
   ```
   Ne devrait **pas** être `undefined`

---

### Problème : Subscription status "CHANNEL_ERROR"

**Cause** : Realtime pas activé dans Supabase ou RLS trop restrictif

**Solutions** :
1. Vérifie que Realtime est activé :
   ```sql
   SELECT * FROM pg_publication_tables
   WHERE pubname = 'supabase_realtime';
   ```

2. Vérifie les politiques RLS :
   ```sql
   SELECT * FROM pg_policies
   WHERE tablename = 'student_progress_snapshots';
   ```

3. Désactive temporairement RLS pour tester :
   ```sql
   ALTER TABLE student_progress_snapshots DISABLE ROW LEVEL SECURITY;
   ```
   ⚠️ **Réactive-le après** :
   ```sql
   ALTER TABLE student_progress_snapshots ENABLE ROW LEVEL SECURITY;
   ```

---

### Problème : Pas de mises à jour en temps réel

**Diagnostic** :

1. **Vérifie la console** : Logs `📡` présents ?
2. **Vérifie Network tab** : WebSocket connection active ?
3. **Vérifie Supabase Dashboard → Logs** : Erreurs de connexion ?

**Solutions** :

1. **Fallback sur Polling** :
   - Si Realtime ne fonctionne pas, l'app utilise automatiquement le polling
   - Vérifie que tu vois des requêtes HTTP toutes les 10 secondes (ou 30s avec Realtime)

2. **Forcer Polling** :
   - Commente temporairement les variables `VITE_SUPABASE_*` dans `.env.local`
   - Redémarre l'app
   - Le polling reprendra automatiquement

---

## 📊 Différences Polling vs Realtime

| Aspect | Polling (Sans Realtime) | Realtime (Avec WebSockets) |
|--------|-------------------------|----------------------------|
| **Délai de mise à jour** | 10 secondes | Instantané (<100ms) |
| **Requêtes HTTP** | 1 toutes les 10s | 1 initiale + WebSocket |
| **Charge serveur** | Plus élevée | Plus faible |
| **Complexité** | Simple | Moyenne |
| **Fallback** | N/A | Automatique vers polling |

---

## 🎯 Résumé des Commandes

```bash
# 1. Vérifier les tables
psql $DATABASE_URL -c "SELECT tablename FROM pg_tables WHERE tablename LIKE '%progress%'"

# 2. Activer Realtime via SQL
psql $DATABASE_URL -c "ALTER PUBLICATION supabase_realtime ADD TABLE student_progress_snapshots"

# 3. Vérifier Realtime
psql $DATABASE_URL -c "SELECT * FROM pg_publication_tables WHERE pubname='supabase_realtime'"

# 4. Redémarrer l'app
npm run dev
```

---

## 📚 Ressources

- [Supabase Realtime Documentation](https://supabase.com/docs/guides/realtime)
- [Supabase JS Client](https://supabase.com/docs/reference/javascript/introduction)
- [PostgreSQL Publications](https://www.postgresql.org/docs/current/sql-createpublication.html)

---

## 🚀 Prochaines Étapes

Une fois que Realtime fonctionne :

1. **Tester avec plusieurs étudiants** simultanés
2. **Monitorer les performances** dans Supabase Dashboard → Database → Logs
3. **Ajuster les paramètres** si nécessaire :
   - `eventsPerSecond` dans `supabase-realtime.ts` (actuellement 10)
   - Fréquence de polling de fallback dans `useRealtimeProgress.ts`

---

**Besoin d'aide ?**
- Check les logs Supabase Dashboard
- Vérifie la console navigateur (F12)
- Active le mode debug dans `supabase-realtime.ts` en augmentant les logs
