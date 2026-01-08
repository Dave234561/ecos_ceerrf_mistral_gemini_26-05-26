/**
 * Hook for async evaluation with polling
 * Handles evaluation job creation and status checking
 */

import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useEffect, useRef, useState } from "react";

interface UseAsyncEvaluationOptions {
  sessionId: string;
  email: string;
  enabled?: boolean;
}

interface EvaluationJobStatus {
  jobId?: string;
  sessionId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress?: number;
  result?: any;
  error?: string;
  createdAt?: string;
  startedAt?: string;
  completedAt?: string;
}

export function useAsyncEvaluation({ sessionId, email, enabled = true }: UseAsyncEvaluationOptions) {
  const [jobId, setJobId] = useState<string | null>(null);
  const [evaluationData, setEvaluationData] = useState<any>(null);
  const [evaluationError, setEvaluationError] = useState<Error | null>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Step 1: Start evaluation (SYNC version - works in Vercel serverless)
  const { data: jobData, isLoading: isStarting, error: startError } = useQuery({
    queryKey: ['start-evaluation', sessionId],
    queryFn: async () => {
      // Validate sessionId before making API call
      if (!sessionId || sessionId === 'null' || sessionId === 'undefined' || sessionId === 'None') {
        console.error('❌ Invalid sessionId in useAsyncEvaluation:', sessionId);
        throw new Error('Invalid sessionId: ' + sessionId);
      }
      console.log('🚀 Starting SYNC evaluation for session:', sessionId);

      try {
        // Use sync endpoint to avoid serverless timeout issues
        const response = await apiRequest('POST', `/api/ecos/sessions/${sessionId}/evaluate-sync?email=${email}`, {
          responses: []
        });

        console.log('✅ Evaluation completed synchronously:', response);

        // Sync endpoint returns complete result immediately - NO jobId needed
        if (response.evaluation) {
          setEvaluationData(response);
          // Return result WITHOUT jobId to prevent polling
          return {
            sessionId,
            status: 'completed',
            result: response,
            progress: 100
          };
        }

        return response;
      } catch (error: any) {
        console.error('❌ Sync evaluation failed:', error);
        throw error;
      }
    },
    enabled: enabled && !jobId && !evaluationData,
    staleTime: Infinity, // Never refetch
    retry: false
  });

  // Set job ID when we get it from the initial request
  useEffect(() => {
    if (jobData?.jobId && !jobId) {
      console.log('📝 Setting job ID:', jobData.jobId);
      setJobId(jobData.jobId);
    }
  }, [jobData, jobId]);

  // Step 2: Poll for evaluation status
  const checkStatus = async (): Promise<EvaluationJobStatus | null> => {
    if (!enabled || (!jobId && !evaluationData)) return null;

    // Validate sessionId
    if (!sessionId || sessionId === 'null' || sessionId === 'undefined' || sessionId === 'None') {
      console.error('❌ Invalid sessionId in checkStatus:', sessionId);
      return null;
    }

    try {
      console.log('🔍 Checking evaluation status for session:', sessionId);

      const status: EvaluationJobStatus = await apiRequest(
        'GET',
        `/api/ecos/sessions/${sessionId}/evaluation/status?email=${email}`
      );

      console.log('📊 Evaluation status:', status);

      // If completed, set the evaluation data
      if (status.status === 'completed' && status.result) {
        console.log('✅ Evaluation completed:', status.result);
        setEvaluationData(status.result);

        // Stop polling
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
          pollingIntervalRef.current = null;
        }
      } else if (status.status === 'failed') {
        console.error('❌ Evaluation failed:', status.error);
        setEvaluationError(new Error(status.error || 'Evaluation failed'));

        // Stop polling
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
          pollingIntervalRef.current = null;
        }
      }

      return status;
    } catch (error: any) {
      console.error('Error checking evaluation status:', error);
      return null;
    }
  };

  // Setup polling when we have a job ID
  useEffect(() => {
    if (!enabled || !jobId || evaluationData || pollingIntervalRef.current) {
      return;
    }

    console.log('⏰ Starting status polling for job:', jobId);

    // Check immediately
    checkStatus();

    // Then check every 2 seconds
    pollingIntervalRef.current = setInterval(checkStatus, 2000);

    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, [enabled, jobId, evaluationData]);

  // Step 3: Get real-time status using the query (for UI updates)
  const { data: currentStatus } = useQuery({
    queryKey: ['evaluation-status', sessionId, jobId],
    queryFn: checkStatus,
    enabled: enabled && !!jobId && !evaluationData,
    refetchInterval: 2000, // Poll every 2 seconds
    retry: false
  });

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, []);

  const isLoading = isStarting || (!!jobId && !evaluationData && !evaluationError);
  const error = startError || evaluationError;
  const progress = currentStatus?.progress || 0;
  const status = currentStatus?.status || (jobId ? 'pending' : undefined);

  return {
    data: evaluationData,
    isLoading,
    error,
    progress,
    status,
    jobId
  };
}
