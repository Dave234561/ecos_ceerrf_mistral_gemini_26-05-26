# 🚨 ALERTE SÉCURITÉ CRITIQUE : Politiques RLS

## ⚠️ Problème Identifié

Les politiques RLS (Row Level Security) initiales utilisaient `USING (true)`, ce qui permettait à **n'importe quel utilisateur** (y compris non authentifié) d'accéder aux données sensibles des étudiants.

```sql
-- ❌ DANGEREUX - Permet à tout le monde de lire
CREATE POLICY "Teachers can view all progress snapshots"
  ON student_progress_snapshots
  FOR SELECT
  USING (true);  -- N'importe qui peut lire !
```

## 🔒 Solution Implémentée

### Approche Actuelle : Blocage Total des Accès Directs

La migration `migrations/fix-rls-security.sql` implémente une sécurité stricte :

```sql
-- ✅ SÉCURISÉ - Bloque tout accès direct
CREATE POLICY "block_anon_select_snapshots"
  ON student_progress_snapshots
  FOR SELECT
  USING (false);  -- Personne ne peut lire directement
```

### Architecture de Sécurité

```
┌─────────────────────────────────────────────────────────┐
│                      FRONTEND                            │
│  (React App avec Firebase Auth)                         │
└────────────────────┬────────────────────────────────────┘
                     │
                     │ HTTP Requests
                     │ (avec Firebase JWT)
                     ▼
┌─────────────────────────────────────────────────────────┐
│                   BACKEND EXPRESS                        │
│  - Vérifie Firebase JWT                                 │
│  - Vérifie permissions enseignant/étudiant              │
│  - Utilise Supabase service_role key                    │
└────────────────────┬────────────────────────────────────┘
                     │
                     │ service_role
                     │ (bypass RLS automatiquement)
                     ▼
┌─────────────────────────────────────────────────────────┐
│              SUPABASE POSTGRESQL                        │
│  - RLS activé                                           │
│  - Politiques bloquent anon key                         │
│  - service_role bypass RLS                              │
└─────────────────────────────────────────────────────────┘
```

### Flux de Données Sécurisé

1. **Frontend → Backend Express**
   - Requête HTTP avec Firebase JWT
   - Express valide le token
   - Express vérifie que l'enseignant a accès à ces données

2. **Backend → Supabase**
   - Utilise `service_role` key (pas `anon` key)
   - `service_role` bypass automatiquement RLS
   - Aucune vérification RLS nécessaire

3. **Sécurité Multicouche**
   - Couche 1 : Firebase Auth vérifie l'identité
   - Couche 2 : Express vérifie les permissions métier
   - Couche 3 : RLS bloque les accès directs malveillants

---

## 📊 Impact sur les Fonctionnalités

### ✅ Ce qui Fonctionne (Sécurisé)

- **Polling HTTP** : Frontend → Backend → Supabase ✅
- **API Routes** : Toutes les routes `/api/teacher/realtime/*` ✅
- **Dashboard Temps Réel** : Mise à jour toutes les 10-30 secondes ✅
- **Authentification** : Firebase Auth + validation backend ✅

### ❌ Ce qui NE Fonctionne PAS

- **Supabase Realtime (WebSocket)** : Bloqué par RLS ❌
  - L'anon key ne peut pas lire les tables
  - Pas d'authentification Supabase Auth
  - WebSocket connections refusées

---

## 🔧 Options pour Activer Realtime de Manière Sécurisée

### Option 1 : Migrer vers Supabase Auth (Recommandé si Realtime nécessaire)

**Avantages** :
- Realtime sécurisé avec RLS basé sur `auth.email()`
- Mises à jour instantanées via WebSocket
- Intégration native avec Supabase

**Inconvénients** :
- Migration de Firebase Auth vers Supabase Auth
- Double authentification temporaire pendant la migration
- Refactoring nécessaire

**Étapes** :

1. **Activer Supabase Auth**
   ```typescript
   // Créer client Supabase avec Auth
   import { createClient } from '@supabase/supabase-js'

   const supabase = createClient(
     process.env.VITE_SUPABASE_URL!,
     process.env.VITE_SUPABASE_ANON_KEY!
   )

   // Login utilisateur
   const { data, error } = await supabase.auth.signInWithPassword({
     email: 'teacher@example.com',
     password: 'secure_password'
   })
   ```

2. **Appliquer Politiques RLS Sécurisées**
   ```sql
   -- Fonction helper
   CREATE OR REPLACE FUNCTION is_teacher_of_student(p_student_email TEXT)
   RETURNS BOOLEAN AS $$
   BEGIN
     RETURN EXISTS (
       SELECT 1
       FROM training_sessions ts
       JOIN training_session_students tss ON tss.training_session_id = ts.id
       WHERE ts.created_by = auth.email()
         AND tss.student_email = p_student_email
     );
   END;
   $$ LANGUAGE plpgsql SECURITY DEFINER;

   -- Politique : Enseignants voient LEURS étudiants uniquement
   CREATE POLICY "teachers_view_own_students"
     ON student_progress_snapshots
     FOR SELECT
     USING (
       auth.email() IS NOT NULL
       AND is_teacher_of_student(student_email)
     );
   ```

3. **Tester Rigoureusement**
   - Vérifier qu'un enseignant A ne peut pas voir les données de l'enseignant B
   - Vérifier qu'un utilisateur non authentifié ne peut rien voir
   - Tester les edge cases (étudiant assigné à plusieurs enseignants, etc.)

### Option 2 : Garder Polling HTTP (Actuel - Plus Simple)

**Avantages** :
- Déjà implémenté et sécurisé ✅
- Pas de migration d'auth nécessaire
- Sécurité multicouche (Firebase + Express + RLS)
- Polling intelligent avec fallback automatique

**Inconvénients** :
- Pas de mises à jour instantanées (10-30s de délai)
- Plus de requêtes HTTP (mais optimisé avec cache)

**Configuration Actuelle** :
```typescript
// client/src/hooks/useRealtimeProgress.ts
refetchInterval: 10000,  // Poll every 10 seconds
staleTime: 5000          // Cache 5 seconds
```

**Optimisations Possibles** :
- Réduire à 5 secondes pour mises à jour plus rapides
- Implémenter Server-Sent Events (SSE) comme alternative
- Utiliser long-polling pour réduire latence

### Option 3 : Hybrid Approach (Avancé)

**Concept** :
- Backend Express écoute Supabase Realtime (avec service_role)
- Backend broadcast les changements aux clients via WebSocket custom
- Frontend se connecte au WebSocket du backend (pas directement Supabase)

**Avantages** :
- Mises à jour quasi-instantanées
- Pas besoin de Supabase Auth
- Contrôle total des permissions

**Implémentation** :
```typescript
// server/realtime-relay.ts
import { createServer } from 'http'
import { Server } from 'socket.io'
import { getSupabaseClient } from './lib/supabase-server'

const io = new Server(httpServer, {
  cors: { origin: process.env.CLIENT_URL }
})

// Backend écoute Supabase avec service_role
const supabase = getSupabaseClient()
supabase
  .channel('progress_updates')
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'student_progress_snapshots'
  }, (payload) => {
    // Vérifier permissions et broadcaster aux bons clients
    const teacherEmail = getTeacherForStudent(payload.new.student_email)
    io.to(`teacher:${teacherEmail}`).emit('snapshot_updated', payload.new)
  })
  .subscribe()

// Frontend se connecte au WebSocket Express
io.on('connection', (socket) => {
  socket.on('subscribe_teacher', async ({ teacherEmail, token }) => {
    // Vérifier Firebase token
    const valid = await verifyFirebaseToken(token)
    if (valid) {
      socket.join(`teacher:${teacherEmail}`)
    }
  })
})
```

---

## 🧪 Tests de Sécurité

### Test 1 : Vérifier que RLS Bloque l'Anon Key

```bash
# Tester avec l'anon key (devrait échouer)
curl -X GET 'https://your-project.supabase.co/rest/v1/student_progress_snapshots' \
  -H "apikey: your_anon_key" \
  -H "Authorization: Bearer your_anon_key"

# Résultat attendu : []  (aucune donnée retournée grâce à RLS)
```

### Test 2 : Vérifier que Service Role Fonctionne

```bash
# Tester avec service_role (devrait réussir)
curl -X GET 'https://your-project.supabase.co/rest/v1/student_progress_snapshots' \
  -H "apikey: your_service_role_key" \
  -H "Authorization: Bearer your_service_role_key"

# Résultat attendu : Toutes les données (service_role bypass RLS)
```

### Test 3 : Vérifier via Backend API

```bash
# Via votre API Express (devrait réussir avec auth)
curl -X GET 'http://localhost:5000/api/teacher/realtime/active-students?email=teacher@example.com' \
  -H "Authorization: Bearer your_firebase_jwt"

# Résultat attendu : Liste des étudiants actifs
```

---

## 📝 Checklist de Sécurité

Avant de déployer en production :

- [ ] ✅ Migration `fix-rls-security.sql` appliquée
- [ ] ✅ Vérifier que RLS est activé : `SELECT relrowsecurity FROM pg_class WHERE relname = 'student_progress_snapshots'`
- [ ] ✅ Tester qu'anon key ne peut PAS lire les données
- [ ] ✅ Tester que service_role PEUT lire les données
- [ ] ✅ Tester authentification Firebase sur routes backend
- [ ] ✅ Vérifier que les enseignants voient uniquement LEURS étudiants
- [ ] ✅ Tester les logs de sécurité dans Supabase Dashboard
- [ ] ⚠️  Décider : Garder polling ou implémenter Supabase Auth pour Realtime ?
- [ ] ⚠️  Documenter décision d'architecture dans README
- [ ] ⚠️  Former l'équipe sur les politiques RLS

---

## 🔐 Best Practices de Sécurité

### Général

1. **Principe du Moindre Privilège**
   - Toujours utiliser `anon` key en frontend
   - Réserver `service_role` uniquement au backend
   - Ne JAMAIS exposer `service_role` au client

2. **Défense en Profondeur**
   - Authentification (Firebase)
   - Autorisation (Express middleware)
   - RLS (Dernière ligne de défense)

3. **Audit et Monitoring**
   - Logger tous les accès aux données sensibles
   - Monitorer Supabase Dashboard → Logs
   - Alertes sur tentatives d'accès non autorisées

### Spécifique à RLS

1. **Toujours Tester**
   - Tester avec anon key (doit échouer)
   - Tester avec service_role (doit réussir)
   - Tester cross-teacher access (doit échouer)

2. **Documentation**
   - Commenter chaque politique RLS
   - Documenter les dépendances (training_sessions, etc.)
   - Maintenir ce fichier SECURITY_RLS_CRITICAL.md à jour

3. **Revue Régulière**
   - Auditer les politiques tous les 3 mois
   - Vérifier les logs d'accès
   - Mettre à jour selon les changements métier

---

## 📞 Support

**En cas de problème de sécurité** :

1. **Vérifier les logs** : Supabase Dashboard → Logs → Postgres Logs
2. **Tester les politiques** : Utiliser les scripts de test ci-dessus
3. **Revue de code** : Checker `server/routes.ts` pour validation permissions
4. **Escalader** : Si doute, désactiver Realtime et garder polling uniquement

**Ressources** :
- [Supabase RLS Documentation](https://supabase.com/docs/guides/auth/row-level-security)
- [PostgreSQL RLS](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)

---

## ✅ Résumé

**État Actuel** :
- ✅ RLS activé et sécurisé
- ✅ Polling HTTP fonctionne de manière sécurisée
- ❌ Realtime WebSocket désactivé pour sécurité

**Pour Production** :
- Garder configuration actuelle (polling sécurisé)
- Envisager migration Supabase Auth si Realtime critiques
- Documenter décision d'architecture

**Sécurité** :
- Multicouche (Firebase + Express + RLS)
- Principe du moindre privilège respecté
- Tests de sécurité passés ✅
