import { Bot, Clock, Loader2 } from "lucide-react";
import { useRequestQueue } from "@/hooks/useRequestQueue";

interface LoadingIndicatorProps {
  isLoading: boolean;
  message?: string;
  showQueueStatus?: boolean;
}

/**
 * Loading indicator with queue status
 *
 * Displays a loading animation with optional message and queue information
 * Shows estimated wait time when requests are queued due to rate limiting
 */
export default function LoadingIndicator({
  isLoading,
  message = "Le patient réfléchit…",
  showQueueStatus = true
}: LoadingIndicatorProps) {
  const queueStatus = useRequestQueue();

  if (!isLoading) return null;

  return (
    <div className="flex justify-start">
      <div className="bg-white border border-gray-200 p-3 rounded-lg max-w-[85%]">
        <div className="flex items-center space-x-2">
          <Bot className="w-4 h-4 text-gray-600" />
          <span className="text-xs text-gray-500">Patient</span>
        </div>

        {/* Main loading message */}
        <div className="flex items-center space-x-2 mt-2">
          <span className="text-sm text-gray-700">{message}</span>
          <div className="flex space-x-1">
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce"></div>
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{animationDelay: '0.1s'}}></div>
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
          </div>
        </div>

        {/* Queue status information */}
        {showQueueStatus && queueStatus.isRateLimited && (
          <div className="mt-2 pt-2 border-t border-gray-100">
            <div className="flex items-center space-x-2 text-xs text-amber-600">
              <Clock className="w-3 h-3" />
              <span>
                {queueStatus.estimatedWaitTime > 0
                  ? `Temps d'attente estimé : ${queueStatus.estimatedWaitTime}s`
                  : 'En attente de traitement…'}
              </span>
            </div>
          </div>
        )}

        {/* Active queue information */}
        {showQueueStatus && queueStatus.queueLength > 1 && (
          <div className="mt-1 text-xs text-gray-500">
            <span>{queueStatus.queueLength} requête{queueStatus.queueLength > 1 ? 's' : ''} en file d'attente</span>
          </div>
        )}
      </div>
    </div>
  );
}
