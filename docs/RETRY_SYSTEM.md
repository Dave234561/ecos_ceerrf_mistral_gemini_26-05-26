# Système de Retry avec Backoff Exponentiel

## Vue d'ensemble

Le projet implémente un système complet de retry avec backoff exponentiel pour gérer les erreurs réseau, les timeouts, et les rate limits.

## Architecture

### Côté Client (`client/src/lib/`)

#### RequestQueue (`requestQueue.ts`)

Queue intelligente de requêtes avec retry automatique et backoff exponentiel.

**Caractéristiques:**
- Retry automatique pour les erreurs réseau, 5xx, timeouts, et rate limits (429)
- Backoff exponentiel avec jitter (±20%) pour éviter le "thundering herd"
- Gestion automatique des headers `Retry-After`
- Concurrence limitée (3 requêtes simultanées max)
- Status de la queue en temps réel

**Configuration par défaut:**
```typescript
{
  maxRetries: 5,        // 5 tentatives max
  initialDelay: 1000,   // 1 seconde de délai initial
  maxDelay: 30000,      // 30 secondes max
  backoffFactor: 2      // Délai x2 à chaque tentative
}
```

**Formule du backoff:**
```
delay = min(initialDelay × 2^(attempt-1), maxDelay) ± jitter(20%)
```

**Exemple de délais:**
- Tentative 1: ~1000ms (1s)
- Tentative 2: ~2000ms (2s)
- Tentative 3: ~4000ms (4s)
- Tentative 4: ~8000ms (8s)
- Tentative 5: ~16000ms (16s)

**Erreurs retryables:**
- Rate limits (429)
- Erreurs serveur (5xx)
- Timeouts
- Erreurs réseau (connection refused, network error, fetch failed)

#### API Request (`queryClient.ts`)

Wrapper autour de `fetch` avec retry automatique intégré.

**Utilisation:**
```typescript
import { apiRequest } from "@/lib/queryClient";

// Requête GET avec 3 retries par défaut
const data = await apiRequest('GET', '/api/endpoint');

// Requête POST avec 5 retries par défaut
const result = await apiRequest('POST', '/api/endpoint', { foo: 'bar' });

// Personnaliser le nombre de retries
const custom = await apiRequest('GET', '/api/endpoint', undefined, {
  maxRetries: 10  // 10 tentatives max
});

// Skip le système de retry (déconseillé)
const noRetry = await apiRequest('GET', '/api/endpoint', undefined, {
  skipQueue: true
});
```

### Côté Serveur (`server/utils/retry.ts`)

Utility pour retry côté serveur avec les mêmes principes.

**Utilisation:**
```typescript
import { withRetry, RetryPresets, RetryConditions } from '../utils/retry.js';

// Utiliser un preset
const result = await withRetry(
  async () => await someApiCall(),
  RetryPresets.api
);

// Configuration personnalisée
const result = await withRetry(
  async () => await criticalOperation(),
  {
    maxRetries: 5,
    initialDelay: 2000,
    maxDelay: 30000,
    backoffFactor: 2,
    timeout: 60000,
    retryCondition: RetryConditions.networkAndServerErrors,
    operationName: 'Critical Operation',
    onRetry: (error, attempt) => {
      console.log(`Retry attempt ${attempt}: ${error.message}`);
    }
  }
);
```

**Presets disponibles:**
- `RetryPresets.api` - Défaut pour les appels API (3 retries, 30s timeout)
- `RetryPresets.critical` - Pour les opérations critiques (5 retries, 60s timeout)
- `RetryPresets.conservative` - Pour les opérations non-critiques (2 retries, 15s timeout)
- `RetryPresets.database` - Pour les opérations DB (3 retries, 45s timeout)
- `RetryPresets.externalApi` - Pour les APIs externes (4 retries, 30s timeout)

**Conditions de retry:**
- `RetryConditions.networkAndServerErrors` - Erreurs réseau et 5xx (défaut)
- `RetryConditions.timeoutOnly` - Timeouts uniquement
- `RetryConditions.rateLimitOnly` - Rate limits (429) uniquement
- `RetryConditions.always` - Toujours retry (à utiliser avec précaution)
- `RetryConditions.never` - Jamais retry

## Monitoring

### Côté Client

```typescript
import { requestQueue } from "@/lib/requestQueue";

// S'abonner aux changements de status
const unsubscribe = requestQueue.subscribe((status) => {
  console.log('Queue status:', status);
  // { queueLength, activeRequests, isRateLimited, estimatedWaitTime }
});

// Obtenir le status actuel
const status = requestQueue.getStatus();

// Nettoyer la queue (logout, etc.)
requestQueue.clear();
```

### Côté Serveur

Les retries sont automatiquement loggés via le service de logging:

```
⚠️ operation failed, retrying in 2000ms (attempt 1/3)
✅ operation succeeded after 2 attempts
❌ operation failed after 3 attempts
```

## Bonnes Pratiques

### ✅ À faire:

1. **Utiliser les retries pour toutes les opérations réseau**
   ```typescript
   const data = await apiRequest('GET', '/api/data');
   ```

2. **Utiliser des presets pour la cohérence**
   ```typescript
   await withRetry(operation, RetryPresets.api);
   ```

3. **Spécifier des noms d'opération pour le debugging**
   ```typescript
   await withRetry(operation, {
     ...RetryPresets.api,
     operationName: 'Fetch User Profile'
   });
   ```

4. **Gérer les échecs après tous les retries**
   ```typescript
   try {
     await apiRequest('POST', '/api/critical');
   } catch (error) {
     // Log, notifier l'utilisateur, fallback, etc.
   }
   ```

### ❌ À éviter:

1. **Ne pas skipper les retries sans raison**
   ```typescript
   // ❌ Mauvais
   await apiRequest('GET', '/api/data', undefined, { skipQueue: true });

   // ✅ Bon
   await apiRequest('GET', '/api/data');
   ```

2. **Ne pas retry les opérations non-idempotentes sans protection**
   ```typescript
   // ❌ Attention: peut créer des doublons
   await withRetry(() => createPayment(), RetryPresets.api);

   // ✅ Utiliser une clé d'idempotence
   await withRetry(() => createPayment({ idempotencyKey }), RetryPresets.api);
   ```

3. **Ne pas utiliser trop de retries pour les opérations rapides**
   ```typescript
   // ❌ Trop de retries
   await apiRequest('GET', '/api/quick', undefined, { maxRetries: 20 });

   // ✅ Nombre raisonnable
   await apiRequest('GET', '/api/quick', undefined, { maxRetries: 3 });
   ```

## Métriques

### Délais Totaux (avec tous les retries)

| Retries | Délai Min | Délai Moyen | Délai Max |
|---------|-----------|-------------|-----------|
| 0       | 0s        | 0s          | 0s        |
| 1       | 1s        | 1s          | 1s        |
| 2       | 3s        | 3s          | 3s        |
| 3       | 7s        | 7s          | 7s        |
| 4       | 15s       | 15s         | 15s       |
| 5       | 31s       | 31s         | 31s       |

### Configuration Actuelle

**Frontend (apiRequest):**
- GET: 3 retries max (~7s total)
- POST/PUT/DELETE: 5 retries max (~31s total)

**Backend (withRetry):**
- API preset: 3 retries, 30s timeout (~7s + 30s = 37s max)
- Critical preset: 5 retries, 60s timeout (~31s + 60s = 91s max)

## Logs et Debugging

### Frontend

Le système de logging est optimisé pour éviter les fausses alarmes:

**Logs affichés:**
```javascript
// Retry en cours (erreur retryable)
🔄 Retrying request (attempt 2/5) after 2000ms {
  isRateLimitError: false,
  status: 500,
  errorType: "Server Error (500)",
  error: "Internal Server Error"
}

// Échec final après plusieurs retries
❌ Request failed after 5 retries: {
  error: "Network Error",
  status: undefined,
  errorType: "Network Error",
  isRetryable: true
}

// Edge case (retryable mais max retries atteint immédiatement)
⚠️ Retryable error but max retries reached: {
  error: "Timeout",
  status: undefined,
  errorType: "Timeout"
}
```

**Logs NON affichés (comportement normal):**
```javascript
// ✅ 404 Not Found - souvent attendu (ressource n'existe pas)
// Pas de log d'erreur - géré silencieusement par l'application

// ✅ 400 Bad Request - erreur client
// Pas de log d'erreur - géré par la couche application

// ✅ 401 Unauthorized - non authentifié
// Pas de log d'erreur - géré par la couche application

// ✅ 403 Forbidden - accès refusé
// Pas de log d'erreur - géré par la couche application
```

**Philosophie de logging:**
- **404**: Erreur attendue (ressource absente) → Pas de log console
- **4xx (sauf 429)**: Erreurs client → Gérées par l'application, pas de log console
- **429**: Rate limit → Retry automatique avec logs
- **5xx**: Erreurs serveur → Retry automatique avec logs si échec final
- **Network/Timeout**: Problèmes réseau → Retry automatique avec logs si échec final

### Backend

```javascript
// Retry en cours
⚠️ Database Operation failed, retrying in 2000ms (attempt 2/3) {
  error: "ECONNREFUSED",
  attempt: 2,
  delay: 2000
}

// Échec final
❌ Database Operation failed after 3 attempts {
  error: "ECONNREFUSED",
  totalTime: 7432,
  attempts: 3
}
```

## Rate Limiting

Le système gère automatiquement les rate limits:

1. **Détection**: Status 429 ou message "rate limit"
2. **Backoff**: Utilise le header `Retry-After` si présent, sinon backoff exponentiel
3. **Global delay**: Les rate limits appliquent un délai à toutes les requêtes en queue

## Support des Headers

### Retry-After

Le système respecte automatiquement le header `Retry-After` des réponses 429:

```http
HTTP/1.1 429 Too Many Requests
Retry-After: 60
```

Le retry attendra 60 secondes avant de réessayer.

## Tests

Pour tester le système de retry:

```typescript
// Simuler une erreur réseau
const mockError = new Error('Failed to fetch');
mockError.status = undefined;

// Simuler un rate limit
const rateLimitError = new Error('429: Too Many Requests');
rateLimitError.status = 429;

// Simuler une erreur serveur
const serverError = new Error('500: Internal Server Error');
serverError.status = 500;
```

## Références

- [Client-side implementation](../client/src/lib/requestQueue.ts)
- [Server-side implementation](../server/utils/retry.ts)
- [API wrapper](../client/src/lib/queryClient.ts)
