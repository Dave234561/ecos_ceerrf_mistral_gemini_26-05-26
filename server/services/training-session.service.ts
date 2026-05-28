/**
 * TrainingSessionService
 *
 * Service for managing training sessions with:
 * - Multiple teachers per session
 * - Unique enrollment tokens for automatic student enrollment
 * - Student enrollment via unique URLs
 */

import crypto from 'crypto';
import { unifiedDb } from './unified-database.service.js';
import { logger } from './logger.service.js';

interface CreateTrainingSessionParams {
  title: string;
  description?: string;
  createdBy: string;
  teacherEmails: string[];  // Additional teachers to assign
  scenarioIds: number[];
  tokenExpiresAt?: Date;
  startDate?: Date;
  endDate?: Date;
}

interface EnrollmentResult {
  session: any;
  alreadyEnrolled: boolean;
  enrollmentUrl?: string;
}

class TrainingSessionService {
  /**
   * Generate a unique enrollment token for a training session
   * Format: ts_<32 random hex characters>
   */
  generateEnrollmentToken(): string {
    return `ts_${crypto.randomBytes(16).toString('hex')}`;
  }

  /**
   * Create enrollment URL for students
   *
   * CRITICAL: Always uses production URL to avoid Firebase domain authorization issues
   *
   * Firebase requires pre-authorized domains for authentication.
   * Preview deployment URLs (ecos-ceerrf-b-20-xyz123.vercel.app) are NOT authorized.
   *
   * TRADE-OFF: Preview deployments cannot test enrollment flow with Firebase authentication.
   * All enrollment links point to production domain, even when created in previews.
   *
   * REQUIRED: Configure BASE_URL in Vercel for all environments (Production, Preview, Development)
   */
  createEnrollmentUrl(token: string): string {
    const baseUrl = process.env.BASE_URL ||
                    (process.env.VERCEL_ENV === 'production'
                      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL || 'ecos-ceerrf-b-20.vercel.app'}`
                      : process.env.VERCEL_URL
                        ? `https://${process.env.VERCEL_URL}`
                        : 'http://localhost:5000');

    // Warn if BASE_URL is not configured and we're using a fallback
    if (!process.env.BASE_URL && process.env.VERCEL_ENV) {
      console.warn(`⚠️ BASE_URL not configured. Using fallback: ${baseUrl}`);
      console.warn('⚠️ Enrollment links may fail Firebase authentication if domain is not authorized.');
      console.warn('⚠️ Configure BASE_URL in Vercel: https://vercel.com/docs/projects/environment-variables');
    }

    return `${baseUrl}/enroll/${token}`;
  }

  /**
   * Create a training session with enrollment link and assigned teachers
   */
  async createTrainingSession(params: CreateTrainingSessionParams): Promise<any> {
    const startTime = Date.now();
    try {
      logger.info('Creating training session - START', {
        title: params.title,
        createdBy: params.createdBy,
        teachersCount: params.teacherEmails.length,
        scenariosCount: params.scenarioIds.length
      });

      // 1. Get database client with timeout protection
      let client;
      try {
        client = await Promise.race([
          unifiedDb.getClient(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Database client initialization timeout')), 5000)
          )
        ]);
        logger.info('Database client acquired successfully');
      } catch (clientError: any) {
        logger.error('Failed to acquire database client', {
          error: clientError.message,
          stack: clientError.stack
        });
        throw new Error(`Database connection failed: ${clientError.message}`);
      }

      // 2. Generate enrollment token
      const enrollmentToken = this.generateEnrollmentToken();
      const tokenExpiresAt = params.tokenExpiresAt ||
        new Date(Date.now() + 365 * 24 * 60 * 60 * 1000); // 1 year default

      const startDate = params.startDate || new Date();
      const endDate = params.endDate || tokenExpiresAt;

      logger.info('Token generated, proceeding with session creation', {
        enrollmentToken,
        tokenExpiresAt: tokenExpiresAt.toISOString()
      });

      // 3. Create training session in database
      logger.info('Inserting training session into database');
      const { data: session, error: sessionError } = await client
        .from('training_sessions')
        .insert({
          title: params.title,
          description: params.description || '',
          created_by: params.createdBy,
          status: 'active',
          enrollment_token: enrollmentToken,
          token_expires_at: tokenExpiresAt.toISOString(),
          start_date: startDate.toISOString(),
          end_date: endDate.toISOString(),
          created_at: new Date().toISOString()
        })
        .select()
        .single();

      if (sessionError) {
        logger.error('Failed to create training session in database', {
          error: sessionError,
          code: sessionError.code,
          details: sessionError.details,
          hint: sessionError.hint,
          message: sessionError.message
        });
        throw new Error(`Database insert failed: ${sessionError.message || 'Unknown error'}`);
      }

      if (!session) {
        logger.error('Session created but no data returned');
        throw new Error('Session created but no data returned from database');
      }

      logger.info('Training session created successfully', {
        sessionId: session.id,
        enrollmentToken,
        duration: Date.now() - startTime
      });

      // 4. Assign teachers (creator as owner + additional teachers)
      logger.info('Assigning teachers to session', { sessionId: session.id });
      const teacherAssignments = [
        {
          training_session_id: session.id,
          teacher_email: params.createdBy,
          role: 'owner',
          assigned_by: params.createdBy,
          assigned_at: new Date().toISOString()
        },
        ...params.teacherEmails.map(email => ({
          training_session_id: session.id,
          teacher_email: email.trim().toLowerCase(),
          role: 'teacher',
          assigned_by: params.createdBy,
          assigned_at: new Date().toISOString()
        }))
      ];

      const { error: teachersError } = await client
        .from('training_session_teachers')
        .insert(teacherAssignments);

      if (teachersError) {
        logger.error('Failed to assign teachers', {
          error: teachersError,
          sessionId: session.id,
          teachersCount: teacherAssignments.length
        });
        // Don't throw - session is already created, teachers can be added later
        logger.warn('Continuing despite teacher assignment failure');
      } else {
        logger.info('Teachers assigned successfully', {
          sessionId: session.id,
          teachersCount: teacherAssignments.length
        });
      }

      // 5. Assign scenarios
      logger.info('Assigning scenarios to session', { sessionId: session.id });
      const scenarioAssignments = params.scenarioIds.map(scenarioId => ({
        training_session_id: session.id,
        scenario_id: scenarioId
      }));

      const { error: scenariosError } = await client
        .from('training_session_scenarios')
        .insert(scenarioAssignments);

      if (scenariosError) {
        logger.error('Failed to assign scenarios', {
          error: scenariosError,
          sessionId: session.id,
          scenariosCount: scenarioAssignments.length
        });
        // Don't throw - session is already created, scenarios can be added later
        logger.warn('Continuing despite scenario assignment failure');
      } else {
        logger.info('Scenarios assigned successfully', {
          sessionId: session.id,
          scenariosCount: scenarioAssignments.length
        });
      }

      // 6. Return session with enrollment URL
      const enrollmentUrl = this.createEnrollmentUrl(enrollmentToken);

      const result = {
        ...session,
        enrollmentUrl,
        enrollmentToken,  // For admin reference
        teachers: teacherAssignments.map(t => ({
          email: t.teacher_email,
          role: t.role
        })),
        scenarioIds: params.scenarioIds
      };

      logger.info('Training session creation completed successfully', {
        sessionId: session.id,
        duration: Date.now() - startTime,
        enrollmentUrl
      });

      return result;

    } catch (error: any) {
      const duration = Date.now() - startTime;
      logger.error('TrainingSession creation failed', {
        title: params.title,
        createdBy: params.createdBy,
        error: error.message,
        errorName: error.name,
        errorCode: error.code,
        stack: error.stack,
        duration
      });

      // Rethrow with more context
      const enhancedError = new Error(
        `Failed to create training session "${params.title}": ${error.message}`
      );
      (enhancedError as any).originalError = error;
      (enhancedError as any).context = {
        title: params.title,
        createdBy: params.createdBy,
        duration
      };
      throw enhancedError;
    }
  }

  /**
   * Get training session by enrollment token (for preview)
   */
  async getSessionByToken(token: string): Promise<any> {
    try {
      logger.info('Looking up session by enrollment token', { token });
      const client = await unifiedDb.getClient();

      // First, get the basic session data
      const { data: session, error } = await client
        .from('training_sessions')
        .select('*')
        .eq('enrollment_token', token)
        .single();

      if (error) {
        logger.error('Database error when looking up session by token', {
          token,
          error: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint
        });
        return null;
      }

      if (!session) {
        logger.warn('Session not found by token', { token });
        return null;
      }

      logger.info('Session found by token', {
        token,
        sessionId: session.id,
        title: session.title
      });

      // Check token expiration
      if (new Date(session.token_expires_at) < new Date()) {
        logger.warn('Enrollment token expired', {
          token,
          sessionId: session.id,
          expiresAt: session.token_expires_at
        });
        throw new Error('ENROLLMENT_LINK_EXPIRED');
      }

      // Get associated scenarios separately to avoid relation errors
      let scenarios = [];
      try {
        const { data: scenarioLinks } = await client
          .from('training_session_scenarios')
          .select('scenario_id')
          .eq('training_session_id', session.id);

        if (scenarioLinks && scenarioLinks.length > 0) {
          const scenarioIds = scenarioLinks.map((link: any) => link.scenario_id);

          const { data: scenariosData } = await client
            .from('scenarios')
            .select('id, title, description, image_url')
            .in('id', scenarioIds);

          scenarios = scenariosData || [];
          logger.info('Loaded scenarios for session', {
            sessionId: session.id,
            scenariosCount: scenarios.length
          });
        }
      } catch (scenarioError: any) {
        logger.warn('Failed to load scenarios for session', {
          sessionId: session.id,
          error: scenarioError.message
        });
        // Continue without scenarios
      }

      return {
        id: session.id,
        title: session.title,
        description: session.description,
        scenarios,
        expiresAt: session.token_expires_at
      };

    } catch (error: any) {
      logger.error('Failed to get session by token', {
        token,
        error: error.message,
        errorName: error.name,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Enroll a student in a training session via token
   */
  async enrollStudent(token: string, studentEmail: string): Promise<EnrollmentResult> {
    try {
      const client = await unifiedDb.getClient();

      // 1. Find training session by token
      const { data: session, error: sessionError } = await client
        .from('training_sessions')
        .select('*')
        .eq('enrollment_token', token)
        .single();

      if (sessionError || !session) {
        logger.warn('Invalid enrollment token', { token });
        throw new Error('INVALID_ENROLLMENT_TOKEN');
      }

      // 2. Check token expiration
      if (new Date(session.token_expires_at) < new Date()) {
        logger.warn('Enrollment token expired', {
          token,
          sessionId: session.id,
          expiresAt: session.token_expires_at
        });
        throw new Error('ENROLLMENT_LINK_EXPIRED');
      }

      // 3. Check if student already enrolled
      const { data: existing } = await client
        .from('training_session_students')
        .select('*')
        .eq('training_session_id', session.id)
        .eq('student_email', studentEmail)
        .single();

      if (existing) {
        logger.info('Student already enrolled', {
          sessionId: session.id,
          studentEmail
        });
        return {
          session,
          alreadyEnrolled: true
        };
      }

      // 4. Enroll student
      const { error: enrollError } = await client
        .from('training_session_students')
        .insert({
          training_session_id: session.id,
          student_email: studentEmail,
          assigned_at: new Date().toISOString(),
          status: 'assigned'
        });

      if (enrollError) {
        logger.error('Failed to enroll student', {
          sessionId: session.id,
          studentEmail,
          error: enrollError
        });
        throw enrollError;
      }

      logger.info('Student enrolled successfully', {
        sessionId: session.id,
        sessionTitle: session.title,
        studentEmail,
        viaToken: token
      });

      return {
        session,
        alreadyEnrolled: false
      };

    } catch (error: any) {
      logger.error('Student enrollment failed', {
        token,
        studentEmail,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get all teachers assigned to a training session
   */
  async getSessionTeachers(trainingSessionId: number): Promise<any[]> {
    try {
      const client = await unifiedDb.getClient();

      const { data, error } = await client
        .from('training_session_teachers')
        .select('*')
        .eq('training_session_id', trainingSessionId)
        .order('role', { ascending: true });  // owner first

      if (error) throw error;

      return data || [];

    } catch (error: any) {
      logger.error('Failed to get session teachers', {
        trainingSessionId,
        error: error.message
      });
      return [];
    }
  }

  /**
   * Get all training sessions where a teacher is assigned
   */
  async getTeacherSessions(teacherEmail: string): Promise<number[]> {
    try {
      const client = await unifiedDb.getClient();

      const { data, error } = await client
        .from('training_session_teachers')
        .select('training_session_id')
        .eq('teacher_email', teacherEmail);

      if (error) throw error;

      return (data || []).map(row => row.training_session_id);

    } catch (error: any) {
      logger.error('Failed to get teacher sessions', {
        teacherEmail,
        error: error.message
      });
      return [];
    }
  }

  /**
   * Check if a teacher has access to a training session
   */
  async hasTeacherAccess(teacherEmail: string, trainingSessionId: number): Promise<boolean> {
    try {
      const client = await unifiedDb.getClient();

      const { data, error } = await client
        .from('training_session_teachers')
        .select('id')
        .eq('training_session_id', trainingSessionId)
        .eq('teacher_email', teacherEmail)
        .single();

      return !error && !!data;

    } catch (error: any) {
      return false;
    }
  }
}

// Singleton instance
export const trainingSessionService = new TrainingSessionService();
