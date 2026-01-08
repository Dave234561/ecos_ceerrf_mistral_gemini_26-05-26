import { useState, useEffect, useCallback } from 'react';
import { apiRequest } from '../lib/queryClient';

export interface EvaluationStatus {
  status: 'idle' | 'processing' | 'completed' | 'error' | 'not_found';
  evaluation?: any;
  error?: string;
  progress?: number;
}

export interface UseEvaluationPollingResult {
  status: EvaluationStatus['status'];
  evaluation: any | null;
  error: string | null;
  progress: number;
  startPolling: () => void;
  stopPolling: () => void;
  reset: () => void;
}

/**
 * Hook pour poller le statut d'une évaluation ECOS
 * 
 * @param sessionId - ID de la session ECOS
 * @param options - Options de configuration
 * @returns État du polling et fonctions de contrôle
 * 
 * @example
 * ```tsx
 * const { status, evaluation, startPolling } = useEvaluationPolling(sessionId);
 * 
 * // Démarrer le polling après la fin de session
 * const handleEndSession = async () => {
 *   await endSession();
 *   startPolling();
 * };
 * 
 * // Afficher l'état
 * {status === 'processing' && <LoadingSpinner />}
 * {status === 'completed' && <EvaluationReport data={evaluation} />}
 * {status === 'error' && <ErrorMessage />}
 * ```
 */
export function useEvaluationPolling(
  sessionId: string | null,
  options: {
    pollInterval?: number;
    maxAttempts?: number;
    autoStart?: boolean;
  } = {}
): UseEvaluationPollingResult {
  const {
    pollInterval = 2000, // Poll toutes les 2 secondes
    maxAttempts = 60, // Max 60 tentatives = 2 minutes
    autoStart = false,
  } = options;

  const [status, setStatus] = useState<EvaluationStatus['status']>('idle');
  const [evaluation, setEvaluation] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number>(0);
  const [attempts, setAttempts] = useState<number>(0);
  const [isPolling, setIsPolling] = useState<boolean>(autoStart);

  const startPolling = useCallback(() => {
    console.log('🔄 Starting evaluation polling for session:', sessionId);
    setIsPolling(true);
    setStatus('processing');
    setAttempts(0);
    setProgress(0);
    setError(null);
  }, [sessionId]);

  const stopPolling = useCallback(() => {
    console.log('⏹️ Stopping evaluation polling');
    setIsPolling(false);
  }, []);

  const reset = useCallback(() => {
    console.log('🔄 Resetting evaluation polling state');
    setStatus('idle');
    setEvaluation(null);
    setError(null);
    setProgress(0);
    setAttempts(0);
    setIsPolling(false);
  }, []);

  useEffect(() => {
    if (!sessionId || !isPolling || status === 'completed' || status === 'error') {
      return;
    }

    let intervalId: NodeJS.Timeout;

    const pollEvaluation = async () => {
      try {
        console.log(`📡 Polling evaluation (attempt ${attempts + 1}/${maxAttempts})`);

        // Calculer le progrès basé sur le nombre de tentatives
        const currentProgress = Math.min(90, (attempts / maxAttempts) * 100);
        setProgress(currentProgress);

        // Vérifier si on a atteint le nombre max de tentatives
        if (attempts >= maxAttempts) {
          console.error('❌ Max polling attempts reached');
          setStatus('error');
          setError('L\'évaluation prend trop de temps. Veuillez réessayer plus tard.');
          setIsPolling(false);
          return;
        }

        // Appeler l'endpoint de statut
        const response = await apiRequest<EvaluationStatus>(
          `/api/ecos/sessions/${sessionId}/evaluation/status`,
          {
            method: 'GET',
          }
        );

        console.log('📊 Evaluation status:', response.status);

        if (response.status === 'completed' && response.evaluation) {
          console.log('✅ Evaluation completed!');
          setStatus('completed');
          setEvaluation(response.evaluation);
          setProgress(100);
          setIsPolling(false);
        } else if (response.status === 'error') {
          console.error('❌ Evaluation error:', response.error);
          setStatus('error');
          setError(response.error || 'Une erreur est survenue lors de l\'évaluation');
          setIsPolling(false);
        } else if (response.status === 'processing') {
          console.log('⏳ Evaluation still processing...');
          setStatus('processing');
          // Utiliser le progrès du backend si disponible
          if (response.progress !== undefined) {
            setProgress(response.progress);
          }
          setAttempts(prev => prev + 1);
        } else if (response.status === 'not_found') {
          console.log('🔍 Evaluation not found, will retry...');
          setStatus('processing');
          setAttempts(prev => prev + 1);
        }
      } catch (err: any) {
        console.error('❌ Error polling evaluation:', err);
        
        // Si c'est une erreur 404, continuer à poller (l'évaluation n'est peut-être pas encore créée)
        if (err.status === 404 || err.message?.includes('404')) {
          console.log('🔍 Evaluation not found yet, will retry...');
          setAttempts(prev => prev + 1);
          return;
        }

        // Pour les autres erreurs, arrêter le polling
        setStatus('error');
        setError(err.message || 'Erreur lors de la récupération de l\'évaluation');
        setIsPolling(false);
      }
    };

    // Première tentative immédiate
    pollEvaluation();

    // Puis poller à intervalle régulier
    intervalId = setInterval(pollEvaluation, pollInterval);

    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [sessionId, isPolling, status, attempts, maxAttempts, pollInterval]);

  return {
    status,
    evaluation,
    error,
    progress,
    startPolling,
    stopPolling,
    reset,
  };
}
