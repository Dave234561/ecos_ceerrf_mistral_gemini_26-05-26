# 🔗 Enrollment URL Firebase Authorization Fix

## ⚠️ Problème identifié

Les liens d'enrollment généraient des URLs avec des domaines Vercel changeants à chaque déploiement:
- `ecos-infirmier-b-20-xyz123.vercel.app` (preview)
- `ecos-infirmier-b-20-abc456-dave234561s-projects.vercel.app` (branch)

**Impact**: Firebase rejette l'authentification sur les domaines non autorisés.

## ✅ Solution appliquée

### Modification du code

`server/services/training-session.service.ts` maintenant utilise:
1. **`BASE_URL`** (priorité absolue) - Domaine production fixe
2. **`VERCEL_PROJECT_PRODUCTION_URL`** - URL production Vercel
3. **Fallback hardcodé** - `ecos-infirmier-b-20.vercel.app`

### Variables d'environnement Vercel requises

```bash
# À configurer dans Vercel Dashboard → Settings → Environment Variables
BASE_URL=https://ecos-infirmier-b-20.vercel.app
```

**Ou si vous avez un domaine custom**:
```bash
BASE_URL=https://votre-domaine.com
```

### Configuration Firebase requise

Dans Firebase Console → Authentication → Settings → Authorized domains:

**Domaines à autoriser**:
1. ✅ `ecos-infirmier-b-20.vercel.app` (production)
2. ✅ `localhost` (développement local)
3. ❌ NE PAS autoriser les URLs preview/branch

## 📋 Actions à faire

### 1. Configurer BASE_URL dans Vercel

```bash
# Via Vercel CLI
vercel env add BASE_URL

# Entrer: https://ecos-infirmier-b-20.vercel.app
# Environment: Production, Preview, Development
```

**Ou via le Dashboard**:
1. Aller sur https://vercel.com/dashboard
2. Sélectionner le projet ECOS-infirmierB
3. Settings → Environment Variables
4. Add new:
   - **Name**: `BASE_URL`
   - **Value**: `https://ecos-infirmier-b-20.vercel.app`
   - **Environments**: ✓ Production ✓ Preview ✓ Development

**CRITIQUE**: BASE_URL DOIT être configuré pour **tous** les environnements (Preview inclus).
Sans BASE_URL en Preview, les liens d'enrollment utiliseront VERCEL_URL et Firebase rejettera l'authentification.

### 2. Vérifier Firebase Authorized Domains

1. Aller sur https://console.firebase.google.com
2. Sélectionner votre projet
3. Authentication → Settings → Authorized domains
4. Vérifier que `ecos-infirmier-b-20.vercel.app` est dans la liste
5. **Supprimer** toutes les URLs preview si présentes

### 3. Tester

Après le déploiement:
1. Créer une nouvelle session avec lien d'enrollment
2. Vérifier que l'URL générée utilise `BASE_URL`:
   ```
   https://ecos-infirmier-b-20.vercel.app/enroll/ts_xxx
   ```
3. Tester l'authentification Firebase sur ce lien

## 🔒 Sécurité et Trade-offs

### ✅ Cette approche garantit que:
- ✅ Tous les liens d'enrollment pointent vers un domaine Firebase autorisé
- ✅ L'authentification fonctionne toujours en production
- ✅ Pas besoin d'autoriser des centaines de domaines preview dans Firebase

### ⚠️ Impact sur les déploiements Preview

**IMPORTANT**: Les déploiements preview (branches) ne peuvent PAS tester le flow d'enrollment complet de manière isolée.

**Pourquoi?**
- Les liens d'enrollment générés dans les previews utilisent aussi `BASE_URL` (production)
- Cliquer sur un lien d'enrollment dans un preview redirige vers la PRODUCTION
- C'est le prix à payer pour la sécurité Firebase (domaines autorisés fixes)

**Alternatives pour tester les previews**:

1. **Option A (NON RECOMMANDÉE)**: Autoriser temporairement l'URL preview dans Firebase
   - Ajouter `ecos-infirmier-b-20-xyz123.vercel.app` aux domaines Firebase
   - Tester le flow complet
   - Supprimer le domaine après le test
   - ❌ Fastidieux et risqué (oubli de suppression)

2. **Option B (RECOMMANDÉE)**: Tester le backend sans Firebase
   - Les previews permettent de tester la logique backend
   - L'authentification Firebase n'est testée qu'en production
   - ✅ Sécurisé et pratique

3. **Option C (DÉVELOPPEMENT UNIQUEMENT)**: Variable d'environnement de test
   - Ajouter `FORCE_PREVIEW_URL=true` pour forcer l'utilisation de VERCEL_URL
   - Utiliser uniquement pour les tests de développement
   - Ne JAMAIS activer en production

## 🎯 Résultat attendu

**Avant**:
```
https://ecos-infirmier-b-20-abc456.vercel.app/enroll/ts_xxx
❌ Firebase authentication error: unauthorized domain
```

**Après**:
```
https://ecos-infirmier-b-20.vercel.app/enroll/ts_xxx
✅ Firebase authentication works
```
