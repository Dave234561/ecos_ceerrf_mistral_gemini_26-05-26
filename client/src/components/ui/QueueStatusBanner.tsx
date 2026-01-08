import { AlertCircle, Clock, Loader2 } from "lucide-react";
import { useRequestQueue } from "@/hooks/useRequestQueue";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

/**
 * Global queue status banner
 *
 * Displays an informative banner when requests are being queued or rate limited
 * Only shows when there are queued requests or active rate limiting
 */
export default function QueueStatusBanner() {
  const queueStatus = useRequestQueue();

  // Only show banner if there are queued requests or rate limiting is active
  if (!queueStatus.isProcessing && !queueStatus.isRateLimited) {
    return null;
  }

  // Don't show banner for normal processing (only for queued/rate limited)
  if (queueStatus.activeRequests > 0 && queueStatus.queueLength === 0 && !queueStatus.isRateLimited) {
    return null;
  }

  return (
    <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50 max-w-md w-full px-4">
      <Alert
        variant={queueStatus.isRateLimited ? "default" : "default"}
        className="border-amber-200 bg-amber-50 shadow-lg"
      >
        <div className="flex items-start space-x-2">
          {queueStatus.isRateLimited ? (
            <Clock className="h-4 w-4 text-amber-600 mt-0.5" />
          ) : (
            <Loader2 className="h-4 w-4 text-amber-600 mt-0.5 animate-spin" />
          )}
          <div className="flex-1 min-w-0">
            <AlertTitle className="text-amber-800 text-sm font-semibold">
              {queueStatus.isRateLimited
                ? "Requêtes en attente"
                : "Traitement en cours"}
            </AlertTitle>
            <AlertDescription className="text-amber-700 text-xs mt-1">
              {queueStatus.isRateLimited && queueStatus.estimatedWaitTime > 0 ? (
                <span>
                  Temps d'attente estimé : {queueStatus.estimatedWaitTime} seconde{queueStatus.estimatedWaitTime > 1 ? 's' : ''}
                </span>
              ) : queueStatus.queueLength > 0 ? (
                <span>
                  {queueStatus.queueLength} requête{queueStatus.queueLength > 1 ? 's' : ''} en file d'attente
                </span>
              ) : (
                <span>Vos requêtes sont en cours de traitement…</span>
              )}
            </AlertDescription>
          </div>
        </div>
      </Alert>
    </div>
  );
}
