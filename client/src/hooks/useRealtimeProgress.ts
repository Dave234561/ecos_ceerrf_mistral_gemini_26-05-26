import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

export interface ActiveStudent {
  sessionId: string;
  studentEmail: string;
  scenarioId: number;
  scenarioTitle?: string;
  lastSnapshot: {
    timestamp: string;
    strengths: string[];
    weaknesses: string[];
    progressIndicators: {
      engagement_score?: number;
      question_quality?: number;
      empathy_level?: number;
      clinical_reasoning?: number;
    };
    exchangeCount: number;
    status: string;
  } | null;
}

export interface ProgressSnapshot {
  id: number;
  sessionId: number;
  studentEmail: string;
  scenarioId: number;
  timestamp: string;
  strengths: string[];
  weaknesses: string[];
  progressIndicators: {
    engagement_score?: number;
    question_quality?: number;
    empathy_level?: number;
    clinical_reasoning?: number;
  };
  exchangeCount: number;
  status: string;
}

export interface SessionSummary {
  id: number;
  sessionDate: string;
  teacherEmail: string;
  scenarioId: number | null;
  totalStudents: number;
  summaryData: {
    totalSnapshots: number;
    averageExchanges: number;
  };
  commonStrengths: string[];
  commonWeaknesses: string[];
  trends: {
    engagement_score?: number;
    question_quality?: number;
    empathy_level?: number;
    clinical_reasoning?: number;
  };
  createdAt: string;
  updatedAt: string;
}

/**
 * Hook to fetch active students with their latest progress snapshots
 * Uses HTTP polling for secure, reliable updates
 *
 * 🔒 SECURED: Teacher email retrieved from Firebase auth token (not from params)
 */
export function useActiveStudents(
  options?: { enabled?: boolean; scenarioId?: number; trainingSessionId?: number }
) {
  return useQuery({
    queryKey: ['realtime-active-students', options?.scenarioId, options?.trainingSessionId],
    queryFn: async () => {
      // SECURITY: Email no longer passed as query param - retrieved from Firebase token on backend
      const params = new URLSearchParams();
      if (options?.scenarioId) {
        params.append('scenarioId', options.scenarioId.toString());
      }
      if (options?.trainingSessionId) {
        params.append('trainingSessionId', options.trainingSessionId.toString());
      }

      const url = `/api/teacher/realtime/active-students${params.toString() ? `?${params.toString()}` : ''}`;
      const response = await apiRequest('GET', url);
      return response.students as ActiveStudent[];
    },
    refetchInterval: 10000, // Poll every 10 seconds for fresh data
    staleTime: 5000, // Consider data fresh for 5 seconds
    enabled: options?.enabled !== false
  });
}

/**
 * Hook to fetch complete progress history for a specific student session
 * Uses HTTP polling for secure, reliable updates
 *
 * 🔒 SECURED: Teacher email retrieved from Firebase auth token (not from params)
 */
export function useStudentProgress(
  sessionId: string,
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: ['realtime-student-progress', sessionId],
    queryFn: async () => {
      // SECURITY: Email no longer passed as query param - retrieved from Firebase token on backend
      const response = await apiRequest(
        'GET',
        `/api/teacher/realtime/student-progress/${sessionId}`
      );
      return {
        snapshots: response.snapshots as ProgressSnapshot[],
        globalScore: response.globalScore as number | null
      };
    },
    refetchInterval: 10000, // Poll every 10 seconds
    staleTime: 5000,
    enabled: options?.enabled !== false && !!sessionId
  });
}

/**
 * Hook to generate a session summary for a specific date
 *
 * 🔒 SECURED: Teacher email retrieved from Firebase auth token (not from body)
 */
export function useGenerateSessionSummary() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { sessionDate: string; scenarioId?: number }) => {
      // SECURITY: Email no longer passed in request body - retrieved from Firebase token on backend
      const response = await apiRequest('POST', '/api/teacher/realtime/generate-summary', {
        sessionDate: params.sessionDate,
        scenarioId: params.scenarioId
      });
      return response.summary as SessionSummary;
    },
    onSuccess: (data) => {
      // Invalidate summary queries to refetch
      queryClient.invalidateQueries({
        queryKey: ['realtime-session-summary', data.sessionDate]
      });
    }
  });
}

/**
 * Hook to fetch an existing session summary
 * Summaries are static data, fetched once and cached
 *
 * 🔒 SECURED: Teacher email retrieved from Firebase auth token (not from params)
 */
export function useSessionSummary(
  sessionDate: string,
  options?: { enabled?: boolean; scenarioId?: number }
) {
  return useQuery({
    queryKey: ['realtime-session-summary', sessionDate, options?.scenarioId],
    queryFn: async () => {
      try {
        // SECURITY: Email no longer passed as query param - retrieved from Firebase token on backend
        let url = `/api/teacher/realtime/summary/${sessionDate}`;
        if (options?.scenarioId) {
          url += `?scenarioId=${options.scenarioId}`;
        }
        const response = await apiRequest('GET', url);
        return response.summary as SessionSummary;
      } catch (error: any) {
        // 404 is expected when no summary exists for this date - return null gracefully
        // Check both status code and message for 404
        if (error.status === 404 || error.message?.includes('404') || error.message?.includes('SUMMARY_NOT_FOUND')) {
          console.log(`ℹ️ No summary found for ${sessionDate} - this is normal if no summary was generated yet`);
          return null;
        }
        throw error;
      }
    },
    refetchInterval: false, // Don't auto-refresh (summaries are static)
    staleTime: Infinity, // Summaries don't change once generated
    enabled: options?.enabled !== false && !!sessionDate,
    retry: false // Don't retry if summary doesn't exist
  });
}
