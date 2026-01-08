import { createClient, RealtimeChannel } from '@supabase/supabase-js';

// Supabase client for realtime subscriptions
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

let supabaseClient: ReturnType<typeof createClient> | null = null;

/**
 * Get or create Supabase client for realtime
 */
export function getSupabaseClient() {
  if (!supabaseClient && supabaseUrl && supabaseAnonKey) {
    supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      realtime: {
        params: {
          eventsPerSecond: 10, // Limit events to avoid rate limiting
        },
      },
    });
  }
  return supabaseClient;
}

/**
 * Check if Supabase Realtime is available
 */
export function isRealtimeAvailable(): boolean {
  return !!(supabaseUrl && supabaseAnonKey);
}

/**
 * Subscribe to student progress snapshots changes
 *
 * @param callback - Function called when data changes
 * @param filter - Optional filter (e.g., { scenarioId: 5 })
 * @returns Cleanup function to unsubscribe
 */
export function subscribeToProgressSnapshots(
  callback: (payload: any) => void,
  filter?: { scenarioId?: number; studentEmail?: string }
): () => void {
  const client = getSupabaseClient();
  if (!client) {
    console.warn('Supabase client not available for realtime');
    return () => {};
  }

  let channel: RealtimeChannel;

  // Build filter string
  let filterString = '';
  if (filter?.scenarioId) {
    filterString = `scenario_id=eq.${filter.scenarioId}`;
  }
  if (filter?.studentEmail) {
    const separator = filterString ? '&' : '';
    filterString += `${separator}student_email=eq.${filter.studentEmail}`;
  }

  // Create subscription
  channel = client
    .channel('student_progress_changes')
    .on(
      'postgres_changes',
      {
        event: '*', // Listen to all events (INSERT, UPDATE, DELETE)
        schema: 'public',
        table: 'student_progress_snapshots',
        filter: filterString || undefined,
      },
      (payload) => {
        console.log('📡 Realtime update received:', payload);
        callback(payload);
      }
    )
    .subscribe((status) => {
      console.log('📡 Realtime subscription status:', status);
    });

  // Return cleanup function
  return () => {
    console.log('🔌 Unsubscribing from realtime channel');
    channel.unsubscribe();
  };
}

/**
 * Subscribe to session summaries changes
 *
 * @param callback - Function called when data changes
 * @param filter - Optional filter (e.g., { teacherEmail: "teacher@example.com" })
 * @returns Cleanup function to unsubscribe
 */
export function subscribeToSessionSummaries(
  callback: (payload: any) => void,
  filter?: { teacherEmail?: string; sessionDate?: string }
): () => void {
  const client = getSupabaseClient();
  if (!client) {
    console.warn('Supabase client not available for realtime');
    return () => {};
  }

  let channel: RealtimeChannel;

  // Build filter string
  let filterString = '';
  if (filter?.teacherEmail) {
    filterString = `teacher_email=eq.${filter.teacherEmail}`;
  }
  if (filter?.sessionDate) {
    const separator = filterString ? '&' : '';
    filterString += `${separator}session_date=eq.${filter.sessionDate}`;
  }

  // Create subscription
  channel = client
    .channel('session_summaries_changes')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'session_summaries',
        filter: filterString || undefined,
      },
      (payload) => {
        console.log('📡 Session summary update received:', payload);
        callback(payload);
      }
    )
    .subscribe((status) => {
      console.log('📡 Session summary subscription status:', status);
    });

  // Return cleanup function
  return () => {
    console.log('🔌 Unsubscribing from session summaries channel');
    channel.unsubscribe();
  };
}
