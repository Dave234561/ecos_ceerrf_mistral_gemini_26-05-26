import { geminiService } from './gemini.service.js';
/**
 * RealtimeAnalysisService
 *
 * Service for analyzing student progress in real-time during ECOS sessions
 * Creates periodic snapshots for teacher monitoring dashboard
 */

import { openaiService } from './openai.service.js';
import { unifiedDb } from './unified-database.service.js';
import { logger } from './logger.service.js';
import { trainingSessionService } from './training-session.service.js';

interface ProgressAnalysis {
  strengths: string[];
  weaknesses: string[];
  progressIndicators: {
    engagement_score?: number;
    question_quality?: number;
    empathy_level?: number;
    clinical_reasoning?: number;
  };
}

interface SnapshotOptions {
  forceSnapshot?: boolean;
  sessionStatus?: 'in_progress' | 'completed';
}

class RealtimeAnalysisService {
  // Cache pour éviter re-analyse des mêmes messages
  private analysisCache = new Map<string, { exchangeCount: number; lastAnalysis: Date }>();

  // Configuration
  private readonly SNAPSHOT_INTERVAL = 3; // Créer un snapshot tous les 3 échanges
  private readonly MIN_EXCHANGES_FOR_ANALYSIS = 2; // Minimum d'échanges avant première analyse
  private readonly CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes

  /**
   * Analyze a session and create a snapshot if needed
   * Called when new messages are added to a session
   */
  async analyzeSessionProgress(
    sessionId: string,
    options: SnapshotOptions = {}
  ): Promise<void> {
    try {
      console.log('🔍 [RealtimeAnalysis] CALLED with sessionId:', sessionId, 'options:', options);

      // Get session information
      const session = await unifiedDb.getSessionByStringId(sessionId);
      if (!session) {
        logger.warn('RealtimeAnalysis: Session not found in DB', { sessionId });
        console.log('❌ [RealtimeAnalysis] Session not found:', sessionId);
        return;
      }

      console.log('✅ [RealtimeAnalysis] Session found:', {
        dbId: session.id,
        student: session.student_email,
        scenarioId: session.scenario_id,
        status: session.status
      });

      // Get all messages for this session
      const messages = await unifiedDb.getSessionMessages(sessionId, 100);
      if (!messages || messages.length === 0) {
        logger.debug('RealtimeAnalysis: No messages yet', { sessionId });
        console.log('⚠️ [RealtimeAnalysis] No messages found for session:', sessionId);
        return;
      }

      console.log(`📝 [RealtimeAnalysis] Found ${messages.length} messages for session ${sessionId}`);

      // Calculate exchange count (pair of user + assistant messages)
      const exchangeCount = this.calculateExchangeCount(messages);
      console.log(`🔢 [RealtimeAnalysis] Exchange count: ${exchangeCount} (need minimum ${this.MIN_EXCHANGES_FOR_ANALYSIS})`);

      // Check if we should create a snapshot (now async - checks DB)
      const shouldCreate = await this.shouldCreateSnapshot(sessionId, exchangeCount, options);
      if (!shouldCreate) {
        logger.debug('RealtimeAnalysis: Skipping snapshot creation', {
          sessionId,
          exchangeCount,
          cached: this.analysisCache.has(sessionId)
        });
        console.log('⏭️ [RealtimeAnalysis] Skipping snapshot - cached or not enough exchanges');
        return;
      }

      console.log('🚀 [RealtimeAnalysis] Creating snapshot for session:', sessionId);

      // Perform analysis
      logger.info('RealtimeAnalysis: Analyzing session', { sessionId, exchangeCount });
      //  OPTIMIZATION: Skip expensive OpenAI analysis for intermediate snapshots
      // Only do full AI analysis on final evaluation (completed) or forced snapshots
      const useAIAnalysis = options.forceSnapshot || options.sessionStatus === 'completed';
      const analysis = await this.analyzeMessages(messages, session.scenario_id, useAIAnalysis);

      console.log('🤖 [RealtimeAnalysis] Analysis complete:', {
        strengths: analysis.strengths.length,
        weaknesses: analysis.weaknesses.length,
        indicators: Object.keys(analysis.progressIndicators)
      });

      // Create snapshot
      console.log('💾 [RealtimeAnalysis] Inserting snapshot into DB...', {
        sessionDbId: session.id,
        sessionStringId: sessionId,
        student: session.student_email,
        scenarioId: session.scenario_id,
        exchangeCount,
        status: options.sessionStatus || 'in_progress'
      });

      await this.createSnapshot({
        sessionId: session.id, // Use DB integer ID
        studentEmail: session.student_email,
        scenarioId: session.scenario_id,
        exchangeCount,
        analysis,
        status: options.sessionStatus || 'in_progress'
      });

      console.log('✅ [RealtimeAnalysis] Snapshot inserted successfully');

      // Update cache
      this.analysisCache.set(sessionId, {
        exchangeCount,
        lastAnalysis: new Date()
      });

      logger.info('RealtimeAnalysis: Snapshot created successfully', {
        sessionId,
        exchangeCount,
        strengthsCount: analysis.strengths.length,
        weaknessesCount: analysis.weaknesses.length
      });

    } catch (error: any) {
      logger.error('RealtimeAnalysis: Error analyzing session', {
        sessionId,
        error: error.message,
        stack: error.stack
      });
      // Don't throw - analysis failure shouldn't break the flow
    }
  }

  /**
   * Calculate number of complete exchanges (user + assistant pairs)
   */
  private calculateExchangeCount(messages: any[]): number {
    const userMessages = messages.filter(m => m.role === 'user').length;
    const assistantMessages = messages.filter(m => m.role === 'assistant').length;
    return Math.min(userMessages, assistantMessages);
  }

  /**
   * Determine if a snapshot should be created
   * CRITICAL FIX: Verifies snapshot exists in DB before trusting cache
   * This prevents cache/DB desync from timeouts causing invisible students
   */
  private async shouldCreateSnapshot(
    sessionId: string,
    currentExchangeCount: number,
    options: SnapshotOptions
  ): Promise<boolean> {
    // Always create snapshot if forced or session is completed
    if (options.forceSnapshot || options.sessionStatus === 'completed') {
      return true;
    }

    // Need minimum exchanges before first analysis
    if (currentExchangeCount < this.MIN_EXCHANGES_FOR_ANALYSIS) {
      return false;
    }

    // Check cache
    const cached = this.analysisCache.get(sessionId);
    if (!cached) {
      // First analysis
      return true;
    }

    // Check if enough new exchanges since last snapshot
    const newExchanges = currentExchangeCount - cached.exchangeCount;
    if (newExchanges >= this.SNAPSHOT_INTERVAL) {
      return true;
    }

    // Check if cache is too old (force refresh)
    const cacheAge = Date.now() - cached.lastAnalysis.getTime();
    if (cacheAge > this.CACHE_DURATION_MS) {
      return true;
    }

    // CRITICAL: Verify snapshot actually exists in DB before trusting cache
    // Cache can be out of sync if previous write failed due to timeout
    const snapshotExists = await this.verifySnapshotExistsInDB(sessionId);
    if (!snapshotExists) {
      logger.warn('RealtimeAnalysis: Cache says skip but no snapshot in DB - forcing creation', {
        sessionId,
        cachedExchangeCount: cached.exchangeCount,
        currentExchangeCount,
        cacheAge
      });
      console.log('⚠️ [shouldCreateSnapshot] Cache/DB desync detected - clearing cache and forcing snapshot');
      // Clear invalid cache entry
      this.analysisCache.delete(sessionId);
      return true;
    }

    return false;
  }

  /**
   * Verify that at least one snapshot exists in DB for this session
   * Returns true if snapshot exists, false otherwise
   */
  private async verifySnapshotExistsInDB(sessionId: string): Promise<boolean> {
    try {
      // Get session DB ID
      const session = await unifiedDb.getSessionByStringId(sessionId);
      if (!session) {
        return false;
      }

      // Check if any snapshot exists for this session
      const client = await unifiedDb.getClient();
      const { data, error } = await client
        .from('student_progress_snapshots')
        .select('id')
        .eq('session_id', session.id)
        .limit(1)
        .maybeSingle();

      if (error) {
        logger.warn('RealtimeAnalysis: Error checking snapshot existence', {
          sessionId,
          error: error.message
        });
        // On error, assume doesn't exist to be safe
        return false;
      }

      const exists = !!data;
      console.log(`🔍 [verifySnapshotExistsInDB] Session ${sessionId} (DB ID: ${session.id}) has snapshot: ${exists}`);
      return exists;

    } catch (error: any) {
      logger.warn('RealtimeAnalysis: Failed to verify snapshot existence', {
        sessionId,
        error: error.message
      });
      // On error, assume doesn't exist to be safe
      return false;
    }
  }

  /**
   * Analyze messages to extract strengths, weaknesses, and progress indicators
   * OPTIMIZATION: Can skip AI analysis for intermediate snapshots to avoid timeouts
   */
  private async analyzeMessages(
    messages: any[],
    scenarioId?: number,
    useAIAnalysis: boolean = true
  ): Promise<ProgressAnalysis> {
    try {
      // OPTIMIZATION: If AI analysis is disabled (intermediate snapshot), return basic analysis
      // This avoids 2-5 second OpenAI calls that cause Vercel timeouts
      if (!useAIAnalysis) {
        logger.debug('Skipping AI analysis for intermediate snapshot (performance optimization)');
        const exchangeCount = Math.min(
          messages.filter(m => m.role === 'user').length,
          messages.filter(m => m.role === 'assistant').length
        );

        return {
          strengths: [`En cours de discussion (${exchangeCount} échanges)`],
          weaknesses: ['Analyse détaillée disponible à la fin'],
          progressIndicators: {
            engagement_score: 0.5,
            question_quality: 0.5,
            empathy_level: 0.5,
            clinical_reasoning: 0.5
          }
        };
      }

      // Build transcript for analysis
      const transcript = messages
        .map(msg => {
          const role = msg.role === 'user' ? 'Étudiant' : 'Patient';
          const content = msg.role === 'user'
            ? (msg.question || msg.content || '')
            : (msg.response || msg.content || '');
          return `${role}: ${content}`;
        })
        .join('\n');

      // Prompt for quick real-time analysis
      const systemPrompt = `Tu es un assistant d'évaluation ECOS. Analyse rapidement cette conversation en cours entre un étudiant et un patient virtuel.

Identifie en temps réel :
1. Points forts (2-3 maximum) : ce que l'étudiant fait bien
2. Points faibles (2-3 maximum) : ce qui doit être amélioré
3. Indicateurs de progression (scores 0-1) :
   - engagement_score : niveau d'engagement de l'étudiant
   - question_quality : qualité des questions posées
   - empathy_level : niveau d'empathie démontré
   - clinical_reasoning : qualité du raisonnement clinique

Réponds UNIQUEMENT en JSON valide :
{
  "strengths": ["point fort 1", "point fort 2"],
  "weaknesses": ["point faible 1", "point faible 2"],
  "indicators": {
    "engagement_score": 0.8,
    "question_quality": 0.7,
    "empathy_level": 0.9,
    "clinical_reasoning": 0.6
  }
}`;

      const userPrompt = `Conversation en cours :\n${transcript}`;

      // Call Gemini for quick analysis (realtime)
      if (!geminiService) throw new Error('Gemini service not initialized');
      const geminiResponse = await geminiService.generateText([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]);
      const parsed = JSON.parse(geminiResponse);

      return {
        strengths: Array.isArray(parsed.strengths) ? parsed.strengths : [],
        weaknesses: Array.isArray(parsed.weaknesses) ? parsed.weaknesses : [],
        progressIndicators: parsed.indicators || {}
      };

    } catch (error: any) {
      logger.warn('RealtimeAnalysis: AI analysis failed, using fallback', {
        error: error.message
      });

      // Fallback analysis (heuristic-based)
      return this.createFallbackAnalysis(messages);
    }
  }

  /**
   * Fallback analysis when AI is unavailable
   */
  private createFallbackAnalysis(messages: any[]): ProgressAnalysis {
    const userMessages = messages.filter(m => m.role === 'user');
    const exchangeCount = this.calculateExchangeCount(messages);

    // Simple heuristics
    const avgMessageLength = userMessages.reduce((sum, m) =>
      sum + (m.question || m.content || '').length, 0
    ) / Math.max(userMessages.length, 1);

    const engagement = Math.min(1, exchangeCount / 10);
    const questionQuality = Math.min(1, avgMessageLength / 100);

    return {
      strengths: exchangeCount > 5
        ? ['Participation active', 'Bonne progression']
        : ['Début de session'],
      weaknesses: exchangeCount < 3
        ? ['Session en cours, analyse préliminaire']
        : [],
      progressIndicators: {
        engagement_score: engagement,
        question_quality: questionQuality,
        empathy_level: 0.5, // Neutral
        clinical_reasoning: 0.5 // Neutral
      }
    };
  }

  /**
   * Create a progress snapshot in the database
   */
  private async createSnapshot(data: {
    sessionId: number;
    studentEmail: string;
    scenarioId?: number;
    exchangeCount: number;
    analysis: ProgressAnalysis;
    status: 'in_progress' | 'completed';
  }): Promise<void> {
    try {
      console.log('📊 [createSnapshot] Preparing snapshot insert:', {
        sessionId: data.sessionId,
        studentEmail: data.studentEmail,
        scenarioId: data.scenarioId,
        exchangeCount: data.exchangeCount,
        status: data.status,
        strengthsCount: data.analysis.strengths.length,
        weaknessesCount: data.analysis.weaknesses.length
      });

      const client = await unifiedDb.getClient();

      const insertData = {
        session_id: data.sessionId,
        student_email: data.studentEmail,
        scenario_id: data.scenarioId,
        exchange_count: data.exchangeCount,
        strengths: data.analysis.strengths,
        weaknesses: data.analysis.weaknesses,
        progress_indicators: data.analysis.progressIndicators,
        status: data.status,
        timestamp: new Date().toISOString()
      };

      console.log('💾 [createSnapshot] INSERT data:', JSON.stringify(insertData, null, 2));

      const { data: insertedData, error } = await client
        .from('student_progress_snapshots')
        .insert(insertData)
        .select();

      if (error) {
        console.error('❌ [createSnapshot] Insert FAILED:', {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint
        });
        throw error;
      }

      console.log('✅ [createSnapshot] Insert SUCCESS:', insertedData);

      logger.debug('RealtimeAnalysis: Snapshot inserted', {
        sessionId: data.sessionId,
        exchangeCount: data.exchangeCount
      });

    } catch (error: any) {
      console.error('❌ [createSnapshot] EXCEPTION:', {
        sessionId: data.sessionId,
        error: error.message,
        stack: error.stack
      });

      logger.error('RealtimeAnalysis: Failed to create snapshot', {
        sessionId: data.sessionId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Mark session as completed and create final snapshot
   */
  async finalizeSession(sessionId: string): Promise<void> {
    logger.info('RealtimeAnalysis: Finalizing session', { sessionId });

    await this.analyzeSessionProgress(sessionId, {
      forceSnapshot: true,
      sessionStatus: 'completed'
    });

    // Clear cache for this session
    this.analysisCache.delete(sessionId);
  }

  /**
   * Get active sessions with recent snapshots
   * SECURITY: Filters by teacher email to show students from:
   * 1. Scenarios created by this teacher (scenarios.created_by)
   * 2. Training sessions where this teacher is assigned (training_session_teachers)
   * 3. For admins: shows ALL sessions (no filtering)
   *
   * @param teacherEmail - Teacher's email for security filtering
   * @param options - Optional filters (scenarioId, trainingSessionId, role)
   */
  async getActiveStudents(
    teacherEmail?: string,
    options?: { scenarioId?: number; trainingSessionId?: number; role?: string }
  ): Promise<any[]> {
    try {
      const client = await unifiedDb.getClient();

      // Get snapshots from the last 30 days (including completed sessions)
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      
      let query = client
        .from('student_progress_snapshots')
        .select(`
          id,
          session_id,
          student_email,
          scenario_id,
          timestamp,
          status,
          exchange_count,
          progress_indicators,
          strengths,
          weaknesses,
          sessions!inner(session_id, student_email, scenario_id, status, start_time, end_time),
          scenarios!inner(id, title, created_by)
        `)
        // Filter by date instead of status to show recent sessions (active or completed)
        .gte('timestamp', thirtyDaysAgo)
        .order('timestamp', { ascending: false})
        .limit(500); // Limit to 500 most recent snapshots to avoid timeout

      const { data: allSnapshots, error: snapshotsError } = await query;

      if (snapshotsError) {
        throw snapshotsError;
      }

      if (!allSnapshots || allSnapshots.length === 0) {
        logger.debug('RealtimeAnalysis: No active students found');
        return [];
      }

      // SECURITY: Filter by teacher email using multi-source approach
      let filteredSnapshots = allSnapshots;

      // Admins see ALL sessions without filtering
      if (options?.role === 'admin') {
        logger.info('RealtimeAnalysis: Admin access - showing all sessions', {
          teacherEmail,
          totalActive: allSnapshots.length
        });
      } else if (teacherEmail) {
        // 1. Get training sessions where teacher is assigned
        const assignedSessionIds = await trainingSessionService.getTeacherSessions(teacherEmail);

        // 2. Get student emails from assigned training sessions (optionally filtered by trainingSessionId)
        let assignedStudentEmails: string[] = [];
        if (assignedSessionIds.length > 0) {
          // Apply training session filter if provided
          const sessionIdsToQuery = options?.trainingSessionId
            ? assignedSessionIds.filter(id => id === options.trainingSessionId)
            : assignedSessionIds;

          if (sessionIdsToQuery.length > 0) {
            const { data: sessionStudents, error: studentsError } = await client
              .from('training_session_students')
              .select('student_email')
              .in('training_session_id', sessionIdsToQuery)
              .eq('status', 'assigned');

            if (!studentsError && sessionStudents) {
              assignedStudentEmails = sessionStudents.map(s => s.student_email);
            }
          }
        }

        // 3. Filter snapshots: show if scenario created by teacher OR student in training session
        filteredSnapshots = allSnapshots.filter(snapshot => {
          const isScenarioOwner = snapshot.scenarios?.created_by === teacherEmail;
          const isTrainingSessionStudent = assignedStudentEmails.includes(snapshot.sessions?.student_email);
          return isScenarioOwner || isTrainingSessionStudent;
        });

        logger.info('RealtimeAnalysis: Filtering active students by teacher (multi-source)', {
          teacherEmail,
          assignedTrainingSessions: assignedSessionIds.length,
          assignedStudents: assignedStudentEmails.length,
          totalActive: allSnapshots.length,
          filteredActive: filteredSnapshots.length,
          filters: options
        });
      } else {
        logger.warn('RealtimeAnalysis: No teacher filter applied - returning all active students');
      }

      // Apply scenario filter if provided
      if (options?.scenarioId) {
        filteredSnapshots = filteredSnapshots.filter(snapshot =>
          snapshot.scenario_id === options.scenarioId
        );
        logger.info('RealtimeAnalysis: Applied scenario filter', {
          scenarioId: options.scenarioId,
          resultCount: filteredSnapshots.length
        });
      }

      // Group by session, keep only latest snapshot per session
      const latestSnapshots = new Map();
      filteredSnapshots.forEach(snapshot => {
        const sessionId = snapshot.session_id;
        if (!latestSnapshots.has(sessionId) ||
            new Date(snapshot.timestamp) > new Date(latestSnapshots.get(sessionId).timestamp)) {
          latestSnapshots.set(sessionId, snapshot);
        }
      });

      const results = Array.from(latestSnapshots.values());
      logger.info('RealtimeAnalysis: Retrieved active students', {
        teacherEmail,
        count: results.length
      });

      return results;

    } catch (error: any) {
      logger.error('RealtimeAnalysis: Failed to get active students', {
        teacherEmail,
        error: error.message
      });
      return [];
    }
  }

  /**
   * Generate session summary for a specific date
   * SECURITY: Filters by teacher email to show students from:
   * 1. Scenarios created by this teacher (scenarios.created_by)
   * 2. Training sessions where this teacher is assigned (training_session_teachers)
   */
  async generateSessionSummary(
    sessionDate: string,
    teacherEmail: string,
    scenarioId?: number
  ): Promise<any> {
    try {
      logger.info('RealtimeAnalysis: Generating session summary', {
        sessionDate,
        teacherEmail,
        scenarioId
      });

      const client = await unifiedDb.getClient();

      // Fetch all snapshots for the date first
      let query = client
        .from('student_progress_snapshots')
        .select(`
          *,
          sessions!inner(scenario_id, student_email),
          scenarios!inner(id, created_by)
        `)
        .gte('timestamp', `${sessionDate}T00:00:00Z`)
        .lte('timestamp', `${sessionDate}T23:59:59.999Z`);

      // Optional scenario filter
      if (scenarioId) {
        query = query.eq('scenario_id', scenarioId);
      }

      const { data: allSnapshotsRaw, error } = await query;

      if (error) {
        throw error;
      }

      if (!allSnapshotsRaw || allSnapshotsRaw.length === 0) {
        logger.warn('RealtimeAnalysis: No snapshots found for date range', {
          sessionDate,
          teacherEmail,
          scenarioId,
          dateRangeStart: `${sessionDate}T00:00:00Z`,
          dateRangeEnd: `${sessionDate}T23:59:59.999Z`
        });
        throw new Error(`No activity found for this date`);
      }

      // SECURITY: Apply multi-source filtering
      // 1. Get training sessions where teacher is assigned
      const assignedSessionIds = await trainingSessionService.getTeacherSessions(teacherEmail);

      // 2. Get student emails from assigned training sessions
      let assignedStudentEmails: string[] = [];
      if (assignedSessionIds.length > 0) {
        const { data: sessionStudents, error: studentsError } = await client
          .from('training_session_students')
          .select('student_email')
          .in('training_session_id', assignedSessionIds)
          .eq('status', 'assigned');

        if (!studentsError && sessionStudents) {
          assignedStudentEmails = sessionStudents.map(s => s.student_email);
        }
      }

      // 3. Filter snapshots by teacher access
      const filteredSnapshotsRaw = allSnapshotsRaw.filter((item: any) => {
        const isScenarioOwner = item.scenarios?.created_by === teacherEmail;
        const isTrainingSessionStudent = assignedStudentEmails.includes(item.sessions?.student_email);
        return isScenarioOwner || isTrainingSessionStudent;
      });

      if (filteredSnapshotsRaw.length === 0) {
        logger.warn('RealtimeAnalysis: No accessible snapshots after teacher filtering', {
          sessionDate,
          teacherEmail,
          totalSnapshotsFound: allSnapshotsRaw.length,
          assignedTrainingSessions: assignedSessionIds.length,
          assignedStudents: assignedStudentEmails.length
        });
        throw new Error(`No activity found for this date`);
      }

      logger.info('RealtimeAnalysis: Filtered session summary snapshots (multi-source)', {
        teacherEmail,
        assignedTrainingSessions: assignedSessionIds.length,
        assignedStudents: assignedStudentEmails.length,
        totalSnapshots: allSnapshotsRaw.length,
        filteredSnapshots: filteredSnapshotsRaw.length
      });

      // Extract snapshots (remove joined data for processing)
      const snapshots = filteredSnapshotsRaw.map(item => {
        const { sessions, scenarios, ...snapshot } = item as any;
        return snapshot;
      });

      // Group by student to get latest snapshot per student
      const studentMap = new Map();
      snapshots.forEach(snapshot => {
        const key = snapshot.student_email;
        const existing = studentMap.get(key);
        if (!existing || new Date(snapshot.timestamp) > new Date(existing.timestamp)) {
          studentMap.set(key, snapshot);
        }
      });

      const latestSnapshots = Array.from(studentMap.values());
      const totalStudents = latestSnapshots.length;

      // Aggregate data
      const allStrengths: string[] = [];
      const allWeaknesses: string[] = [];
      const indicators = {
        engagement: [] as number[],
        questionQuality: [] as number[],
        empathy: [] as number[],
        clinicalReasoning: [] as number[]
      };

      latestSnapshots.forEach(snapshot => {
        // Collect strengths and weaknesses
        if (Array.isArray(snapshot.strengths)) {
          allStrengths.push(...snapshot.strengths);
        }
        if (Array.isArray(snapshot.weaknesses)) {
          allWeaknesses.push(...snapshot.weaknesses);
        }

        // Collect indicators
        const progress = snapshot.progress_indicators || {};
        if (progress.engagement_score !== undefined) {
          indicators.engagement.push(progress.engagement_score);
        }
        if (progress.question_quality !== undefined) {
          indicators.questionQuality.push(progress.question_quality);
        }
        if (progress.empathy_level !== undefined) {
          indicators.empathy.push(progress.empathy_level);
        }
        if (progress.clinical_reasoning !== undefined) {
          indicators.clinicalReasoning.push(progress.clinical_reasoning);
        }
      });

      // Calculate trends (averages)
      const trends = {
        engagement_score: this.average(indicators.engagement),
        question_quality: this.average(indicators.questionQuality),
        empathy_level: this.average(indicators.empathy),
        clinical_reasoning: this.average(indicators.clinicalReasoning)
      };

      // Use AI to identify common patterns
      const { commonStrengths, commonWeaknesses } = await this.identifyCommonPatterns(
        allStrengths,
        allWeaknesses
      );

      // Prepare summary data
      const summaryData = {
        totalSnapshots: snapshots.length,
        averageExchanges: this.average(latestSnapshots.map(s => s.exchange_count || 0))
      };

      // Store summary
      const { data: summary, error: insertError } = await client
        .from('session_summaries')
        .upsert({
          session_date: sessionDate,
          teacher_email: teacherEmail,
          scenario_id: scenarioId || null,
          total_students: totalStudents,
          summary_data: summaryData,
          common_strengths: commonStrengths,
          common_weaknesses: commonWeaknesses,
          trends: trends,
          updated_at: new Date().toISOString()
        }, {
          // Always use the 3-column constraint (NULL is allowed in UNIQUE constraints)
          onConflict: 'session_date,teacher_email,scenario_id'
        })
        .select()
        .single();

      if (insertError) {
        throw insertError;
      }

      logger.info('RealtimeAnalysis: Summary generated successfully', {
        sessionDate,
        totalStudents,
        commonStrengthsCount: commonStrengths.length,
        commonWeaknessesCount: commonWeaknesses.length
      });

      return summary;

    } catch (error: any) {
      logger.error('RealtimeAnalysis: Failed to generate summary', {
        sessionDate,
        teacherEmail,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Identify common patterns using AI
   */
  private async identifyCommonPatterns(
    strengths: string[],
    weaknesses: string[]
  ): Promise<{ commonStrengths: string[]; commonWeaknesses: string[] }> {
    try {
      if (strengths.length === 0 && weaknesses.length === 0) {
        return { commonStrengths: [], commonWeaknesses: [] };
      }

      const systemPrompt = `Tu es un assistant d'analyse pédagogique. Analyse ces listes de points forts et faibles collectés auprès de plusieurs étudiants.

Identifie les 3-5 points récurrents les plus importants dans chaque catégorie.
Groupe les éléments similaires ensemble (ex: "bonne empathie" et "très empathique" → "Démontre une bonne empathie").

Réponds UNIQUEMENT en JSON valide :
{
  "commonStrengths": ["point fort récurrent 1", "point fort récurrent 2", ...],
  "commonWeaknesses": ["point faible récurrent 1", "point faible récurrent 2", ...]
}`;

      const userPrompt = `Points forts (${strengths.length} entrées) :\n${strengths.slice(0, 100).join('\n')}\n\nPoints faibles (${weaknesses.length} entrées) :\n${weaknesses.slice(0, 100).join('\n')}`;

      const completion = await openaiService.createCompletion({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.3,
        max_completion_tokens: 600,
        response_format: { type: 'json_object' }
      });

      const content = completion.choices?.[0]?.message?.content || '{}';
      const parsed = JSON.parse(content);

      return {
        commonStrengths: Array.isArray(parsed.commonStrengths) ? parsed.commonStrengths : [],
        commonWeaknesses: Array.isArray(parsed.commonWeaknesses) ? parsed.commonWeaknesses : []
      };

    } catch (error: any) {
      logger.warn('RealtimeAnalysis: AI pattern identification failed, using heuristics', {
        error: error.message
      });

      // Fallback: simple frequency analysis
      return {
        commonStrengths: this.getMostFrequent(strengths, 5),
        commonWeaknesses: this.getMostFrequent(weaknesses, 5)
      };
    }
  }

  /**
   * Calculate average of numbers
   */
  private average(numbers: number[]): number {
    if (numbers.length === 0) return 0;
    return numbers.reduce((sum, n) => sum + n, 0) / numbers.length;
  }

  /**
   * Get most frequent items from array
   */
  private getMostFrequent(items: string[], limit: number): string[] {
    const frequency = new Map<string, number>();
    items.forEach(item => {
      const normalized = item.toLowerCase().trim();
      frequency.set(normalized, (frequency.get(normalized) || 0) + 1);
    });

    return Array.from(frequency.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([item]) => item);
  }

  /**
   * Clear old cache entries
   */
  clearOldCache(): void {
    const now = Date.now();
    for (const [sessionId, cached] of this.analysisCache.entries()) {
      if (now - cached.lastAnalysis.getTime() > this.CACHE_DURATION_MS) {
        this.analysisCache.delete(sessionId);
      }
    }
  }
}

// Singleton instance
export const realtimeAnalysisService = new RealtimeAnalysisService();

// Periodic cache cleanup
setInterval(() => {
  realtimeAnalysisService.clearOldCache();
}, 5 * 60 * 1000); // Every 5 minutes
