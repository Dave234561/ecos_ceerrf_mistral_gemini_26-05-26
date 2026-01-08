# Request Queue System - Documentation

## Vue d'ensemble

Le système de file d'attente des requêtes (Request Queue System) gère automatiquement les requêtes API avec retry automatique et backoff exponentiel pour améliorer la résilience de l'application face aux limitations de débit (rate limiting).

## Fonctionnalités

### 1. File d'Attente Intelligente

- **Gestion automatique des requêtes** : Les requêtes POST, PUT, DELETE sont automatiquement mises en file d'attente
- **Concurrence contrôlée** : Maximum 3 requêtes simultanées pour éviter de surcharger le serveur
- **Priorisation** : Les requêtes en échec sont remises en tête de file pour un traitement prioritaire

### 2. Retry Automatique avec Backoff Exponentiel

Lorsqu'une requête échoue (erreur 429 ou autre), le système:

1. **Détecte l'erreur** de rate limiting (HTTP 429)
2. **Calcule le délai** de retry avec backoff exponentiel:
   - Tentative 1: ~2 secondes
   - Tentative 2: ~4 secondes
   - Tentative 3: ~8 secondes
   - Tentative 4: ~16 secondes
   - Tentative 5: ~30 secondes (max)
3. **Ajoute du jitter** (±20%) pour éviter les "thundering herd"
4. **Re-essaie la requête** automatiquement

### 3. Indicateurs Visuels

#### LoadingIndicator
Affiche "Le patient réfléchit…" pendant le traitement des requêtes avec:
- Animation de points rebondissants
- Temps d'attente estimé si rate limited
- Nombre de requêtes en file d'attente

#### QueueStatusBanner
Bannière globale affichée en haut de l'écran quand:
- Des requêtes sont en attente
- Le rate limiting est actif
- Affiche le temps d'attente estimé

## Architecture

### Composants Principaux

```
client/src/lib/
├── requestQueue.ts          # Service de file d'attente principal
└── queryClient.ts           # Client TanStack Query modifié

client/src/hooks/
└── useRequestQueue.ts       # Hook React pour surveiller la file d'attente

client/src/components/
├── ecos/LoadingIndicator.tsx      # Indicateur de chargement contextuel
└── ui/QueueStatusBanner.tsx       # Bannière globale de statut
```

### Flux de Traitement

1. **Requête initiée** par l'utilisateur (ex: envoi d'un message au patient)
2. **apiRequest()** intercepte la requête
3. **requestQueue.enqueue()** ajoute la requête à la file
4. **Traitement concurrent** : jusqu'à 3 requêtes simultanées
5. En cas d'erreur 429:
   - Calcul du backoff exponentiel
   - Mise en pause de la file d'attente
   - Retry automatique après le délai
6. **Mise à jour des composants** via le hook `useRequestQueue()`

## Utilisation

### Dans les Composants

```tsx
import LoadingIndicator from "@/components/ecos/LoadingIndicator";
import { useRequestQueue } from "@/hooks/useRequestQueue";

function MyComponent() {
  const queueStatus = useRequestQueue();
  const mutation = useMutation({
    mutationFn: async (data) => {
      return apiRequest('POST', '/api/endpoint', data);
      // Retry automatique géré par requestQueue
    }
  });

  return (
    <>
      <LoadingIndicator
        isLoading={mutation.isPending}
        message="Le patient réfléchit…"
        showQueueStatus={true}
      />

      {/* Afficher info de la file d'attente */}
      {queueStatus.isRateLimited && (
        <p>Temps d'attente: {queueStatus.estimatedWaitTime}s</p>
      )}
    </>
  );
}
```

### Bypass de la File d'Attente

Pour les requêtes GET ou si vous voulez bypasser la file:

```tsx
apiRequest('GET', '/api/endpoint', undefined, {
  skipQueue: true  // Bypass la file d'attente
});
```

## Configuration

### Paramètres de Retry

Dans `queryClient.ts`:

```typescript
requestQueue.enqueue(executeFetch, {
  maxRetries: 5,        // Nombre max de tentatives
  initialDelay: 1000,   // Délai initial en ms
  maxDelay: 30000       // Délai max en ms
});
```

### Concurrence

Dans `requestQueue.ts`:

```typescript
private maxConcurrent = 3; // Nombre max de requêtes simultanées
```

## Monitoring

### Hook useRequestQueue

```tsx
const queueStatus = useRequestQueue();

// Propriétés disponibles:
queueStatus.queueLength      // Nombre de requêtes en attente
queueStatus.activeRequests   // Nombre de requêtes actives
queueStatus.isRateLimited    // Booléen: rate limiting actif?
queueStatus.estimatedWaitTime // Temps d'attente estimé (secondes)
queueStatus.isProcessing     // Booléen: traitement en cours?
queueStatus.hasQueue         // Booléen: file d'attente non vide?
```

### Logs Console

Le système log automatiquement:
- Les tentatives de retry avec le délai
- Les erreurs de rate limiting
- L'état de la file d'attente

Exemple:
```
🔄 Retrying request (attempt 2/5) after 4000ms
```

## Avantages

1. **Expérience utilisateur améliorée**
   - Messages clairs pendant l'attente
   - Temps d'attente estimé affiché
   - Pas de perte de requêtes

2. **Résilience**
   - Retry automatique sans intervention utilisateur
   - Gestion intelligente du rate limiting
   - Pas de requêtes perdues

3. **Performance**
   - Concurrence contrôlée
   - Backoff exponentiel évite la surcharge
   - Jitter prévient les "thundering herd"

4. **Maintenabilité**
   - Logique centralisée
   - Facile à tester
   - Configuration simple

## Limitations et Considérations

1. **Requêtes GET** : Bypasses la file d'attente par défaut (peuvent être ajoutées manuellement)
2. **Mémoire** : La file d'attente est en mémoire (perdue au rafraîchissement)
3. **Timeout** : Pas de timeout global (géré par fetch)
4. **Ordre** : Les requêtes en échec sont priorisées (LIFO pour retry)

## Évolutions Futures

- [ ] Persistence de la file d'attente (localStorage/IndexedDB)
- [ ] Timeout configurable par requête
- [ ] Métriques de performance (temps de réponse moyen)
- [ ] Support de WebSocket pour les notifications temps réel
- [ ] File d'attente par priorité (urgent vs normal)
