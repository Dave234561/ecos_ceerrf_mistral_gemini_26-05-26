import { useState, useEffect } from 'react';
import { requestQueue, QueueStatus } from '@/lib/requestQueue';

/**
 * Hook to monitor request queue status
 *
 * Returns the current status of the request queue including:
 * - Queue length
 * - Active requests
 * - Rate limit status
 * - Estimated wait time
 */
export function useRequestQueue() {
  const [status, setStatus] = useState<QueueStatus>({
    queueLength: 0,
    activeRequests: 0,
    isRateLimited: false,
    estimatedWaitTime: 0
  });

  useEffect(() => {
    // Subscribe to queue status changes
    const unsubscribe = requestQueue.subscribe((newStatus) => {
      setStatus(newStatus);
    });

    // Get initial status
    setStatus(requestQueue.getStatus());

    return unsubscribe;
  }, []);

  return {
    ...status,
    isProcessing: status.activeRequests > 0 || status.queueLength > 0,
    hasQueue: status.queueLength > 0
  };
}
