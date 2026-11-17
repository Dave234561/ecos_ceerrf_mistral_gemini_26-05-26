import { createClient } from '@supabase/supabase-js';
import type { Teacher, AssignedTeacher } from '../../shared/types.js';
import { withRetry, RetryPresets } from '../utils/retry.js';

interface DatabaseMetrics {
  connectionAttempts: number;
  successfulConnections: number;
  failedConnections: number;
  lastConnectionTime: Date;
  isHealthy: boolean;
  responseTime: number;
}

/**
 * Unified Database Service
 * 
 * Single point of access for all database operations.
 * Uses Supabase REST API exclusively for stability.
 * Eliminates connection pooling conflicts and race conditions.
 */
export class UnifiedDatabaseService {
  private supabase: any = null;
  private isInitialized = false;
  private initializationPromise: Promise<void> | null = null;
  private metrics: DatabaseMetrics;
  private startupTime: Date;
  private fallbackSessions = new Map<string, any>();
  private fallbackSessionMessages = new Map<string, any[]>();
  private fallbackEvaluations = new Map<string, any>();
  private ensuredUsers = new Set<string>();
  
  constructor() {
    this.startupTime = new Date();
    this.metrics = {
      connectionAttempts: 0,
      successfulConnections: 0,
      failedConnections: 0,
      lastConnectionTime: new Date(),
      isHealthy: false,
      responseTime: 0
    };
  }

  /**
   * Initialize the database service (called once)
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;
    
    if (this.initializationPromise) {
      return this.initializationPromise;
    }
    
    this.initializationPromise = this._performInitialization();
    return this.initializationPromise;
  }

  private async _performInitialization(): Promise<void> {
    this.metrics.connectionAttempts++;
    const startTime = Date.now();
    
    try {
      console.log('🔧 Initializing Unified Database Service...');

      let supabaseUrl = process.env.SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

      if (!supabaseUrl || !supabaseKey) {
        throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
      }

      // Convert PostgreSQL URL to HTTP URL if needed
      if (supabaseUrl.startsWith('postgresql://')) {
        const match = supabaseUrl.match(/db\.([^.]+)\.supabase\.co/);
        if (match) {
          const projectId = match[1];
          supabaseUrl = `https://${projectId}.supabase.co`;
          console.log('🔄 Converted to Supabase HTTP URL');
        }
      }

      // Create Supabase client with optimized configuration for high load
      this.supabase = createClient(supabaseUrl, supabaseKey, {
        auth: {
          persistSession: false, // Disable session persistence for better performance
          autoRefreshToken: false, // Disable auto-refresh in server-side context
        },
        global: {
          headers: {
            'x-client-info': 'ecos-ceerrf-server'
          },
        },
        db: {
          schema: 'public',
        },
        // Realtime disabled for performance (not used in this service)
        realtime: {
          params: {
            eventsPerSecond: 2,
          },
        },
      });
      
      // Test connection with health check
      await this._performHealthCheck();
      
      this.isInitialized = true;
      this.metrics.successfulConnections++;
      this.metrics.responseTime = Date.now() - startTime;
      this.metrics.isHealthy = true;
      this.metrics.lastConnectionTime = new Date();
      
      console.log('✅ Unified Database Service initialized successfully');
    } catch (error: any) {
      this.metrics.failedConnections++;
      this.metrics.isHealthy = false;
      console.error('❌ Database service initialization failed:', error.message);
      throw error;
    } finally {
      this.initializationPromise = null;
    }
  }

  private async _performHealthCheck(): Promise<void> {
    const startTime = Date.now();
    
    try {
      // Simple health check query
      const { error } = await this.supabase
        .from('scenarios')
        .select('id')
        .limit(1);
        
      if (error && !error.message.includes('does not exist')) {
        throw error;
      }
      
      this.metrics.responseTime = Date.now() - startTime;
      console.log(`✅ Health check passed (${this.metrics.responseTime}ms)`);
    } catch (error: any) {
      console.warn('⚠️ Health check warning:', error.message);
      // Don't throw for table existence issues
      if (!error.message.includes('does not exist')) {
        throw error;
      }
    }
  }

  /**
   * Get database client (ensures initialization)
   * Public method to allow external services to access the client
   */
  async getClient(): Promise<any> {
    await this.initialize();

    if (!this.supabase) {
      throw new Error('Database service not initialized');
    }

    return this.supabase;
  }

  /**
   * Ensure a user record exists before inserting related rows that depend on email FK
   */
  private async ensureUserExists(email: string | null | undefined): Promise<void> {
    if (!email) return;

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || this.ensuredUsers.has(normalizedEmail)) {
      return;
    }

    try {
      const client = await this.getClient();
      const timestamp = new Date().toISOString();

      const { error } = (await withRetry(
        () => client
          .from('users')
          .upsert([
            {
              email: normalizedEmail,
              updated_at: timestamp
            }
          ], { onConflict: 'email' }),
        {
          ...RetryPresets.database,
          operationName: 'Supabase ensureUserExists'
        }
      )) as any;

      if (error) {
        // Duplicate inserts are safe to ignore; anything else should be logged for visibility
        console.warn(`⚠️ Failed to ensure user ${normalizedEmail}:`, error.message);
        return;
      }

      this.ensuredUsers.add(normalizedEmail);
      console.log(`👤 Ensured user record exists for ${normalizedEmail}`);
    } catch (error: any) {
      console.warn(`⚠️ Error ensuring user ${normalizedEmail}:`, error.message);
    }
  }

  /**
   * Get all scenarios
   */
  async getScenarios(): Promise<any[]> {
    try {
      const client = await this.getClient();
      
      const { data, error } = await client
        .from('scenarios')
        .select(`
          id,
          title,
          description,
          patient_prompt,
          evaluation_criteria,
          image_url,
          voice_type,
          created_by,
          created_at,
          updated_at
        `)
        .order('created_at', { ascending: false });

      if (error) {
        if (error.message.includes('does not exist')) {
          console.log('⚠️ Scenarios table does not exist, returning empty array');
          return [];
        }
        throw error;
      }

      console.log(`✅ Retrieved ${data?.length || 0} scenarios`);
      
      // Map database column names to expected property names
      const mappedData = (data || []).map((scenario: any) => ({
        ...scenario,
        patient_prompt: scenario.patient_prompt || null,
        evaluation_criteria: scenario.evaluation_criteria || null,
        voiceType: scenario.voice_type || 'male'
      }));
      
      return mappedData;
    } catch (error: any) {
      console.error('❌ Error fetching scenarios:', error.message);
      throw error;
    }
  }

  /**
   * Get dashboard statistics
   */
  async getDashboardStats(): Promise<any> {
    try {
      const client = await this.getClient();

      // Get scenarios count using the same method as getScenarios()
      const scenarios = await this.getScenarios();
      const totalScenarios = scenarios.length;

      // Get real session statistics from database with scenario information
      const { data: allSessions, error: sessionsError } = await client
        .from('sessions')
        .select(`
          id,
          session_id,
          student_email,
          scenario_id,
          status,
          start_time,
          end_time,
          created_at,
          updated_at,
          scenarios (
            id,
            title,
            description
          )
        `)
        .order('created_at', { ascending: false });

      if (sessionsError) {
        console.warn('⚠️ Error fetching sessions for stats:', sessionsError.message);
        // Return partial stats with scenarios count
        return {
          totalScenarios,
          activeSessions: 0,
          completedSessions: 0,
          totalStudents: 0,
          sessions: []
        };
      }

      const sessions = allSessions || [];
      const activeSessions = sessions.filter((s: any) => s.status === 'active' || s.status === 'in_progress').length;
      const completedSessions = sessions.filter((s: any) => s.status === 'completed').length;

      // Count ALL students from users table (not just those with sessions)
      let totalStudents = 0;
      try {
        const { data: users, error: usersError } = await client
          .from('users')
          .select('id, email')
          .neq('role', 'admin'); // Exclude admins from student count

        if (!usersError && users) {
          totalStudents = users.length;
        } else {
          // Fallback: count unique students from sessions only
          const uniqueStudents = new Set(sessions.map((s: any) => s.student_email).filter(Boolean));
          totalStudents = uniqueStudents.size;
        }
      } catch (error: any) {
        console.warn('⚠️ Error counting users, falling back to session-based count');
        const uniqueStudents = new Set(sessions.map((s: any) => s.student_email).filter(Boolean));
        totalStudents = uniqueStudents.size;
      }

      console.log(`📊 Dashboard stats: ${totalScenarios} scenarios, ${activeSessions} active sessions, ${completedSessions} completed, ${totalStudents} students`);

      return {
        totalScenarios,
        activeSessions,
        completedSessions,
        totalStudents,
        sessions: sessions.map((s: any) => ({
          id: s.session_id,
          sessionId: s.session_id,
          studentEmail: s.student_email,
          scenarioId: s.scenario_id,
          scenarioTitle: s.scenarios?.title || 'Scénario inconnu',
          scenarioDescription: s.scenarios?.description || '',
          status: s.status,
          startTime: s.start_time,
          endTime: s.end_time,
          createdAt: s.created_at,
          updatedAt: s.updated_at
        }))
      };
    } catch (error: any) {
      console.error('❌ Error fetching dashboard stats:', error.message);
      return {
        totalScenarios: 0,
        activeSessions: 0,
        completedSessions: 0,
        totalStudents: 0,
        sessions: []
      };
    }
  }

  /**
   * Get students (placeholder for future implementation)
   */
  async getStudents(): Promise<any[]> {
    try {
      const client = await this.getClient();
      
      // For now, return empty array - implement based on your needs
      return [];
    } catch (error: any) {
      console.error('❌ Error fetching students:', error.message);
      return [];
    }
  }

  /**
   * Health check method
   */
  async healthCheck(): Promise<{ status: string; metrics: DatabaseMetrics; uptime: number }> {
    try {
      await this._performHealthCheck();
      
      return {
        status: 'healthy',
        metrics: { ...this.metrics },
        uptime: Date.now() - this.startupTime.getTime()
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        metrics: { ...this.metrics, isHealthy: false },
        uptime: Date.now() - this.startupTime.getTime()
      };
    }
  }

  /**
   * Create a new scenario
   */
  async createScenario(scenarioData: any): Promise<any> {
    const client = await this.getClient();

    // Guarantee creator exists to satisfy foreign key constraints on scenarios.created_by
    await this.ensureUserExists(scenarioData.createdBy);
    
    const { data, error } = await client
      .from('scenarios')
      .insert({
        title: scenarioData.title,
        description: scenarioData.description,
        patient_prompt: scenarioData.patientPrompt,
        evaluation_criteria: scenarioData.evaluationCriteria,
        voice_type: scenarioData.voiceType || 'male',
        image_url: scenarioData.imageUrl || null,
        created_by: scenarioData.createdBy,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Update scenario
   */
  async updateScenario(id: string, updates: any): Promise<any> {
    const client = await this.getClient();
    
    // First, check if scenario exists
    const { data: existingScenario, error: findError } = await client
      .from('scenarios')
      .select('id, title')
      .eq('id', id)
      .single();

    if (findError) {
      if (findError.code === 'PGRST116') {
        // No rows found
        console.error(`❌ Scenario ${id} not found in database`);
        throw new Error(`Scenario with ID ${id} does not exist`);
      }
      console.error(`❌ Error checking scenario ${id}:`, findError);
      throw findError;
    }

    console.log(`✅ Scenario ${id} exists: "${existingScenario.title}"`);
    
    const updateData: any = {
      updated_at: new Date().toISOString()
    };

    if (updates.title) updateData.title = updates.title;
    if (updates.description !== undefined) updateData.description = updates.description;
    if (updates.patientPrompt !== undefined) updateData.patient_prompt = updates.patientPrompt;
    if (updates.evaluationCriteria !== undefined) updateData.evaluation_criteria = updates.evaluationCriteria;
    if (updates.imageUrl !== undefined) updateData.image_url = updates.imageUrl;
    if (updates.voiceType !== undefined) updateData.voice_type = updates.voiceType;
    if (updates.pineconeIndex !== undefined) updateData.pinecone_index = updates.pineconeIndex;

    console.log(`📊 Updating scenario ${id} with data:`, updateData);

    const { data, error } = await client
      .from('scenarios')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error(`❌ Error updating scenario ${id}:`, error);
      throw error;
    }

    console.log(`✅ Scenario ${id} updated successfully:`, data);
    return data;
  }

  /**
   * Update scenario criteria specifically (convenience method)
   */
  async updateScenarioCriteria(id: string, criteria: any): Promise<any> {
    console.log(`📊 Updating criteria for scenario ${id}`);
    return this.updateScenario(id, { evaluationCriteria: criteria });
  }

  /**
   * Get available scenario IDs and titles for validation
   */
  async getAvailableScenarioIds(): Promise<Array<{id: number, title: string}>> {
    try {
      const client = await this.getClient();
      
      const { data, error } = await client
        .from('scenarios')
        .select('id, title')
        .order('id', { ascending: true });

      if (error) {
        if (error.message.includes('does not exist')) {
          console.log('⚠️ Scenarios table does not exist, returning empty array');
          return [];
        }
        throw error;
      }

      console.log(`📋 Available scenarios: ${(data || []).map((s: any) => `ID ${s.id}: "${s.title}"`).join(', ')}`);
      return data || [];
    } catch (error: any) {
      console.error('❌ Error fetching available scenario IDs:', error.message);
      return [];
    }
  }

  /**
   * Delete scenario
   */
  async deleteScenario(id: string): Promise<void> {
    const client = await this.getClient();
    
    const { error } = await client
      .from('scenarios')
      .delete()
      .eq('id', id);

    if (error) throw error;
  }

  /**
   * Store conversation exchange in database
   */
  async storeConversationExchange(exchange: {
    email: string;
    question: string;
    response: string;
    sessionId?: string;
    scenarioId?: number;
    studentRole?: string;
    contextData?: any;
  }): Promise<any> {
    try {
      const client = await this.getClient();

      let sessionDbId: number | null = null;
      if (exchange.sessionId) {
        const session = await this.getSessionByStringId(exchange.sessionId);
        sessionDbId = session?.id ?? null;
      }

      const { data, error } = await client
        .from('exchanges')
        .insert({
          session_id: sessionDbId,
          question: exchange.question,
          response: exchange.response,
          role: 'system',
          timestamp: new Date().toISOString(),
          metadata: {
            email: exchange.email,
            scenarioId: exchange.scenarioId,
            studentRole: exchange.studentRole,
            contextData: exchange.contextData,
            source: 'patient_simulator'
          }
        })
        .select()
        .single();

      if (error) {
        console.error('❌ Error storing conversation exchange:', error);
        throw error;
      }

      console.log(`💾 Stored conversation exchange for session ${exchange.sessionId}`);
      if (exchange.sessionId) {
        const timestamp = new Date().toISOString();
        this.addFallbackSessionMessage(exchange.sessionId, {
          role: 'user',
          question: exchange.question,
          response: '',
          timestamp,
          isFallback: !sessionDbId
        });
        this.addFallbackSessionMessage(exchange.sessionId, {
          role: 'assistant',
          question: '',
          response: exchange.response,
          timestamp,
          isFallback: !sessionDbId
        });
      }
      return data;
    } catch (error: any) {
      console.error('❌ Failed to store conversation exchange:', error);
      if (exchange.sessionId) {
        const timestamp = new Date().toISOString();
        this.addFallbackSessionMessage(exchange.sessionId, {
          role: 'user',
          question: exchange.question,
          response: '',
          timestamp,
          isFallback: true
        });
        this.addFallbackSessionMessage(exchange.sessionId, {
          role: 'assistant',
          question: '',
          response: exchange.response,
          timestamp,
          isFallback: true
        });
      }
      // Don't throw - conversation storage failure shouldn't break the flow
      return null;
    }
  }

  /**
   * Get conversation history for a session
   */
  async getConversationHistory(sessionId: string, limit: number = 50): Promise<any[]> {
    try {
      const client = await this.getClient();

      const session = await this.getSessionByStringId(sessionId);
      if (!session) {
        console.warn(`⚠️ Session ${sessionId} not found, returning empty conversation history`);
        return [];
      }

      const { data, error } = await client
        .from('exchanges')
        .select('*')
        .eq('session_id', session.id)
        .order('timestamp', { ascending: true })
        .limit(limit);

      if (error) {
        console.error('❌ Error fetching conversation history:', error);
        return [];
      }

      console.log(`📚 Retrieved ${data?.length || 0} conversation exchanges for session ${sessionId}`);
      return data || [];
    } catch (error: any) {
      console.error('❌ Error fetching conversation history:', error.message);
      return [];
    }
  }

  /**
   * Get recent conversations for a student
   */
  async getStudentConversations(email: string, limit: number = 100): Promise<any[]> {
    try {
      const client = await this.getClient();
      
      const { data, error } = await client
        .from('exchanges')
        .select('*')
        .contains('metadata', { email })
        .order('timestamp', { ascending: false })
        .limit(limit);

      if (error) throw error;

      console.log(`📚 Retrieved ${data?.length || 0} conversations for student ${email}`);
      return data || [];
    } catch (error: any) {
      console.error('❌ Error fetching student conversations:', error.message);
      return [];
    }
  }

  // ====================================
  // TRAINING SESSIONS MANAGEMENT
  // ====================================

  /**
   * Create a new training session
   */
  async createTrainingSession(sessionData: {
    title: string;
    description?: string;
    createdBy: string;
    scenarioIds: number[];
    studentEmails: string[];
    startDate?: string;
    endDate?: string;
  }): Promise<any> {
    try {
      const client = await this.getClient();

      // Create the main training session
      const { data: trainingSession, error: sessionError } = await client
        .from('training_sessions')
        .insert({
          title: sessionData.title,
          description: sessionData.description,
          created_by: sessionData.createdBy,
          scenario_ids: sessionData.scenarioIds,
          status: 'active',
          start_date: sessionData.startDate || new Date().toISOString(),
          end_date: sessionData.endDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select()
        .single();

      if (sessionError) throw sessionError;

      // Add students to the training session
      if (sessionData.studentEmails && sessionData.studentEmails.length > 0) {
        const studentAssignments = sessionData.studentEmails.map(email => ({
          training_session_id: trainingSession.id,
          student_email: email.trim().toLowerCase(),
          assigned_at: new Date().toISOString(),
          status: 'assigned'
        }));

        const { error: studentsError } = await client
          .from('training_session_students')
          .insert(studentAssignments);

        if (studentsError) throw studentsError;
      }

      console.log(`✅ Created training session: ${trainingSession.title} with ID: ${trainingSession.id}`);
      
      return {
        ...trainingSession,
        startDate: trainingSession.start_date,
        endDate: trainingSession.end_date,
        studentEmails: sessionData.studentEmails,
        scenarioIds: sessionData.scenarioIds
      };
    } catch (error: any) {
      console.error('❌ Error creating training session:', error.message);
      throw error;
    }
  }

  /**
   * Private helper: Verify user has access to a training session
   * Checks both created_by and training_session_teachers table
   * Throws error if access is denied
   */
  private async _verifyTrainingSessionAccess(session: any, userEmail: string): Promise<void> {
    // Check if user is the creator
    if (session.created_by === userEmail) {
      return; // Access granted
    }

    // Check if user is an assigned teacher
    const client = await this.getClient();
    const { data: teacherAssignment, error: teacherError } = await client
      .from('training_session_teachers')
      .select('id')
      .eq('training_session_id', session.id)
      .eq('teacher_email', userEmail)
      .single();

    // Handle critical database errors (not "no rows" or "table doesn't exist")
    if (teacherError && teacherError.code !== 'PGRST116' && teacherError.code !== '42P01') {
      console.error(`❌ Database error checking teacher access for session ${session.id}:`, teacherError);
      throw teacherError;
    }

    // Log warning if table is missing (migration not applied)
    if (teacherError && teacherError.code === '42P01') {
      console.warn(`⚠️ Table training_session_teachers not found - multi-teacher feature unavailable`);
    }

    // If teacher assignment found, grant access
    if (teacherAssignment) {
      return; // Access granted
    }

    // If we reach here, access is denied
    console.log(`🔒 Access denied: ${userEmail} is not creator or assigned teacher for session ${session.id}`);
    throw new Error(`You don't have permission to access training session ${session.id}`);
  }

  /**
   * Get all training sessions for an admin
   */
  async getTrainingSessions(createdBy: string): Promise<any[]> {
    try {
      const client = await this.getClient();

      // OPTIMIZATION: Try to get teacher assignments first
      const { data: teacherAssignments, error: assignmentsError } = await client
        .from('training_session_teachers')
        .select('training_session_id')
        .eq('teacher_email', createdBy);

      let allSessions: any[] = [];

      // Check if training_session_teachers table exists and query succeeded
      if (assignmentsError) {
        const isTableMissing = assignmentsError.code === '42P01'; // Table doesn't exist
        const isCriticalError = assignmentsError.code !== 'PGRST116' && !isTableMissing;

        if (isCriticalError) {
          console.error(`❌ Critical database error fetching teacher assignments for ${createdBy}:`, assignmentsError);
          throw assignmentsError;
        }

        if (isTableMissing) {
          console.warn(`⚠️ Table training_session_teachers not found - migration may not be applied yet. Falling back to created_by only.`);
        }

        // FALLBACK: If table missing or error, use simple created_by filter
        const { data: createdSessions, error: createdError } = await client
          .from('training_sessions')
          .select('*')
          .eq('created_by', createdBy)
          .order('created_at', { ascending: false });

        if (createdError) throw createdError;
        allSessions = createdSessions || [];

      } else {
        // OPTIMIZED PATH: Use OR filter to get all sessions in one query
        // Get sessions where user is creator OR assigned teacher
        const assignedSessionIds = (teacherAssignments || []).map((a: any) => a.training_session_id);

        // Build OR filter: created_by = X OR id IN (assigned sessions)
        const orConditions = [`created_by.eq.${createdBy}`];
        if (assignedSessionIds.length > 0) {
          orConditions.push(`id.in.(${assignedSessionIds.join(',')})`);
        }

        const { data: allSessionsData, error: sessionsError } = await client
          .from('training_sessions')
          .select('*')
          .or(orConditions.join(','))
          .order('created_at', { ascending: false });

        if (sessionsError) throw sessionsError;

        allSessions = allSessionsData || [];
        console.log(`⚡ Optimized query: Retrieved ${allSessions.length} sessions (created or assigned) in single query`);
      }

      // Get associated students for each session
      const sessionsWithDetails = await Promise.all(
        allSessions.map(async (session: any) => {
          // Get students
          const { data: students, error: studentsError } = await client
            .from('training_session_students')
            .select('student_email, assigned_at, status')
            .eq('training_session_id', session.id);

          if (studentsError) {
            console.warn(`Warning: Could not fetch students for session ${session.id}:`, studentsError.message);
          }

          // Get scenario details
          let scenarioDetails = [];
          if (session.scenario_ids && session.scenario_ids.length > 0) {
            const { data: scenarios, error: scenariosError } = await client
              .from('scenarios')
              .select('id, title, description')
              .in('id', session.scenario_ids);

            if (scenariosError) {
              console.warn(`Warning: Could not fetch scenarios for session ${session.id}:`, scenariosError.message);
            } else {
              scenarioDetails = scenarios || [];
            }
          }

          return {
            ...session,
            startDate: session.start_date,
            endDate: session.end_date,
            students: students || [],
            scenarios: scenarioDetails,
            studentCount: (students || []).length,
            scenarioCount: scenarioDetails.length
          };
        })
      );

      console.log(`📚 Retrieved ${sessionsWithDetails.length} training sessions for ${createdBy}`);
      return sessionsWithDetails;
    } catch (error: any) {
      console.error('❌ Error fetching training sessions:', error.message);
      return [];
    }
  }

  /**
   * Get a specific training session by ID
   */
  async getTrainingSessionById(id: string, createdBy: string): Promise<any | null> {
    try {
      const client = await this.getClient();

      // First get the session
      const { data: session, error } = await client
        .from('training_sessions')
        .select('*')
        .eq('id', parseInt(id))
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return null; // Not found
        }
        throw error;
      }

      // Verify user has access (created_by OR in training_session_teachers)
      try {
        await this._verifyTrainingSessionAccess(session, createdBy);
      } catch (error: any) {
        // For GET operations, return null instead of throwing
        // (This maintains backward compatibility with existing error handling)
        if (error.message.includes("don't have permission")) {
          return null;
        }
        // Re-throw other errors (database errors, etc.)
        throw error;
      }

      // Get associated students
      const { data: students, error: studentsError } = await client
        .from('training_session_students')
        .select('student_email, assigned_at, status')
        .eq('training_session_id', session.id);

      if (studentsError) {
        console.warn(`Warning: Could not fetch students for session ${id}:`, studentsError.message);
      }

      // Get scenario details
      let scenarioDetails = [];
      if (session.scenario_ids && session.scenario_ids.length > 0) {
        const { data: scenarios, error: scenariosError } = await client
          .from('scenarios')
          .select('id, title, description')
          .in('id', session.scenario_ids);

        if (scenariosError) {
          console.warn(`Warning: Could not fetch scenarios for session ${id}:`, scenariosError.message);
        } else {
          scenarioDetails = scenarios || [];
        }
      }

      console.log(`📚 Retrieved training session ${id} for ${createdBy}`);
      return {
        ...session,
        startDate: session.start_date,
        endDate: session.end_date,
        students: students || [],
        scenarios: scenarioDetails,
        studentCount: (students || []).length,
        scenarioCount: scenarioDetails.length
      };
    } catch (error: any) {
      console.error('❌ Error fetching training session:', error.message);
      throw error;
    }
  }

  /**
   * Update a training session
   * Checks both created_by and training_session_teachers for multi-teacher access
   */
  async updateTrainingSession(id: string, updates: any, createdBy: string): Promise<any> {
    try {
      const client = await this.getClient();

      console.log(`🔍 Updating training session - ID: ${id}, createdBy: ${createdBy}, updates:`, JSON.stringify(updates));

      // Step 1: Get the session to verify it exists
      const { data: session, error: sessionError } = await client
        .from('training_sessions')
        .select('*')
        .eq('id', parseInt(id))
        .single();

      if (sessionError || !session) {
        console.error('❌ Training session not found:', id, sessionError);
        throw new Error(`Training session ${id} not found`);
      }

      // Step 2: Verify user has access (created_by OR in training_session_teachers)
      await this._verifyTrainingSessionAccess(session, createdBy);

      // Step 3: Prepare update data - convert camelCase to snake_case and filter valid fields
      const { studentEmails, selectedScenarios, ...restUpdates } = updates;

      // Map of camelCase -> snake_case conversions
      const fieldMapping: { [key: string]: string } = {
        'scenarioIds': 'scenario_ids',
        'startDate': 'start_date',
        'endDate': 'end_date',
        'createdBy': 'created_by'
      };

      // Build clean update object with only valid training_sessions columns
      const cleanUpdates: any = {};
      const validFields = ['title', 'description', 'scenario_ids', 'start_date', 'end_date'];

      for (const [key, value] of Object.entries(restUpdates)) {
        // Convert camelCase to snake_case if mapping exists
        const dbField = fieldMapping[key] || key;

        // Only include valid database fields
        if (validFields.includes(dbField)) {
          cleanUpdates[dbField] = value;
        }
      }

      // Add updated_at timestamp
      cleanUpdates.updated_at = new Date().toISOString();

      console.log(`📝 Clean updates for database:`, JSON.stringify(cleanUpdates));

      // Step 4: Perform the update (without created_by constraint since we already verified access)
      const { data: updatedSession, error: updateError } = await client
        .from('training_sessions')
        .update(cleanUpdates)
        .eq('id', parseInt(id))
        .select()
        .single();

      if (updateError) {
        console.error('❌ Supabase error updating training session:', updateError);
        throw updateError;
      }

      // Step 5: Handle studentEmails if provided
      if (studentEmails && Array.isArray(studentEmails) && studentEmails.length > 0) {
        console.log(`👥 Adding ${studentEmails.length} new students to session ${id}`);

        // Add new students to training_session_students table
        const studentsToAdd = studentEmails.map((email: string) => ({
          training_session_id: parseInt(id),
          student_email: email.trim().toLowerCase(),
          assigned_at: new Date().toISOString(),
          status: 'active'
        }));

        const { error: studentsError } = await client
          .from('training_session_students')
          .upsert(studentsToAdd, {
            onConflict: 'training_session_id,student_email',
            ignoreDuplicates: true
          });

        if (studentsError) {
          console.warn(`⚠️ Warning: Could not add students to session ${id}:`, studentsError.message);
          // Don't throw - student addition is not critical for session update
        }
      }

      console.log(`✅ Updated training session ${id} by ${createdBy}`);
      return {
        ...updatedSession,
        startDate: updatedSession.start_date,
        endDate: updatedSession.end_date
      };
    } catch (error: any) {
      console.error('❌ Error updating training session:', error.message);
      throw error;
    }
  }

  /**
   * Delete a training session
   * Checks both created_by and training_session_teachers for multi-teacher access
   */
  async deleteTrainingSession(id: string, createdBy: string): Promise<void> {
    try {
      const client = await this.getClient();

      console.log(`🔍 Deleting training session - ID: ${id}, createdBy: ${createdBy}`);

      // Step 1: Get the session to verify it exists
      const { data: session, error: sessionError } = await client
        .from('training_sessions')
        .select('*')
        .eq('id', parseInt(id))
        .single();

      if (sessionError || !session) {
        console.error('❌ Training session not found:', id, sessionError);
        throw new Error(`Training session ${id} not found`);
      }

      // Step 2: Verify user has access (created_by OR in training_session_teachers)
      await this._verifyTrainingSessionAccess(session, createdBy);

      // Step 3: Delete associated data first (students and teachers)
      console.log(`🗑️ Deleting associated students for session ${id}`);
      const { error: studentsDeleteError } = await client
        .from('training_session_students')
        .delete()
        .eq('training_session_id', parseInt(id));

      // Ignore error if table doesn't exist (migration not applied)
      if (studentsDeleteError && studentsDeleteError.code !== '42P01') {
        console.error('❌ Error deleting session students:', studentsDeleteError);
        throw studentsDeleteError;
      }

      console.log(`🗑️ Deleting associated teachers for session ${id}`);
      const { error: teachersDeleteError } = await client
        .from('training_session_teachers')
        .delete()
        .eq('training_session_id', parseInt(id));

      // Ignore error if table doesn't exist (migration not applied)
      if (teachersDeleteError && teachersDeleteError.code !== '42P01') {
        console.error('❌ Error deleting session teachers:', teachersDeleteError);
        throw teachersDeleteError;
      }

      // Step 4: Delete the training session (without created_by constraint since we already verified access)
      const { error: deleteError } = await client
        .from('training_sessions')
        .delete()
        .eq('id', parseInt(id));

      if (deleteError) {
        console.error('❌ Supabase error deleting training session:', deleteError);
        throw deleteError;
      }

      console.log(`✅ Deleted training session ${id} by ${createdBy}`);
    } catch (error: any) {
      console.error('❌ Error deleting training session:', error.message);
      throw error;
    }
  }

  // ====================================
  // TEACHER MANAGEMENT
  // ====================================

  /**
   * Get all teachers (users with role 'teacher' or 'admin')
   */
  async getTeachers(): Promise<Teacher[]> {
    try {
      const client = await this.getClient();

      const { data: teachers, error } = await client
        .from('users')
        .select('id, email, role, created_at')
        .in('role', ['teacher', 'admin'])
        .order('email', { ascending: true });

      if (error) {
        // If users table doesn't exist or role column missing, return empty
        if (error.code === '42P01' || error.code === '42703') {
          console.warn(`⚠️ Users table or role column not found - returning empty teachers list`);
          return [];
        }
        throw error;
      }

      console.log(`📋 Retrieved ${teachers?.length || 0} teachers`);
      return (teachers || []) as Teacher[];
    } catch (error: any) {
      console.error('❌ Error getting teachers:', error.message);
      return [];
    }
  }

  /**
   * Get teachers assigned to a specific training session
   */
  async getSessionTeachers(sessionId: number): Promise<AssignedTeacher[]> {
    try {
      const client = await this.getClient();

      const { data: assignments, error } = await client
        .from('training_session_teachers')
        .select('teacher_email, assigned_at')
        .eq('training_session_id', sessionId);

      if (error) {
        // If table doesn't exist, return empty
        if (error.code === '42P01') {
          console.warn(`⚠️ training_session_teachers table not found - returning empty list`);
          return [];
        }
        throw error;
      }

      console.log(`📋 Retrieved ${assignments?.length || 0} teachers for session ${sessionId}`);
      return (assignments || []) as AssignedTeacher[];
    } catch (error: any) {
      console.error('❌ Error getting session teachers:', error.message);
      return [];
    }
  }

  /**
   * Assign teachers to a training session
   */
  async assignTeachersToSession(sessionId: number, teacherEmails: string[]): Promise<void> {
    try {
      const client = await this.getClient();

      if (!teacherEmails || teacherEmails.length === 0) {
        console.log(`ℹ️ No teachers to assign to session ${sessionId}`);
        return;
      }

      const teachersToAdd = teacherEmails.map(email => ({
        training_session_id: sessionId,
        teacher_email: email.trim().toLowerCase(),
        assigned_at: new Date().toISOString()
      }));

      const { error } = await client
        .from('training_session_teachers')
        .upsert(teachersToAdd, {
          onConflict: 'training_session_id,teacher_email',
          ignoreDuplicates: true
        });

      if (error) {
        // If table doesn't exist, log warning but don't throw
        if (error.code === '42P01') {
          console.warn(`⚠️ training_session_teachers table not found - cannot assign teachers`);
          return;
        }
        throw error;
      }

      console.log(`✅ Assigned ${teacherEmails.length} teacher(s) to session ${sessionId}`);
    } catch (error: any) {
      console.error('❌ Error assigning teachers to session:', error.message);
      throw error;
    }
  }

  /**
   * Remove teachers from a training session
   */
  async removeTeachersFromSession(sessionId: number, teacherEmails: string[]): Promise<void> {
    try {
      const client = await this.getClient();

      if (!teacherEmails || teacherEmails.length === 0) {
        console.log(`ℹ️ No teachers to remove from session ${sessionId}`);
        return;
      }

      const normalizedEmails = teacherEmails.map(email => email.trim().toLowerCase());

      const { error } = await client
        .from('training_session_teachers')
        .delete()
        .eq('training_session_id', sessionId)
        .in('teacher_email', normalizedEmails);

      if (error) {
        // If table doesn't exist, log warning but don't throw
        if (error.code === '42P01') {
          console.warn(`⚠️ training_session_teachers table not found - cannot remove teachers`);
          return;
        }
        throw error;
      }

      console.log(`✅ Removed ${teacherEmails.length} teacher(s) from session ${sessionId}`);
    } catch (error: any) {
      console.error('❌ Error removing teachers from session:', error.message);
      throw error;
    }
  }

  // ====================================
  // ECOS SESSION MANAGEMENT
  // ====================================

  /**
   * Create a new ECOS session in database
   */
  async createSession(sessionData: {
    sessionId: string;
    studentEmail: string;
    scenarioId: number;
    status?: string;
  }): Promise<any> {
    try {
      const client = await this.getClient();

      // Ensure student exists to satisfy sessions.student_email foreign key
      await this.ensureUserExists(sessionData.studentEmail);

      const { data, error } = (await withRetry(
        () => client
          .from('sessions')
          .insert({
            session_id: sessionData.sessionId,
            student_email: sessionData.studentEmail,
            scenario_id: sessionData.scenarioId,
            status: sessionData.status || 'active',
            start_time: new Date().toISOString(),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .select()
          .single(),
        {
          ...RetryPresets.database,
          operationName: 'Supabase createSession'
        }
      )) as any;

      if (error) {
        console.error('❌ Error creating ECOS session:', error);
        throw error;
      }

      console.log(`✅ Created ECOS session ${sessionData.sessionId} for student ${sessionData.studentEmail}`);
      const record = {
        ...data,
        isFallback: false
      };
      this.fallbackSessions.set(sessionData.sessionId, record);
      return record;
    } catch (error: any) {
      console.error('❌ Failed to create ECOS session:', error.message);
      const fallbackRecord = {
        id: `fallback-session-${Date.now()}`,
        session_id: sessionData.sessionId,
        student_email: sessionData.studentEmail,
        scenario_id: sessionData.scenarioId,
        status: sessionData.status || 'active',
        start_time: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        isFallback: true
      };
      this.fallbackSessions.set(sessionData.sessionId, fallbackRecord);
      console.warn(`⚠️ Stored session ${sessionData.sessionId} in fallback memory store`);
      throw error;
    }
  }

  /**
   * Get ECOS session by string session ID
   */
  async getSessionByStringId(sessionId: string): Promise<any> {
    const fallbackSession = this.fallbackSessions.get(sessionId) || null;

    try {
      const client = await this.getClient();

      const { data, error } = await client
        .from('sessions')
        .select('*')
        .eq('session_id', sessionId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          // No rows found
          return fallbackSession;
        }
        throw error;
      }

      const record = {
        ...data,
        isFallback: false
      };
      this.fallbackSessions.set(sessionId, record);
      return record;
    } catch (error: any) {
      console.error('❌ Error getting session by string ID:', error.message);
      if (fallbackSession) {
        console.warn(`⚠️ Using fallback session for ${sessionId}`);
      }
      return fallbackSession;
    }
  }

  /**
   * Get all ECOS sessions for a student (filtered by email)
   * Returns sessions with scenario information for the student history tab
   */
  async getStudentSessions(studentEmail: string): Promise<any[]> {
    try {
      const client = await this.getClient();

      console.log(`🔍 Fetching sessions for student: ${studentEmail}`);

      const { data, error } = await client
        .from('sessions')
        .select(`
          id,
          session_id,
          student_email,
          scenario_id,
          status,
          start_time,
          end_time,
          created_at,
          updated_at,
          scenarios (
            id,
            title,
            description
          )
        `)
        .eq('student_email', studentEmail)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('❌ Error fetching student sessions:', error);
        return [];
      }

      console.log(`✅ Found ${data?.length || 0} sessions for student ${studentEmail}`);

      // Format the response to match the expected structure
      // Filter out sessions without a valid session_id
      return (data || [])
        .filter((session: any) => session.session_id && session.session_id !== 'null' && session.session_id !== 'undefined')
        .map((session: any) => ({
        id: session.session_id,
        sessionId: session.session_id,
        studentEmail: session.student_email,
        scenarioId: session.scenario_id,
        scenarioTitle: session.scenarios?.title || 'Unknown Scenario',
        scenarioDescription: session.scenarios?.description || '',
        status: session.status,
        startTime: session.start_time,
        endTime: session.end_time,
        createdAt: session.created_at,
        updatedAt: session.updated_at
      }));

    } catch (error: any) {
      console.error('❌ Error in getStudentSessions:', error.message);
      return [];
    }
  }

  /**
   * Get all ECOS sessions for a training session (for teacher view)
   * Returns all sessions of all students enrolled in the training session
   */
  async getTrainingSessionSessions(trainingSessionId: number): Promise<any[]> {
    try {
      const client = await this.getClient();

      console.log(`🔍 Fetching all sessions for training session: ${trainingSessionId}`);

      // First, get all students enrolled in this training session
      const { data: enrollments, error: enrollmentError } = await client
        .from('training_session_students')
        .select('student_email')
        .eq('training_session_id', trainingSessionId);

      if (enrollmentError) {
        console.error('❌ Error fetching training session students:', enrollmentError);
        return [];
      }

      if (!enrollments || enrollments.length === 0) {
        console.log(`ℹ️ No students enrolled in training session ${trainingSessionId}`);
        return [];
      }

      const studentEmails = enrollments.map((e: any) => e.student_email);
      console.log(`📚 Found ${studentEmails.length} students in training session`);

      // Get all sessions for these students
      const { data, error } = await client
        .from('sessions')
        .select(`
          id,
          session_id,
          student_email,
          scenario_id,
          status,
          start_time,
          end_time,
          created_at,
          updated_at,
          scenarios (
            id,
            title,
            description
          )
        `)
        .in('student_email', studentEmails)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('❌ Error fetching training session sessions:', error);
        return [];
      }

      console.log(`✅ Found ${data?.length || 0} total sessions for training session ${trainingSessionId}`);

      // Format the response to match the expected structure
      return (data || []).map((session: any) => ({
        id: session.session_id,
        sessionId: session.session_id,
        studentEmail: session.student_email,
        scenarioId: session.scenario_id,
        scenarioTitle: session.scenarios?.title || 'Unknown Scenario',
        scenarioDescription: session.scenarios?.description || '',
        status: session.status,
        startTime: session.start_time,
        endTime: session.end_time,
        createdAt: session.created_at,
        updatedAt: session.updated_at
      }));

    } catch (error: any) {
      console.error('❌ Error in getTrainingSessionSessions:', error.message);
      return [];
    }
  }

  // Method removed - duplicate of updateSessionStatus at line 1696

  /**
   * Store message in ECOS session
   */
  async storeSessionMessage(messageData: {
    sessionId: string;
    role: 'user' | 'assistant';
    question?: string;
    response?: string;
    content?: string;
  }): Promise<any> {
    try {
      const client = await this.getClient();

      // First get the session to get the database ID
      const session = await this.getSessionByStringId(messageData.sessionId);
      if (!session) {
        console.warn(`⚠️ [storeSessionMessage] Session ${messageData.sessionId} not found in DB - storing in fallback only`);
        console.warn(`⚠️ [storeSessionMessage] This message will be LOST on server restart!`);
        this.addFallbackSessionMessage(messageData.sessionId, {
          role: messageData.role,
          question: messageData.question || messageData.content || '',
          response: messageData.response || '',
          timestamp: new Date().toISOString(),
          isFallback: true
        });
        return null;
      }

      console.log(`🔍 [storeSessionMessage] Found session in DB - id: ${session.id}, attempting insert...`);

      const timestamp = new Date().toISOString();
      const { data, error } = (await withRetry(
        () => client
          .from('exchanges')
          .insert({
            session_id: session.id, // Use database integer ID
            role: messageData.role,
            question: messageData.question || messageData.content || '',
            response: messageData.response || '',
            timestamp
          })
          .select()
          .single(),
        {
          ...RetryPresets.database,
          operationName: 'Supabase storeSessionMessage'
        }
      )) as any;

      if (error) {
        console.error(`❌ [storeSessionMessage] Supabase insert failed for session ${messageData.sessionId}:`, error);
        console.error(`❌ [storeSessionMessage] Error code: ${error.code}, message: ${error.message}`);
        console.error(`❌ [storeSessionMessage] Payload attempted: session_id=${session.id}, role=${messageData.role}`);
        throw error;
      }

      console.log(`✅ [storeSessionMessage] Successfully stored ${messageData.role} message in DB for session ${messageData.sessionId}`);
      this.addFallbackSessionMessage(messageData.sessionId, {
        role: messageData.role,
        question: messageData.question || messageData.content || '',
        response: messageData.response || '',
        timestamp,
        isFallback: false
      });
      return data;
    } catch (error: any) {
      console.error(`❌ [storeSessionMessage] CRITICAL: Failed to store message in DB for session ${messageData.sessionId}`);
      console.error(`❌ [storeSessionMessage] Error: ${error.message}`);
      console.error(`❌ [storeSessionMessage] Stack: ${error.stack}`);
      console.warn(`⚠️ [storeSessionMessage] Storing in fallback memory - data will be LOST on restart`);

      this.addFallbackSessionMessage(messageData.sessionId, {
        role: messageData.role,
        question: messageData.question || messageData.content || '',
        response: messageData.response || '',
        timestamp: new Date().toISOString(),
        isFallback: true
      });

      // Don't throw - message storage failure shouldn't break the flow
      // But log prominently so we know there's an issue
      return null;
    }
  }

  /**
   * Get messages for an ECOS session
   */
  async getSessionMessages(sessionId: string, limit: number = 50): Promise<any[]> {
    const fallbackMessages = this.fallbackSessionMessages.get(sessionId) || [];

    try {
      const client = await this.getClient();

      // First get the session to get the database ID
      const session = await this.getSessionByStringId(sessionId);
      if (!session) {
        console.warn(`⚠️ Session ${sessionId} not found, returning empty messages`);
        return fallbackMessages;
      }

      const { data, error} = await client
        .from('exchanges')
        .select('*')
        .eq('session_id', session.id) // Use database integer ID
        .neq('role', 'system') // Exclude 'system' role messages (duplicates)
        .order('timestamp', { ascending: true })
        .limit(limit);

      if (error) {
        console.error('❌ Error fetching session messages:', error);
        console.warn(`⚠️ Using ${fallbackMessages.length} fallback messages instead`);
        return fallbackMessages;
      }

      const messages = data || [];
      console.log(`📚 Retrieved ${messages.length} messages from DB for session ${sessionId} (excluded 'system' role duplicates)`);

      // ✅ If DB is empty but we have fallback messages, use fallback
      if (messages.length === 0 && fallbackMessages.length > 0) {
        console.warn(`⚠️ DB returned 0 messages but found ${fallbackMessages.length} fallback messages - using fallback`);
        return fallbackMessages;
      }

      // Store DB messages in fallback for redundancy
      if (messages.length > 0) {
        this.fallbackSessionMessages.set(sessionId, messages);
      }

      return messages.length > 0 ? messages : fallbackMessages;
    } catch (error: any) {
      console.error('❌ Error fetching session messages:', error.message);
      return fallbackMessages;
    }
  }

  /**
   * Update ECOS session status
   */
  async updateSessionStatus(sessionId: string, status: string): Promise<any> {
    try {
      const client = await this.getClient();

      const { data, error } = await client
        .from('sessions')
        .update({
          status: status,
          end_time: status === 'completed' ? new Date().toISOString() : null,
          updated_at: new Date().toISOString()
        })
        .eq('session_id', sessionId)
        .select()
        .single();

      if (error) {
        console.error('❌ Error updating session status:', error);
        throw error;
      }

      console.log(`✅ Updated session ${sessionId} status to ${status}`);
      const record = {
        ...data,
        isFallback: false
      };
      this.fallbackSessions.set(sessionId, record);
      return record;
    } catch (error: any) {
      console.error('❌ Failed to update session status:', error.message);
      const fallbackSession = this.fallbackSessions.get(sessionId);
      if (fallbackSession) {
        const updatedFallback = {
          ...fallbackSession,
          status,
          updated_at: new Date().toISOString(),
          end_time: status === 'completed' ? new Date().toISOString() : fallbackSession?.end_time
        };
        this.fallbackSessions.set(sessionId, updatedFallback);
        console.warn(`⚠️ Updated session ${sessionId} status in fallback memory store`);
      }
      throw error;
    }
  }

  /**
   * Create ECOS evaluation
   */
  async createEvaluation(evalData: {
    sessionId: string;
    scenarioId: number;
    studentEmail: string;
    scores: any;
    globalScore: number;
    strengths: string[];
    weaknesses: string[];
    recommendations: string[];
    feedback?: string;
    heuristic?: any;
    llmScorePercent?: number | null;
    criteriaDetails?: any;
  }): Promise<any> {
    try {
      const client = await this.getClient();

      // Ensure student exists to satisfy evaluations.student_email foreign key
      await this.ensureUserExists(evalData.studentEmail);

      // Get session database ID
      const session = await this.getSessionByStringId(evalData.sessionId);
      if (!session || session.isFallback) {
        throw new Error(`Session ${evalData.sessionId} not available in primary database`);
      }

      console.log(`📤 Attempting to store evaluation for session ${evalData.sessionId}`);

      const insertPayload = {
        session_id: session.id,
        scenario_id: evalData.scenarioId,
        student_email: evalData.studentEmail,
        scores: evalData.scores,
        global_score: evalData.globalScore,
        strengths: evalData.strengths,
        weaknesses: evalData.weaknesses,
        recommendations: evalData.recommendations,
        feedback: evalData.feedback,
        heuristic: evalData.heuristic,
        llm_score_percent: typeof evalData.llmScorePercent === 'number' ? evalData.llmScorePercent : null,
        criteria_details: evalData.criteriaDetails,
        evaluated_at: new Date().toISOString(),
        created_at: new Date().toISOString()
      };

      console.log(`🔍 [DEBUG] Insert payload columns:`, Object.keys(insertPayload));
      console.log(`🔍 [DEBUG] Session DB ID:`, session.id, `String ID:`, evalData.sessionId);

      const { data, error } = (await withRetry(
        () => client
          .from('evaluations')
          .insert(insertPayload)
          .select()
          .single(),
        {
          ...RetryPresets.database,
          operationName: 'Supabase createEvaluation'
        }
      )) as any;

      console.log(`🔍 [DEBUG] Supabase response - data:`, data ? 'EXISTS' : 'NULL', `error:`, error ? error.code : 'NONE');

      if (error) {
        console.error('❌ Error creating evaluation:', {
          message: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint
        });
        throw error;
      }

      if (!data) {
        const errorMsg = 'Supabase returned null data despite no error - possible schema mismatch';
        console.error(`❌ ${errorMsg}`);
        throw new Error(errorMsg);
      }

      console.log(`✅ Created evaluation for session ${evalData.sessionId} - DB record ID:`, data.id);
      const record = {
        ...data,
        isFallback: false
      };
      this.fallbackEvaluations.set(evalData.sessionId, record);
      return record;
    } catch (error: any) {
      console.error('❌ Failed to create evaluation:', {
        message: error?.message,
        code: error?.code,
        details: error?.details,
        hint: error?.hint
      });
      const fallbackSession = this.fallbackSessions.get(evalData.sessionId);
      const fallbackRecord = {
        session_id: fallbackSession?.id ?? null,
        scenario_id: evalData.scenarioId,
        student_email: evalData.studentEmail,
        scores: evalData.scores,
        global_score: evalData.globalScore,
        strengths: evalData.strengths,
        weaknesses: evalData.weaknesses,
        recommendations: evalData.recommendations,
        feedback: evalData.feedback,
        heuristic: evalData.heuristic,
        llm_score_percent: typeof evalData.llmScorePercent === 'number' ? evalData.llmScorePercent : null,
        criteria_details: evalData.criteriaDetails,
        evaluated_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        summary: Array.isArray(evalData.feedback)
          ? evalData.feedback.join(' ')
          : (evalData.feedback || ''),
        isFallback: true
      };
      this.fallbackEvaluations.set(evalData.sessionId, fallbackRecord);
      console.warn(`⚠️ Stored evaluation for session ${evalData.sessionId} in fallback memory store`);
      throw error;
    }
  }

  /**
   * Get evaluation for a session
   */
  async getEvaluation(sessionId: string): Promise<any> {
    const fallbackEvaluation = this.fallbackEvaluations.get(sessionId) || null;
    try {
      const client = await this.getClient();

      // Get session database ID
      const session = await this.getSessionByStringId(sessionId);
      if (!session || session.isFallback) {
        return fallbackEvaluation;
      }

      const { data, error } = await client
        .from('evaluations')
        .select('*')
        .eq('session_id', session.id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          // No evaluation found
          return fallbackEvaluation;
        }
        throw error;
      }

      const record = {
        ...data,
        isFallback: false
      };
      this.fallbackEvaluations.set(sessionId, record);
      return record;
    } catch (error: any) {
      console.error('❌ Error getting evaluation:', error.message);
      if (fallbackEvaluation) {
        console.warn(`⚠️ Using fallback evaluation for session ${sessionId}`);
      }
      return fallbackEvaluation;
    }
  }

  /**
   * Firebase Authentication Methods
   */

  /**
   * Get user by Firebase UID
   */
  async getUserByFirebaseUid(firebaseUid: string): Promise<any | null> {
    try {
      if (!this.supabase) await this.initialize();

      const { data, error } = await this.supabase
        .from('users')
        .select('*')
        .eq('firebase_uid', firebaseUid)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          // No user found
          return null;
        }
        throw error;
      }

      return data;
    } catch (error: any) {
      console.error('❌ Error getting user by Firebase UID:', error.message);
      return null;
    }
  }

  /**
   * Get user by email
   */
  async getUserByEmail(email: string): Promise<any | null> {
    try {
      if (!this.supabase) await this.initialize();

      const { data, error } = await this.supabase
        .from('users')
        .select('*')
        .eq('email', email.toLowerCase().trim())
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          // No user found
          return null;
        }
        throw error;
      }

      return data;
    } catch (error: any) {
      console.error('❌ Error getting user by email:', error.message);
      return null;
    }
  }

  /**
   * Create new user
   */
  async createUser(userData: {
    email: string;
    firebaseUid: string;
    firstName?: string | null;
    lastName?: string | null;
    profileImageUrl?: string | null;
  }): Promise<any> {
    try {
      if (!this.supabase) await this.initialize();

      // Use UPSERT to handle existing users gracefully
      // This prevents duplicate key errors when user already exists
      const { data, error } = await this.supabase
        .from('users')
        .upsert(
          {
            email: userData.email.toLowerCase().trim(),
            firebase_uid: userData.firebaseUid
          },
          {
            onConflict: 'email',
            ignoreDuplicates: false // Update firebase_uid if user exists
          }
        )
        .select()
        .single();

      if (error) throw error;

      console.log('✅ User created/updated in Supabase:', { id: data.id, email: data.email });
      return data;
    } catch (error: any) {
      console.error('❌ Error creating user:', error.message);
      throw new Error('Failed to create user in database');
    }
  }

  /**
   * Update user's Firebase UID
   */
  async updateUserFirebaseUid(userId: string, firebaseUid: string): Promise<void> {
    try {
      if (!this.supabase) await this.initialize();

      const { error } = await this.supabase
        .from('users')
        .update({
          firebase_uid: firebaseUid,
          updated_at: new Date().toISOString()
        })
        .eq('id', userId);

      if (error) throw error;

      console.log('✅ User Firebase UID updated:', { userId, firebaseUid });
    } catch (error: any) {
      console.error('❌ Error updating user Firebase UID:', error.message);
      throw new Error('Failed to update user Firebase UID');
    }
  }

  /**
   * Get user role
   */
  async getUserRole(userId: string): Promise<string> {
    try {
      if (!this.supabase) await this.initialize();

      const { data, error } = await this.supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          // No role found, default to student
          return 'student';
        }
        throw error;
      }

      return data.role;
    } catch (error: any) {
      console.error('❌ Error getting user role:', error.message);
      // Default to student on error
      return 'student';
    }
  }

  /**
   * Set user role
   */
  async setUserRole(userId: string, role: 'admin' | 'student'): Promise<void> {
    try {
      if (!this.supabase) await this.initialize();

      // First, try to update existing role
      const { error: updateError } = await this.supabase
        .from('user_roles')
        .update({
          role,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', userId);

      // If no rows were updated, insert new role
      if (updateError || updateError?.code === 'PGRST116') {
        const { error: insertError } = await this.supabase
          .from('user_roles')
          .insert([{
            user_id: userId,
            role,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }]);

        if (insertError) {
          // Check if it's a duplicate key error (role already exists)
          if (!insertError.message.includes('duplicate')) {
            throw insertError;
          }
        }
      }

      console.log('✅ User role set:', { userId, role });
    } catch (error: any) {
      console.error('❌ Error setting user role:', error.message);
      throw new Error('Failed to set user role');
    }
  }

  /**
   * Record an LTI launch nonce. Returns false if it was already used (replay).
   * Throws on database errors: a launch must not be accepted without this check.
   */
  async consumeLtiNonce(nonce: string): Promise<boolean> {
    if (!this.supabase) await this.initialize();

    const { error } = await this.supabase.from('lti_nonces').insert({ nonce });
    if (!error) return true;
    if (error.code === '23505') return false;
    throw new Error(`LTI nonce storage failed: ${error.message}`);
  }

  /**
   * Get metrics for monitoring
   */
  getMetrics(): DatabaseMetrics {
    return { ...this.metrics };
  }

  /**
   * Check if service is ready
   */
  isReady(): boolean {
    return this.isInitialized && this.metrics.isHealthy;
  }

  private addFallbackSessionMessage(sessionId: string, message: any) {
    if (!sessionId) return;
    const existing = this.fallbackSessionMessages.get(sessionId) || [];
    existing.push({ ...message, sessionId });
    this.fallbackSessionMessages.set(sessionId, existing);
  }
}

// Export singleton instance
export const unifiedDb = new UnifiedDatabaseService();
