import { patientTiming, timedPatientPhase, patientTimingError } from './services/patient-timing.js';
import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { z } from "zod";
import { users, ecosScenarios, ecosSessions, ecosMessages, ecosEvaluations, trainingSessions, trainingSessionStudents, trainingSessionScenarios } from '../shared/schema.js';
import { unifiedDb } from './services/unified-database.service.js';
import { VerifiedPatientScenarioUnavailableError } from './services/patient-case-guard.js';
import { EmptyPatientResponseError } from './services/mistral.service.js';
import { eq, and } from 'drizzle-orm';
import { scenarioSyncService } from './services/scenario-sync.service.js';
import {
  authService,
  authenticateToken,
  requireAdmin,
  isAdminAuthorized,
  authorizeByEmail,
  type AuthenticatedRequest
} from './middleware/auth.middleware.js';
import { verifyFirebaseToken, requireTeacher, requireStudent, requireAdmin as requireFirebaseAdmin, type FirebaseAuthRequest } from './middleware/firebase-auth.middleware.js';
import {
  validateLogin,
  validateCreateStudent,
  validateCreateEcosSession,
  validateEcosMessage,
  validateEcosEvaluation,
  validateEmailQuery,
  validateSessionIdParam,
  validateRequestSize,
  validateContentType,
  validateCreateTrainingSession,
  type ValidatedRequest
} from './middleware/validation.middleware.js';
import {
  authRateLimit,
  firebaseAuthRateLimit,
  apiRateLimit,
  strictRateLimit,
  emailBasedRateLimit,
  ecosSessionRateLimit,
  ecosEvaluationRateLimit
} from './middleware/rate-limit.middleware.js';
import { APIError, asyncHandler, sendErrorResponse } from './middleware/error-handler.middleware.js';
import { apiLogger, logger } from './services/logger.service.js';
import { openaiService } from './services/openai.service.js';
import { registerLtiRoutes } from './routes/lti.routes.js';

export async function registerRoutes(app: Express): Promise<Server> {
  const httpServer = createServer(app);

  registerLtiRoutes(app);

  // WebRTC signaling (voice realtime)
  try {
    const { setupVoiceWebRTC } = await import('./services/voice-webrtc.service.js');
    setupVoiceWebRTC(httpServer);
  } catch {
    // ignore if service not available
  }

  // Database initialization is now handled by startup sequencer
  // No async initialization needed here - all handled by UnifiedDatabaseService

  // In-memory user storage for demonstration
  const inMemoryUsers = new Map<string, { userId: string; createdAt: Date }>();

  async function findOrCreateStudent(email: string): Promise<{ userId: string; isNewUser: boolean }> {
    try {
      // Try database first - functionality temporarily disabled
      try {
        // Database operations temporarily disabled due to schema migration
        // Fallback to in-memory storage directly
        if (inMemoryUsers.has(email)) {
          const user = inMemoryUsers.get(email)!;
          return { userId: user.userId, isNewUser: false };
        }

        const userId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        inMemoryUsers.set(email, { userId, createdAt: new Date() });
        return { userId, isNewUser: true };
      } catch (dbError) {
        console.log('Database not available, using in-memory storage');
        
        // Fallback to in-memory storage
        if (inMemoryUsers.has(email)) {
          const user = inMemoryUsers.get(email)!;
          return { userId: user.userId, isNewUser: false };
        }

        const userId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        inMemoryUsers.set(email, { userId, createdAt: new Date() });
        return { userId, isNewUser: true };
      }
    } catch (error) {
      console.error('Error in findOrCreateStudent:', error);
      throw error;
    }
  }

  // Health check endpoint for diagnostics
  app.get("/api/health", (req: Request, res: Response) => {
    res.status(200).json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      service: "ecos-api",
      version: "1.0.0"
    });
  });

  // Teacher auth check endpoint for diagnostics
  app.get("/api/teacher/auth-check", requireFirebaseAdmin, (req: FirebaseAuthRequest, res: Response) => {

  // DEBUG: Test authentication endpoint
  app.get("/api/debug/auth-test", requireTeacher, async (req: FirebaseAuthRequest, res: Response) => {
    try {
      res.json({
        success: true,
        message: "Authentication successful!",
        user: {
          uid: req.firebaseUser?.uid,
          email: req.firebaseUser?.email,
          role: req.firebaseUser?.role,
          emailVerified: req.firebaseUser?.emailVerified
        },
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });
    // SECURITY: Admin access verified by requireFirebaseAdmin middleware

    res.status(200).json({
      message: "Teacher authentication successful",
      email: req.firebaseUser?.email,
      role: req.firebaseUser?.role,
      timestamp: new Date().toISOString()
    });
  });

  // Authentication endpoints
  app.post("/api/auth/login", authRateLimit.middleware(), validateContentType(), validateRequestSize(), validateLogin, async (req: ValidatedRequest, res: Response) => {
    try {
      const { email, password } = req.validatedBody || req.body;

      // For now, we'll use simple email-based auth during transition
      // In production, you'd verify the password against a database
      if (!isAdminAuthorized(email)) {
        return res.status(401).json({ 
          error: 'Invalid credentials',
          code: 'INVALID_CREDENTIALS'
        });
      }

      const token = authService.generateToken(email);
      
      res.status(200).json({
        message: 'Login successful',
        token,
        user: {
          email,
          isAdmin: true
        }
      });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ 
        error: 'Login failed',
        code: 'LOGIN_FAILED'
      });
    }
  });

  app.post("/api/auth/verify", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    res.status(200).json({
      message: 'Token valid',
      user: req.user
    });
  });

  app.get("/api/auth/profile", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    res.status(200).json({
      user: req.user,
      adminEmails: authService.getAdminEmails()
    });
  });

  // Check if email has admin privileges
  app.get("/api/auth/check-admin", asyncHandler(async (req: Request, res: Response) => {
    const email = req.query.email as string;

    if (!email) {
      throw APIError.badRequest('Email parameter required');
    }

    const isAdmin = authService.isAdmin(email);
    res.status(200).json({
      isAdmin,
      email: email.toLowerCase().trim()
    });
  }));

  // Firebase Authentication endpoints
  app.post("/api/auth/firebase-login", firebaseAuthRateLimit.middleware(), async (req: Request, res: Response) => {
    try {
      // Use the statically imported middleware
      const firebaseReq = req as any;

      await new Promise<void>((resolve, reject) => {
        verifyFirebaseToken(firebaseReq, res, (err?: any) => {
          if (err) reject(err);
          else resolve();
        });
      });

      // Return user data and JWT token
      res.status(200).json({
        user: {
          uid: firebaseReq.firebaseUser.uid,
          email: firebaseReq.firebaseUser.email,
          role: firebaseReq.firebaseUser.role,
          emailVerified: firebaseReq.firebaseUser.emailVerified
        },
        jwtToken: firebaseReq.jwtToken,
        message: 'Firebase authentication successful'
      });
    } catch (error: any) {
      console.error('❌ Firebase login error:', error);
      res.status(403).json({
        error: error.message || 'Firebase authentication failed',
        code: 'FIREBASE_LOGIN_FAILED'
      });
    }
  });

  app.post("/api/auth/firebase-register", firebaseAuthRateLimit.middleware(), validateContentType(), validateRequestSize(), async (req: Request, res: Response) => {
    try {
      const { email, password, firstName, lastName } = req.body;

      if (!email || !password) {
        return res.status(400).json({
          error: 'Email and password are required',
          code: 'MISSING_CREDENTIALS'
        });
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({
          error: 'Invalid email format',
          code: 'INVALID_EMAIL'
        });
      }

      // Validate password strength
      if (password.length < 6) {
        return res.status(400).json({
          error: 'Password must be at least 6 characters',
          code: 'WEAK_PASSWORD'
        });
      }

      // Import Firebase Admin service
      const { firebaseAdminService } = await import('./services/firebase-admin.service.js');

      // Check if user already exists
      const existingUser = await firebaseAdminService.getUserByEmail(email);
      if (existingUser) {
        return res.status(409).json({
          error: 'Email already in use',
          code: 'EMAIL_IN_USE'
        });
      }

      // Create Firebase user
      const firebaseUser = await firebaseAdminService.createUser(email, password);

      // Create user in Supabase
      const supabaseUser = await unifiedDb.createUser({
        email,
        firebaseUid: firebaseUser.uid,
        firstName: firstName || null,
        lastName: lastName || null,
        profileImageUrl: null
      });

      // Assign student role by default
      await unifiedDb.setUserRole(supabaseUser.id, 'student');

      // Generate JWT token
      const jwtToken = authService.generateToken(email);

      res.status(201).json({
        user: {
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          role: 'student',
          emailVerified: false
        },
        jwtToken,
        message: 'User registered successfully'
      });

    } catch (error: any) {
      console.error('❌ Firebase registration error:', error);
      res.status(500).json({
        error: error.message || 'Registration failed',
        code: 'REGISTRATION_FAILED'
      });
    }
  });

  // Route to sync scenarios from Pinecone - supports both auth methods during transition
  app.post("/api/admin/sync-scenarios", requireFirebaseAdmin, asyncHandler(async (req: FirebaseAuthRequest, res: Response) => {
    // SECURITY: Admin access verified by requireFirebaseAdmin middleware
    console.log(`🔄 Syncing scenarios from Pinecone for admin: ${req.firebaseUser?.email}`);

    await scenarioSyncService.syncScenariosFromPinecone();
    res.status(200).json({
      message: "Synchronisation des scénarios terminée avec succès",
      success: true
    });
  }));

  // Route to test direct database connection and fetch scenarios
  app.get("/api/admin/test-db", requireFirebaseAdmin, async (req: FirebaseAuthRequest, res: Response) => {
    try {
      // SECURITY: Admin access verified by requireFirebaseAdmin middleware
      console.log(`🔧 Testing database connection for admin: ${req.firebaseUser?.email}`);
      await unifiedDb.initialize(); // Ensure database is initialized

      const scenarios = await unifiedDb.getScenarios();

      res.status(200).json({
        connected: true,
        scenarios,
        count: scenarios.length,
        message: `Connexion Supabase réussie - ${scenarios.length} scénarios trouvés`
      });

    } catch (error: any) {
      console.error("Error connecting to Supabase:", error);
      res.status(500).json({
        message: "Erreur de connexion à la base de données Supabase",
        error: error.message,
        connected: false,
        code: "DB_CONNECTION_FAILED"
      });
    }
  });

  // Route to get available scenarios for students
  // 🔒 SECURED: Requires student authentication via Firebase token
  // Returns only scenarios assigned to the student via training sessions
  app.get("/api/student/available-scenarios", requireStudent, async (req: FirebaseAuthRequest, res: Response) => {
    try {
      // SECURITY: Email retrieved from verified Firebase token
      const email = req.firebaseUser!.email;
      console.log(`🔧 Fetching scenarios for student: ${email}`);
      
      // Get scenarios filtered by student's training sessions
      const scenarios = await scenarioSyncService.getScenariosForStudent(email);
      
      console.log(`✅ Returning ${scenarios.length} scenario(s) for student ${email}`);
      
      res.status(200).json({ 
        scenarios,
        connected: true,
        source: 'database'
      });
      
    } catch (error: any) {
      console.error("Error fetching student scenarios:", error);
      res.status(500).json({ 
        message: "Erreur de connexion à la base de données",
        error: error.message,
        connected: false
      });
    }
  });

  // Route to get scenarios for teacher dashboard
  app.get("/api/teacher/scenarios", requireTeacher, async (req: FirebaseAuthRequest, res: Response) => {
    // SECURITY: Admin access verified by requireFirebaseAdmin middleware

    console.log('✅ [ADMIN-ACCESS] Authorized admin:', req.firebaseUser?.email);

    try {
      console.log('🔧 Fetching teacher scenarios using unified database...');

      const scenarios = await unifiedDb.getScenarios();

      res.status(200).json({
        scenarios,
        connected: true,
        source: 'unified-database'
      });

    } catch (error: any) {
      console.error("Error fetching teacher scenarios:", error);

      // Fallback response
      res.status(200).json({
        scenarios: [],
        connected: false,
        source: 'error-fallback',
        message: 'Service temporarily unavailable',
        error: error.message
      });
    }
  });

  // Route to get scenarios (GET /api/ecos/scenarios) - using UnifiedDatabaseService
  app.get("/api/ecos/scenarios", async (req: Request, res: Response) => {
    try {
      console.log('🔧 Fetching scenarios via /api/ecos/scenarios using unified database...');
      
      const scenarios = await unifiedDb.getScenarios();
      
      res.status(200).json({ 
        scenarios,
        connected: true,
        source: 'unified-database-ecos-endpoint'
      });
      
    } catch (error: any) {
      console.error("Error fetching scenarios via /api/ecos/scenarios:", error);
      
      // Fallback response
      res.status(200).json({ 
        scenarios: [],
        connected: false,
        source: 'error-fallback-ecos-endpoint',
        message: 'Service temporarily unavailable',
        error: error.message
      });
    }
  });

  // Route to create a new scenario
  app.post("/api/ecos/scenarios", requireFirebaseAdmin, ecosSessionRateLimit.middleware(), validateContentType(), validateRequestSize(), async (req: FirebaseAuthRequest, res: Response) => {
    try {
      // SECURITY: Admin access verified by requireFirebaseAdmin middleware
      const { title, description, patientPrompt, evaluationCriteria, pineconeIndex, voiceType } = req.body;

      if (!title || !description) {
        return res.status(400).json({
          message: "Titre et description requis",
          code: "MISSING_REQUIRED_FIELDS"
        });
      }

      console.log(`🔄 Creating scenario for admin: ${req.firebaseUser?.email}`);

      // Parse and validate evaluation criteria if provided
      let parsedCriteria = null;
      if (evaluationCriteria) {
        try {
          // Handle both string and object formats
          if (typeof evaluationCriteria === 'string') {
            parsedCriteria = JSON.parse(evaluationCriteria);
          } else if (typeof evaluationCriteria === 'object') {
            parsedCriteria = evaluationCriteria;
          }

          // Validate criteria structure
          if (!parsedCriteria || typeof parsedCriteria !== 'object') {
            throw new Error('Evaluation criteria must be a valid object');
          }
        } catch (parseError) {
          return res.status(400).json({
            message: "Format JSON invalide pour les critères d'évaluation",
            error: (parseError as Error).message,
            code: "INVALID_JSON_FORMAT"
          });
        }
      }

      // Use unified database service for scenario creation
      await unifiedDb.initialize(); // Ensure database is initialized

      const newScenario = await unifiedDb.createScenario({
        title,
        description,
        patientPrompt: patientPrompt || null,
        evaluationCriteria: parsedCriteria,
        voiceType: voiceType || 'male',
        imageUrl: null,
        createdBy: req.firebaseUser!.email
      });

      res.status(200).json({
        message: "Scénario créé avec succès",
        scenario: newScenario,
        success: true
      });

    } catch (error: any) {
      console.error("Error creating scenario:", error);
      res.status(500).json({
        message: "Erreur lors de la création du scénario",
        error: error.message,
        code: "SCENARIO_CREATE_FAILED"
      });
    }
  });

  // Route to update a scenario
  app.put("/api/ecos/scenarios/:id", requireFirebaseAdmin, ecosSessionRateLimit.middleware(), validateContentType(), validateRequestSize(), async (req: FirebaseAuthRequest, res: Response) => {
    try {
      // SECURITY: Admin access verified by requireFirebaseAdmin middleware
      const { id } = req.params;
      const { title, description, patientPrompt, evaluationCriteria, pineconeIndex, voiceType } = req.body;

      console.log(`🔄 Updating scenario ${id} for admin: ${req.firebaseUser?.email}`);

      // Parse and validate evaluation criteria if provided
      let parsedCriteria = null;
      if (evaluationCriteria) {
        try {
          // Handle both string and object formats
          if (typeof evaluationCriteria === 'string') {
            parsedCriteria = JSON.parse(evaluationCriteria);
          } else if (typeof evaluationCriteria === 'object') {
            parsedCriteria = evaluationCriteria;
          }

          // Validate criteria structure
          if (!parsedCriteria || typeof parsedCriteria !== 'object') {
            throw new Error('Evaluation criteria must be a valid object');
          }
        } catch (parseError) {
          return res.status(400).json({
            message: "Format JSON invalide pour les critères d'évaluation",
            error: (parseError as Error).message,
            code: "INVALID_JSON_FORMAT"
          });
        }
      }

      // Use unified database service for scenario updates
      await unifiedDb.initialize(); // Ensure database is initialized

      const updatedScenario = await unifiedDb.updateScenario(id, {
        title,
        description,
        patientPrompt: patientPrompt || null,
        evaluationCriteria: parsedCriteria,
        pineconeIndex: pineconeIndex || null,
        voiceType: voiceType || undefined
      });

      res.status(200).json({
        message: "Scénario modifié avec succès",
        scenario: updatedScenario,
        success: true
      });

    } catch (error: any) {
      console.error("Error updating scenario:", error);
      res.status(500).json({
        message: "Erreur lors de la modification du scénario",
        error: error.message,
        code: "SCENARIO_UPDATE_FAILED"
      });
    }
  });

  // Route to delete a scenario
  app.delete("/api/ecos/scenarios/:id", requireFirebaseAdmin, ecosSessionRateLimit.middleware(), async (req: FirebaseAuthRequest, res: Response) => {
    try {
      // SECURITY: Admin access verified by requireFirebaseAdmin middleware
      const { id } = req.params;

      console.log(`🔄 Deleting scenario ${id} for admin: ${req.firebaseUser?.email}`);

      // Use unified database service for scenario deletion
      await unifiedDb.initialize(); // Ensure database is initialized
      await unifiedDb.deleteScenario(id);

      res.status(200).json({
        message: "Scénario supprimé avec succès",
        success: true
      });

    } catch (error: any) {
      console.error("Error deleting scenario:", error);
      res.status(500).json({
        message: "Erreur lors de la suppression du scénario",
        error: error.message,
        code: "SCENARIO_DELETE_FAILED"
      });
    }
  });

  // Route to generate evaluation criteria for a scenario
  app.post("/api/ecos/generate-criteria", requireFirebaseAdmin, ecosSessionRateLimit.middleware(), validateContentType(), validateRequestSize(), async (req: FirebaseAuthRequest, res: Response) => {
    try {
      // SECURITY: Admin access verified by requireFirebaseAdmin middleware
      const { scenarioDescription } = req.body;

      if (!scenarioDescription) {
        return res.status(400).json({
          message: "Description du scénario requise",
          code: "MISSING_SCENARIO_DESCRIPTION"
        });
      }

      console.log(`🔄 Generating evaluation criteria for admin: ${req.firebaseUser?.email}`);

      const { promptGenService } = await import('./services/promptGen.service.js');

      const criteria = await promptGenService.generateEvaluationCriteria(scenarioDescription);

      res.status(200).json({
        message: "Critères d'évaluation générés avec succès",
        criteria,
        success: true
      });

    } catch (error: any) {
      console.error("Error generating evaluation criteria:", error);
      res.status(500).json({
        message: "Erreur lors de la génération des critères d'évaluation",
        error: error.message,
        code: "CRITERIA_GENERATION_FAILED"
      });
    }
  });

  // New dedicated teacher endpoint for generating and synchronizing criteria
  app.post("/api/teacher/generate-criteria", requireFirebaseAdmin, ecosSessionRateLimit.middleware(), validateContentType(), validateRequestSize(), async (req: FirebaseAuthRequest, res: Response) => {
    try {
      // SECURITY: Admin access verified by requireFirebaseAdmin middleware
      const { textCriteria, scenarioId } = req.body;

      // Validation
      if (!textCriteria) {
        return res.status(400).json({
          message: "Description des critères d'évaluation requise",
          code: "MISSING_TEXT_CRITERIA"
        });
      }

      console.log(`🔄 Generating criteria for teacher ${req.firebaseUser?.email}`);
      console.log(`📝 Text criteria: ${textCriteria.substring(0, 100)}...`);

      // Import prompt generation service
      const { promptGenService } = await import('./services/promptGen.service.js');

      // Generate structured JSON criteria using AI
      const generatedCriteria = await promptGenService.generateEvaluationCriteria(textCriteria);
      console.log('✅ Generated criteria:', generatedCriteria);

      // If scenarioId is provided, update the scenario in database
      if (scenarioId) {
        console.log(`📊 Updating scenario ${scenarioId} with generated criteria`);

        try {
          await unifiedDb.initialize();
          const updatedScenario = await unifiedDb.updateScenario(scenarioId, {
            evaluationCriteria: generatedCriteria
          });

          console.log(`✅ Scenario ${scenarioId} updated successfully`);

          // Return response with database sync confirmation
          res.status(200).json({
            message: "Critères d'évaluation générés et synchronisés avec succès",
            criteria: generatedCriteria,
            scenarioUpdated: true,
            scenarioId: scenarioId,
            scenarioTitle: updatedScenario.title
          });
        } catch (updateError: any) {
          console.error(`❌ Failed to update scenario ${scenarioId}:`, updateError.message);

          // Return criteria even if database sync failed
          res.status(200).json({
            message: "Critères d'évaluation générés avec succès, mais la synchronisation avec la base de données a échoué",
            criteria: generatedCriteria,
            scenarioUpdated: false,
            error: updateError.message,
            warning: `Le scénario ${scenarioId} n'existe pas ou n'a pas pu être mis à jour`
          });
        }
      } else {
        // Return response without database sync
        res.status(200).json({
          message: "Critères d'évaluation générés avec succès",
          criteria: generatedCriteria,
          scenarioUpdated: false
        });
      }

    } catch (error: any) {
      console.error("Error in teacher generate-criteria:", error);
      res.status(500).json({
        message: "Erreur lors de la génération des critères d'évaluation",
        error: error.message,
        code: "TEACHER_CRITERIA_GENERATION_FAILED",
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  });

  // Route to update Pinecone index for a scenario
  app.post("/api/teacher/update-pinecone-index", requireFirebaseAdmin, ecosSessionRateLimit.middleware(), validateContentType(), validateRequestSize(), async (req: FirebaseAuthRequest, res: Response) => {
    try {
      // SECURITY: Admin access verified by requireFirebaseAdmin middleware
      const { scenarioId, pineconeIndex } = req.body;

      // Validation
      if (!scenarioId) {
        return res.status(400).json({
          message: "ID du scénario requis",
          code: "MISSING_SCENARIO_ID"
        });
      }

      if (!pineconeIndex) {
        return res.status(400).json({
          message: "Index Pinecone requis",
          code: "MISSING_PINECONE_INDEX"
        });
      }

      console.log(`🔄 Updating Pinecone index for scenario ${scenarioId} to ${pineconeIndex} (admin: ${req.firebaseUser?.email})`);

      await unifiedDb.initialize();
      const updatedScenario = await unifiedDb.updateScenario(scenarioId, {
        pineconeIndex: pineconeIndex
      });

      console.log(`✅ Scenario ${scenarioId} Pinecone index updated successfully`);

      res.status(200).json({
        message: "Index Pinecone synchronisé avec succès",
        scenarioId: scenarioId,
        pineconeIndex: pineconeIndex,
        scenarioTitle: updatedScenario.title,
        success: true
      });

    } catch (error: any) {
      console.error(`❌ Failed to update Pinecone index for scenario:`, error.message);

      res.status(500).json({
        message: "Erreur lors de la synchronisation de l'index Pinecone",
        error: error.message,
        code: "PINECONE_INDEX_UPDATE_FAILED",
        success: false
      });
    }
  });

  // Route to get dashboard stats for teachers
  app.get("/api/teacher/dashboard", requireTeacher, async (req: FirebaseAuthRequest, res: Response) => {
    // SECURITY: Admin access verified by requireFirebaseAdmin middleware

    try {
      console.log('🔧 Fetching teacher dashboard for:', req.firebaseUser?.email);

      const stats = await unifiedDb.getDashboardStats();

      res.status(200).json(stats);
    } catch (error: any) {
      console.error("Error fetching dashboard stats:", error);

      // Fallback response
      res.status(200).json({
        totalScenarios: 0,
        activeSessions: 0,
        completedSessions: 0,
        totalStudents: 0,
        message: "Service temporarily unavailable"
      });
    }
  });

  // Route to get available Pinecone indexes
  app.get("/api/admin/indexes", requireFirebaseAdmin, ecosSessionRateLimit.middleware(), async (req: FirebaseAuthRequest, res: Response) => {
    try {
      // SECURITY: Admin access verified by requireFirebaseAdmin middleware
      console.log(`🔄 Fetching Pinecone indexes for admin: ${req.firebaseUser?.email}`);

      const { pineconeService } = await import('./services/pinecone.service.js');

      const indexes = await pineconeService.listIndexes();
      console.log('✅ Indexes fetched successfully:', indexes);

      res.status(200).json({
        indexes,
        message: "Index récupérés avec succès",
        success: true
      });
    } catch (error: any) {
      console.error("Error fetching indexes:", error);
      res.status(500).json({
        message: "Erreur lors de la récupération des index Pinecone",
        error: error.message,
        code: "INDEXES_FETCH_FAILED"
      });
    }
  });

  // API route to create or verify a student account
  app.post("/api/student", validateContentType(), validateRequestSize(), validateCreateStudent, async (req: ValidatedRequest, res: Response) => {
    const schema = z.object({
      email: z.string().email("Format d'email invalide"),
    });

    try {
      const { email } = schema.parse(req.body);
      const { userId, isNewUser } = await findOrCreateStudent(email);
      res.status(200).json({ 
        message: "Compte étudiant traité avec succès", 
        userId, 
        isNewUser 
      });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Données invalides", errors: error.errors });
      }
      console.error("Error in /api/student:", error);
      res.status(500).json({ message: "Erreur interne du serveur" });
    }
  });

  // Auto-register student endpoint (used by student page)
  app.post("/api/student/auto-register", validateContentType(), validateRequestSize(), async (req: Request, res: Response) => {
    const schema = z.object({
      email: z.string().email("Format d'email invalide"),
    });

    try {
      const { email } = schema.parse(req.body);
      console.log('🚀 Auto-registering student:', email);
      
      const { userId, isNewUser } = await findOrCreateStudent(email);
      
      res.status(200).json({ 
        message: "Auto-registration successful", 
        userId, 
        isNewUser,
        email
      });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid email format", errors: error.errors });
      }
      console.error("Error in /api/student/auto-register:", error);
      res.status(500).json({ message: "Auto-registration failed" });
    }
  });

  // API route to start a simulation session (disabled for now - using fallback data)
  app.post("/api/session/start", async (req: Request, res: Response) => {
    return res.status(501).json({ 
      message: "Fonctionnalité temporairement désactivée",
      details: "Cette fonctionnalité sera réactivée une fois la base de données connectée"
    });
  });

  // API route to get scenarios for a student
  // 🔒 SECURED: Requires student authentication via Firebase token
  app.get("/api/student/scenarios", requireStudent, async (req: FirebaseAuthRequest, res: Response) => {
    try {
      // SECURITY: Email retrieved from verified Firebase token (NOT from query)
      const email = req.firebaseUser!.email;
      
      // Use scenario sync service to get scenarios
      try {
        const scenarios = await scenarioSyncService.getAvailableScenarios();
        
        res.status(200).json({ 
          scenarios: scenarios,
          training_sessions: [],
          source: 'database'
        });
      } catch (dbError: any) {
        console.error('Database error:', dbError);
        // Return empty array if database error
        res.status(200).json({ 
          scenarios: [],
          training_sessions: [],
          source: 'database',
          error: 'Database connection issue'
        });
      }

    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Données invalides", errors: error.errors });
      }
      console.error("Error in /api/student/scenarios:", error);
      res.status(500).json({ message: "Erreur interne du serveur" });
    }
  });

  // Admin health check
  app.get("/api/admin/health", async (req: Request, res: Response) => {
    try {
      // Use unified database service for health check
      const healthResult = await unifiedDb.healthCheck();
      res.status(200).json({
        status: 'healthy',
        message: 'Database connection is working.',
        metrics: healthResult.metrics,
        uptime: healthResult.uptime
      });
    } catch (error: any) {
      console.error('Health check failed:', error);
      res.status(500).json({
        status: 'unhealthy',
        message: 'Database connection failed',
        error: error.message
      });
    }
  });

  // ==================== ADMIN USER MANAGEMENT ROUTES ====================

  // Get all users (for admin UI)
  app.get("/api/admin/users", requireAdmin, async (req: FirebaseAuthRequest, res: Response) => {
    try {
      const client = await unifiedDb.getClient();

      const { data: users, error } = await client
        .from('users')
        .select('id, email, role, created_at, updated_at')
        .order('created_at', { ascending: false });

      if (error) {
        throw error;
      }

      console.log(`📋 Admin ${req.firebaseUser?.email} fetched ${users?.length || 0} users`);

      res.status(200).json({
        users: users || [],
        count: users?.length || 0,
        success: true
      });
    } catch (error: any) {
      console.error('Error fetching users:', error);
      res.status(500).json({
        error: 'Failed to fetch users',
        code: 'USERS_FETCH_FAILED',
        message: error.message
      });
    }
  });

  // Update user role (promote to teacher or admin)
  app.patch("/api/admin/users/:email/role", requireAdmin, validateContentType(), validateRequestSize(), async (req: FirebaseAuthRequest, res: Response) => {
    try {
      const { email } = req.params;
      const { role } = req.body;

      // Validate role
      const validRoles = ['student', 'teacher', 'admin'];
      if (!role || !validRoles.includes(role)) {
        return res.status(400).json({
          error: 'Invalid role',
          code: 'INVALID_ROLE',
          message: `Role must be one of: ${validRoles.join(', ')}`
        });
      }

      // Validate email
      if (!email || !email.includes('@')) {
        return res.status(400).json({
          error: 'Invalid email',
          code: 'INVALID_EMAIL'
        });
      }

      const client = await unifiedDb.getClient();

      // Check if user exists
      const { data: existingUser, error: fetchError } = await client
        .from('users')
        .select('id, email, role')
        .eq('email', email.toLowerCase().trim())
        .single();

      if (fetchError || !existingUser) {
        return res.status(404).json({
          error: 'User not found',
          code: 'USER_NOT_FOUND',
          message: `No user found with email: ${email}`
        });
      }

      // Prevent self-demotion from admin
      if (req.firebaseUser?.email === email && existingUser.role === 'admin' && role !== 'admin') {
        return res.status(403).json({
          error: 'Cannot demote yourself',
          code: 'SELF_DEMOTION_FORBIDDEN',
          message: 'Administrators cannot demote themselves'
        });
      }

      // Update role
      const { data: updatedUser, error: updateError } = await client
        .from('users')
        .update({
          role,
          updated_at: new Date().toISOString()
        })
        .eq('email', email.toLowerCase().trim())
        .select()
        .single();

      if (updateError) {
        throw updateError;
      }

      console.log(`✅ Admin ${req.firebaseUser?.email} updated ${email} role: ${existingUser.role} → ${role}`);

      res.status(200).json({
        user: updatedUser,
        message: `User ${email} role updated to ${role}`,
        success: true
      });
    } catch (error: any) {
      console.error('Error updating user role:', error);
      res.status(500).json({
        error: 'Failed to update user role',
        code: 'ROLE_UPDATE_FAILED',
        message: error.message
      });
    }
  });

  // Route to get students for teacher dashboard
  app.get("/api/teacher/students", requireTeacher, async (req: FirebaseAuthRequest, res: Response) => {
    // SECURITY: Admin access verified by requireFirebaseAdmin middleware

    try {
      console.log('🔧 Fetching teacher students for:', req.firebaseUser?.email);

      const students = await unifiedDb.getStudents();

      res.status(200).json({
        students,
        message: "Student list retrieved successfully",
        connected: true
      });

    } catch (error: any) {
      console.error("Error fetching teacher students:", error);
      res.status(200).json({
        students: [],
        message: "Service temporarily unavailable",
        connected: false,
        error: error.message
      });
    }
  });

  // ==================== REALTIME TEACHER DASHBOARD ROUTES ====================

  // Get active students with real-time progress
  // 🔒 SECURED: Requires teacher authentication via Firebase token
  app.get("/api/teacher/realtime/active-students", requireTeacher, async (req: FirebaseAuthRequest, res: Response) => {
    try {
      // SECURITY: Email and role retrieved from verified Firebase token (NOT from query params)
      const teacherEmail = req.firebaseUser!.email;
      const userRole = req.firebaseUser!.role;

      // Extract optional filter parameters
      const scenarioId = req.query.scenarioId ? parseInt(req.query.scenarioId as string) : undefined;
      const trainingSessionId = req.query.trainingSessionId ? parseInt(req.query.trainingSessionId as string) : undefined;

      console.log(`📊 Fetching active students for authenticated user: ${teacherEmail} (${userRole})`, {
        scenarioId,
        trainingSessionId
      });

      const { realtimeAnalysisService } = await import('./services/realtime-analysis.service.js');
      const activeStudents = await realtimeAnalysisService.getActiveStudents(teacherEmail, {
        scenarioId,
        trainingSessionId,
        role: userRole
      });

      // Transform the database records to match frontend expectations
      const transformedStudents = activeStudents.map(snapshot => ({
        sessionId: snapshot.sessions?.session_id || `session_${snapshot.session_id}`,
        studentEmail: snapshot.sessions?.student_email || null,
        scenarioId: snapshot.scenario_id,
        scenarioTitle: snapshot.scenarios?.title || null,
        lastSnapshot: {
          timestamp: snapshot.timestamp,
          strengths: snapshot.strengths || [],
          weaknesses: snapshot.weaknesses || [],
          progressIndicators: snapshot.progress_indicators || {},
          exchangeCount: snapshot.exchange_count || 0,
          status: snapshot.status
        }
      }));

      res.status(200).json({
        students: transformedStudents,
        count: transformedStudents.length,
        timestamp: new Date().toISOString(),
        filters: { scenarioId, trainingSessionId }
      });

    } catch (error: any) {
      console.error("Error fetching active students:", error);
      res.status(500).json({
        error: "Failed to fetch active students",
        code: "ACTIVE_STUDENTS_FETCH_FAILED",
        message: error.message
      });
    }
  });

  // Get progress history for a specific student session
  // 🔒 SECURED: Requires teacher authentication via Firebase token
  app.get("/api/teacher/realtime/student-progress/:sessionId", requireTeacher, async (req: FirebaseAuthRequest, res: Response) => {
    try {
      const { sessionId } = req.params;
      // SECURITY: Email retrieved from verified Firebase token (NOT from query params)
      const teacherEmail = req.firebaseUser!.email;

      console.log(`📈 Fetching progress history for session: ${sessionId} (teacher: ${teacherEmail})`);

      // Get session info
      const session = await unifiedDb.getSessionByStringId(sessionId);
      if (!session) {
        return res.status(404).json({
          error: "Session not found",
          code: "SESSION_NOT_FOUND"
        });
      }

      // Get all snapshots for this session
      const client = await unifiedDb.getClient();
      const { data: snapshots, error } = await client
        .from('student_progress_snapshots')
        .select('id, session_id, student_email, scenario_id, timestamp, status, exchange_count, progress_indicators, strengths, weaknesses')
        .eq('session_id', session.id)
        .eq('student_email', session.student_email)  // ✅ FIX: Filter by student email to prevent data mixing
        .order('timestamp', { ascending: true})
        .limit(100); // Limit to 100 snapshots per session to avoid timeout

      if (error) {
        throw error;
      }

      // Get evaluation for this session (if exists)
      const { data: evaluation, error: evalError } = await client
        .from('evaluations')
        .select('global_score')
        .eq('session_id', session.id)
        .eq('student_email', session.student_email)  // ✅ FIX: Filter by student email to get the correct evaluation
        .maybeSingle();  // Use maybeSingle() to handle case where no evaluation exists yet

      // Transform snake_case to camelCase for frontend compatibility
      const transformedSnapshots = (snapshots || []).map(snapshot => ({
        id: snapshot.id,
        sessionId: snapshot.session_id,
        studentEmail: snapshot.student_email,
        scenarioId: snapshot.scenario_id,
        timestamp: snapshot.timestamp,
        strengths: snapshot.strengths || [],
        weaknesses: snapshot.weaknesses || [],
        progressIndicators: snapshot.progress_indicators || {},
        exchangeCount: snapshot.exchange_count || 0,
        status: snapshot.status
      }));

      res.status(200).json({
        sessionId,
        snapshots: transformedSnapshots,
        count: transformedSnapshots.length,
        globalScore: evaluation?.global_score || null  // Add global score from evaluation
      });

    } catch (error: any) {
      console.error("Error fetching student progress:", error);
      res.status(500).json({
        error: "Failed to fetch student progress",
        code: "STUDENT_PROGRESS_FETCH_FAILED",
        message: error.message
      });
    }
  });

  // Generate session summary for a specific date
  // 🔒 SECURED: Requires teacher authentication via Firebase token
  app.post("/api/teacher/realtime/generate-summary", requireTeacher, async (req: FirebaseAuthRequest, res: Response) => {
    try {
      // SECURITY: Email retrieved from verified Firebase token (NOT from request body)
      const teacherEmail = req.firebaseUser!.email;
      const { sessionDate, scenarioId } = req.body;

      if (!sessionDate) {
        return res.status(400).json({
          error: "Session date is required",
          code: "MISSING_SESSION_DATE"
        });
      }

      console.log(`📝 Generating session summary for ${sessionDate} (authenticated teacher: ${teacherEmail})`);

      // Use the RealtimeAnalysisService to generate summary
      const { realtimeAnalysisService } = await import('./services/realtime-analysis.service.js');
      const summary = await realtimeAnalysisService.generateSessionSummary(
        sessionDate,
        teacherEmail,
        scenarioId
      );

      res.status(200).json({
        summary,
        success: true
      });

    } catch (error: any) {
      console.error("Error generating session summary:", error);

      // Handle specific error cases
      if (error.message.includes('No snapshots found') || error.message.includes('No activity found')) {
        return res.status(404).json({
          error: "No activity found for this date",
          code: "NO_DATA_FOUND",
          message: error.message
        });
      }

      res.status(500).json({
        error: "Failed to generate session summary",
        code: "SUMMARY_GENERATION_FAILED",
        message: error.message
      });
    }
  });

  // Get session summary for a specific date
  // 🔒 SECURED: Requires teacher authentication via Firebase token
  app.get("/api/teacher/realtime/summary/:sessionDate", requireTeacher, async (req: FirebaseAuthRequest, res: Response) => {
    try {
      const { sessionDate } = req.params;
      const { scenarioId } = req.query;
      // SECURITY: Email retrieved from verified Firebase token (NOT from query params)
      const teacherEmail = req.firebaseUser!.email;

      console.log(`📊 Fetching session summary for ${sessionDate} (authenticated teacher: ${teacherEmail})`);

      const client = await unifiedDb.getClient();
      let query = client
        .from('session_summaries')
        .select('*')
        .eq('session_date', sessionDate)
        .eq('teacher_email', teacherEmail);

      if (scenarioId) {
        query = query.eq('scenario_id', parseInt(scenarioId as string));
      } else {
        // If no scenarioId specified, filter for NULL scenario_id (global summary)
        query = query.is('scenario_id', null);
      }

      // Get the most recent summary (in case of duplicates)
      query = query.order('created_at', { ascending: false }).limit(1);

      const { data: summaries, error } = await query;

      if (error) {
        throw error;
      }

      if (!summaries || summaries.length === 0) {
        return res.status(404).json({
          error: "No summary found for this date",
          code: "SUMMARY_NOT_FOUND",
          message: "Generate a summary first using POST /api/teacher/realtime/generate-summary"
        });
      }

      const summary = summaries[0];

      // Transform snake_case to camelCase for frontend compatibility
      const transformedSummary = {
        id: summary.id,
        sessionDate: summary.session_date,
        teacherEmail: summary.teacher_email,
        scenarioId: summary.scenario_id,
        totalStudents: summary.total_students,
        summaryData: summary.summary_data,
        commonStrengths: summary.common_strengths,
        commonWeaknesses: summary.common_weaknesses,
        trends: summary.trends,
        createdAt: summary.created_at,
        updatedAt: summary.updated_at
      };

      res.status(200).json({
        summary: transformedSummary,
        success: true
      });

    } catch (error: any) {
      console.error("Error fetching session summary:", error);
      res.status(500).json({
        error: "Failed to fetch session summary",
        code: "SUMMARY_FETCH_FAILED",
        message: error.message
      });
    }
  });

  // ==================== DIAGNOSTIC ENDPOINT FOR REALTIME MONITORING ====================
  app.get("/api/teacher/realtime/diagnostic", requireTeacher, async (req: FirebaseAuthRequest, res: Response) => {
    try {
      const teacherEmail = req.firebaseUser!.email;
      const client = await unifiedDb.getClient();

      console.log(`🔍 Running realtime diagnostic for teacher: ${teacherEmail}`);

      // 1. Check if table exists
      const { data: tableCheck, error: tableError } = await client
        .from('student_progress_snapshots')
        .select('id')
        .limit(1);

      const tableExists = !tableError || tableError.code !== '42P01';

      // 2. Count total snapshots
      const { count: totalSnapshots, error: countError } = await client
        .from('student_progress_snapshots')
        .select('*', { count: 'exact', head: true });

      // 3. Count active (in_progress) snapshots
      const { count: activeSnapshots, error: activeError } = await client
        .from('student_progress_snapshots')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'in_progress');

      // 4. Get recent snapshots (last 10)
      const { data: recentSnapshots, error: recentError } = await client
        .from('student_progress_snapshots')
        .select(`
          *,
          sessions!inner(student_email, scenario_id, session_id, status),
          scenarios(id, title, created_by)
        `)
        .order('timestamp', { ascending: false })
        .limit(10);

      // 5. Check ALL recent sessions (ALL STATUSES) to see what's in the DB
      const { data: allRecentSessions, error: sessionsError } = await client
        .from('sessions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);

      // Group sessions by status
      const sessionsByStatus: Record<string, any[]> = {};
      allRecentSessions?.forEach(session => {
        const status = session.status || 'null';
        if (!sessionsByStatus[status]) sessionsByStatus[status] = [];
        sessionsByStatus[status].push(session);
      });

      // 6. Get ALL scenarios and compare IDs
      const scenarios = await unifiedDb.getScenarios();
      const scenarioIdMapping = scenarios.map(s => ({
        dbId: s.id,
        title: s.title,
        status: s.status || 'unknown',
        created_by: s.created_by
      }));

      // 7. Check messages count for recent sessions
      const sessionMessageCounts = allRecentSessions ? await Promise.all(
        allRecentSessions.slice(0, 10).map(async (session) => {
          try {
            const messages = await unifiedDb.getSessionMessages(session.session_id);
            const userMsgs = messages.filter(m => m.role === 'user').length;
            const assistantMsgs = messages.filter(m => m.role === 'assistant').length;
            const exchangeCount = Math.min(userMsgs, assistantMsgs);

            return {
              sessionId: session.session_id,
              dbId: session.id,
              studentEmail: session.student_email,
              scenarioId: session.scenario_id,
              status: session.status,
              messageCount: messages.length,
              exchangeCount,
              meetsMinimum: exchangeCount >= 2,
              userMessages: userMsgs,
              assistantMessages: assistantMsgs,
              created_at: session.created_at
            };
          } catch (err: any) {
            return {
              sessionId: session.session_id,
              error: err.message,
              status: session.status
            };
          }
        })
      ) : [];

      // 8. Test realtime analysis service manually on first session with enough messages
      let realtimeServiceTest: any = null;
      const testableSession = sessionMessageCounts.find(s => s.meetsMinimum && !s.error);

      if (testableSession) {
        try {
          console.log(`🧪 Testing realtime analysis on session: ${testableSession.sessionId}`);
          const { realtimeAnalysisService } = await import('./services/realtime-analysis.service.js');

          // Try to analyze manually with force
          await realtimeAnalysisService.analyzeSessionProgress(testableSession.sessionId, {
            forceSnapshot: true,
            sessionStatus: 'in_progress'
          });

          realtimeServiceTest = {
            success: true,
            testedSessionId: testableSession.sessionId,
            message: 'Analysis completed successfully - check snapshots table'
          };
        } catch (err: any) {
          realtimeServiceTest = {
            success: false,
            testedSessionId: testableSession.sessionId,
            error: err.message,
            stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
          };
        }
      } else {
        realtimeServiceTest = {
          skipped: true,
          reason: 'No session with enough messages (minimum 2 exchanges required)'
        };
      }

      return res.status(200).json({
        diagnostic: {
          tableExists,
          tableError: tableError ? { code: tableError.code, message: tableError.message } : null,
          counts: {
            totalSnapshots: totalSnapshots || 0,
            activeSnapshots: activeSnapshots || 0,
            totalRecentSessions: allRecentSessions?.length || 0
          },
          sessionsByStatus,
          statusBreakdown: Object.keys(sessionsByStatus).map(status => ({
            status,
            count: sessionsByStatus[status].length,
            firstThree: sessionsByStatus[status].slice(0, 3).map(s => ({
              sessionId: s.session_id,
              student: s.student_email,
              created: s.created_at
            }))
          })),
          scenarioIdMapping,
          recentSnapshots: recentSnapshots || [],
          sessionDetails: sessionMessageCounts,
          realtimeServiceTest,
          recommendations: [
            !tableExists && '❌ La table student_progress_snapshots n\'existe pas - exécutez la migration',
            totalSnapshots === 0 && '⚠️ Aucun snapshot n\'a été créé - vérifiez que les sessions ont au moins 2 échanges',
            activeSnapshots === 0 && totalSnapshots > 0 && '⚠️ Snapshots existent mais aucun n\'est actif (status=in_progress)',
            sessionMessageCounts.length > 0 && sessionMessageCounts.every(s => !s.meetsMinimum && !s.error) && '⚠️ Les sessions n\'ont pas assez d\'échanges (minimum 2 requis)',
            !sessionsByStatus['active'] && !sessionsByStatus['in_progress'] && '⚠️ PROBLÈME: Aucune session avec status "active" ou "in_progress" - vérifiez les statuts dans la DB',
            realtimeServiceTest?.success === false && `❌ ERREUR realtimeAnalysisService: ${realtimeServiceTest.error}`,
            realtimeServiceTest?.success && '✅ realtimeAnalysisService fonctionne correctement - snapshot créé',
            realtimeServiceTest?.skipped && `⚠️ Test ignoré: ${realtimeServiceTest.reason}`
          ].filter(Boolean),
          statusInfo: {
            expectedStatuses: ['active', 'in_progress', 'completed'],
            actualStatuses: Object.keys(sessionsByStatus),
            hasActiveSessions: !!(sessionsByStatus['active'] || sessionsByStatus['in_progress']),
            mismatch: !sessionsByStatus['active'] && !sessionsByStatus['in_progress']
          }
        },
        teacherEmail,
        timestamp: new Date().toISOString()
      });

    } catch (error: any) {
      console.error('Error running realtime diagnostic:', error);
      return res.status(500).json({
        error: 'Diagnostic failed',
        message: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  });

  // ==================== AUTO-ASSIGN ACTIVE STUDENTS TO TRAINING SESSION ====================
  app.post("/api/teacher/training-sessions/auto-assign-active-students", requireTeacher, async (req: FirebaseAuthRequest, res: Response) => {
    try {
      const teacherEmail = req.firebaseUser!.email;
      const { sessionDate } = req.body;

      // Default to today if no date provided
      const dateToUse = sessionDate || new Date().toISOString().split('T')[0];
      const startOfDay = `${dateToUse}T00:00:00Z`;
      const endOfDay = `${dateToUse}T23:59:59Z`;

      logger.info(`📋 Auto-assigning active students for teacher: ${teacherEmail} on date: ${dateToUse}`);

      const client = await unifiedDb.getClient();

      // 1. Get all active students from the specified date
      const { data: activeSessions, error: sessionsError } = await client
        .from('sessions')
        .select('student_email, scenario_id')
        .gte('start_time', startOfDay)
        .lte('start_time', endOfDay);

      if (sessionsError) {
        logger.error('Failed to fetch active sessions', { error: sessionsError });
        throw new Error(`Failed to fetch active sessions: ${sessionsError.message}`);
      }

      if (!activeSessions || activeSessions.length === 0) {
        return res.status(200).json({
          success: false,
          message: `Aucune session active trouvée pour la date ${dateToUse}`,
          studentsAssigned: 0
        });
      }

      // Get unique student emails
      const uniqueStudentEmails = [...new Set(activeSessions.map(s => s.student_email))];
      const uniqueScenarioIds = [...new Set(activeSessions.map(s => s.scenario_id))];

      logger.info(`Found ${uniqueStudentEmails.length} unique students in ${activeSessions.length} sessions`);

      // 2. Check if a training session already exists for this teacher and date
      const sessionTitle = `Session Auto ${dateToUse} - Suivi Temps Réel`;

      const { data: existingSessions, error: existingError } = await client
        .from('training_sessions')
        .select('id, title, created_by')
        .eq('created_by', teacherEmail)
        .eq('title', sessionTitle);

      let trainingSessionId: number;

      if (existingSessions && existingSessions.length > 0) {
        // Use existing session
        trainingSessionId = existingSessions[0].id;
        logger.info(`Using existing training session: ${trainingSessionId}`);
      } else {
        // 3. Create new training session
        const { data: newSession, error: createError } = await client
          .from('training_sessions')
          .insert({
            title: sessionTitle,
            description: `Session de formation automatique créée pour le suivi en temps réel des étudiants actifs le ${dateToUse}`,
            created_by: teacherEmail,
            status: 'active',
            start_date: startOfDay,
            end_date: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(), // 1 year
            created_at: new Date().toISOString()
          })
          .select()
          .single();

        if (createError || !newSession) {
          logger.error('Failed to create training session', { error: createError });
          throw new Error(`Failed to create training session: ${createError?.message}`);
        }

        trainingSessionId = newSession.id;
        logger.info(`Created new training session: ${trainingSessionId}`);

        // 4. Assign teacher as owner
        const { error: teacherError } = await client
          .from('training_session_teachers')
          .insert({
            training_session_id: trainingSessionId,
            teacher_email: teacherEmail,
            role: 'owner',
            assigned_by: teacherEmail,
            assigned_at: new Date().toISOString()
          });

        if (teacherError) {
          logger.warn('Failed to assign teacher (may already exist)', { error: teacherError });
          // Don't throw - teacher might already be assigned
        }

        // 5. Assign scenarios to training session
        if (uniqueScenarioIds.length > 0) {
          const scenarioAssignments = uniqueScenarioIds.map(scenarioId => ({
            training_session_id: trainingSessionId,
            scenario_id: scenarioId
          }));

          const { error: scenariosError } = await client
            .from('training_session_scenarios')
            .insert(scenarioAssignments);

          if (scenariosError) {
            logger.warn('Failed to assign scenarios', { error: scenariosError });
            // Don't throw - continue with student assignment
          }
        }
      }

      // 6. Assign all unique students to the training session
      const studentAssignments = uniqueStudentEmails.map(email => ({
        training_session_id: trainingSessionId,
        student_email: email,
        assigned_at: new Date().toISOString(),
        status: 'assigned'
      }));

      const { data: assignedStudents, error: assignError } = await client
        .from('training_session_students')
        .upsert(studentAssignments, {
          onConflict: 'training_session_id,student_email',
          ignoreDuplicates: false
        })
        .select();

      if (assignError) {
        logger.error('Failed to assign students', { error: assignError });
        throw new Error(`Failed to assign students: ${assignError.message}`);
      }

      logger.info(`✅ Successfully assigned ${uniqueStudentEmails.length} students to training session ${trainingSessionId}`);

      return res.status(200).json({
        success: true,
        message: `${uniqueStudentEmails.length} étudiants assignés avec succès`,
        trainingSessionId,
        studentsAssigned: uniqueStudentEmails.length,
        sessionTitle,
        students: uniqueStudentEmails,
        scenarios: uniqueScenarioIds
      });

    } catch (error: any) {
      logger.error('Auto-assign active students failed', { error: error.message });
      return res.status(500).json({
        success: false,
        error: 'Failed to auto-assign students',
        message: error.message
      });
    }
  });

  // ==================== END REALTIME TEACHER DASHBOARD ROUTES ====================

  // Update a training session
  app.put("/api/training-sessions/:id", requireFirebaseAdmin, ecosSessionRateLimit.middleware(), validateContentType(), validateRequestSize(), async (req: FirebaseAuthRequest, res: Response) => {
    try {
      // SECURITY: Admin access verified by requireFirebaseAdmin middleware
      const { id } = req.params;
      const updates = req.body;

      console.log(`🔄 Updating training session ${id} for admin: ${req.firebaseUser?.email}`);

      // Use unified database service to update training session
      const updatedSession = await unifiedDb.updateTrainingSession(id, updates, req.firebaseUser!.email);

      res.status(200).json({
        trainingSession: updatedSession,
        message: "Training session updated successfully",
        success: true
      });

    } catch (error) {
      console.error('Error updating training session:', error);
      res.status(500).json({
        error: 'Failed to update training session',
        code: 'TRAINING_SESSION_UPDATE_FAILED'
      });
    }
  });

  // Delete a training session
  app.delete("/api/training-sessions/:id", requireFirebaseAdmin, ecosSessionRateLimit.middleware(), async (req: FirebaseAuthRequest, res: Response) => {
    try {
      // SECURITY: Admin access verified by requireFirebaseAdmin middleware
      const { id } = req.params;

      console.log(`🔄 Deleting training session ${id} for admin: ${req.firebaseUser?.email}`);

      // Use unified database service to delete training session
      await unifiedDb.deleteTrainingSession(id, req.firebaseUser!.email);

      res.status(200).json({
        message: "Training session deleted successfully",
        success: true
      });

    } catch (error) {
      console.error('Error deleting training session:', error);
      res.status(500).json({
        error: 'Failed to delete training session',
        code: 'TRAINING_SESSION_DELETE_FAILED'
      });
    }
  });

  // Get all training sessions
  app.get("/api/training-sessions", requireTeacher, ecosSessionRateLimit.middleware(), async (req: FirebaseAuthRequest, res: Response) => {
    try {
      // SECURITY: Teacher access verified by requireTeacher middleware
      console.log(`🔄 Fetching training sessions for teacher: ${req.firebaseUser?.email}`);

      // Use unified database service to get real training sessions
      const trainingSessions = await unifiedDb.getTrainingSessions(req.firebaseUser!.email);

      res.status(200).json({
        trainingSessions,
        message: "Training sessions retrieved successfully",
        count: trainingSessions.length
      });

    } catch (error) {
      console.error('Error fetching training sessions:', error);
      res.status(500).json({
        error: 'Failed to fetch training sessions',
        code: 'TRAINING_SESSIONS_FETCH_FAILED'
      });
    }
  });

  // Get specific training session details
  app.get("/api/training-sessions/:id", requireTeacher, ecosSessionRateLimit.middleware(), async (req: FirebaseAuthRequest, res: Response) => {
    try {
      // SECURITY: Teacher access verified by requireTeacher middleware
      const { id } = req.params;

      console.log(`🔄 Fetching training session ${id} for teacher: ${req.firebaseUser?.email}`);

      // Use unified database service to get real training session
      const trainingSession = await unifiedDb.getTrainingSessionById(id, req.firebaseUser!.email);

      if (!trainingSession) {
        return res.status(404).json({
          error: 'Training session not found',
          code: 'TRAINING_SESSION_NOT_FOUND'
        });
      }

      res.status(200).json({
        trainingSession,
        message: "Training session details retrieved successfully"
      });

    } catch (error) {
      console.error('Error fetching training session details:', error);
      res.status(500).json({
        error: 'Failed to fetch training session details',
        code: 'TRAINING_SESSION_DETAILS_FAILED'
      });
    }
  });

  // Get all ECOS sessions for a training session (for teacher history view)
  app.get("/api/training-sessions/:id/sessions", requireTeacher, ecosSessionRateLimit.middleware(), async (req: FirebaseAuthRequest, res: Response) => {
    try {
      // SECURITY: Teacher access verified by requireTeacher middleware
      const { id } = req.params;

      console.log(`📚 Fetching all ECOS sessions for training session ${id} (teacher: ${req.firebaseUser?.email})`);

      // Use the new method to get all sessions for this training session
      const sessions = await unifiedDb.getTrainingSessionSessions(parseInt(id));

      console.log(`✅ Retrieved ${sessions.length} ECOS sessions for training session ${id}`);

      res.status(200).json({
        sessions,
        count: sessions.length,
        trainingSessionId: parseInt(id),
        message: 'Training session ECOS sessions retrieved successfully'
      });

    } catch (error: any) {
      console.error('Error fetching training session ECOS sessions:', error);
      res.status(500).json({
        error: 'Failed to fetch training session ECOS sessions',
        code: 'TRAINING_SESSION_SESSIONS_FAILED',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  });

  // Create a new training session
  app.post("/api/training-sessions", requireFirebaseAdmin, ecosSessionRateLimit.middleware(), validateContentType(), validateRequestSize(), validateCreateTrainingSession, async (req: FirebaseAuthRequest, res: Response) => {
    try {
      // SECURITY: Admin access verified by requireFirebaseAdmin middleware
      const { title, description, scenarioIds, studentEmails } = req.body;

      console.log(`🔄 Creating training session for admin: ${req.firebaseUser?.email}`);
      console.log(`📝 Session details:`, { title, description, scenarioIds, studentEmails });

      // Use unified database service to create real training session
      const newTrainingSession = await unifiedDb.createTrainingSession({
        title,
        description,
        createdBy: req.firebaseUser!.email,
        scenarioIds: scenarioIds || [],
        studentEmails: studentEmails || []
      });

      res.status(201).json({
        trainingSession: newTrainingSession,
        message: "Training session created successfully",
        success: true
      });

    } catch (error) {
      console.error('Error creating training session:', error);
      res.status(500).json({
        error: 'Failed to create training session',
        code: 'TRAINING_SESSION_CREATE_FAILED'
      });
    }
  });

  // ==================== TEACHER MANAGEMENT ====================

  // Get all teachers
  app.get("/api/teachers", ecosSessionRateLimit.middleware(), async (req: Request, res: Response) => {
    try {
      const teachers = await unifiedDb.getTeachers();

      res.status(200).json({
        teachers,
        success: true
      });
    } catch (error) {
      console.error('Error getting teachers:', error);
      res.status(500).json({
        error: 'Failed to get teachers',
        code: 'TEACHERS_FETCH_FAILED'
      });
    }
  });

  // Get teachers assigned to a training session
  app.get("/api/training-sessions/:id/teachers", ecosSessionRateLimit.middleware(), async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      const teachers = await unifiedDb.getSessionTeachers(parseInt(id));

      res.status(200).json({
        teachers,
        success: true
      });
    } catch (error) {
      console.error('Error getting session teachers:', error);
      res.status(500).json({
        error: 'Failed to get session teachers',
        code: 'SESSION_TEACHERS_FETCH_FAILED'
      });
    }
  });

  // Assign teachers to a training session
  app.post("/api/training-sessions/:id/teachers", requireFirebaseAdmin, ecosSessionRateLimit.middleware(), validateContentType(), validateRequestSize(), async (req: FirebaseAuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { teacherEmails } = req.body;

      // SECURITY: Admin access verified by requireFirebaseAdmin middleware
      // User info available in req.firebaseUser

      if (!teacherEmails || !Array.isArray(teacherEmails)) {
        return res.status(400).json({
          error: "teacherEmails array is required",
          code: "MISSING_TEACHER_EMAILS"
        });
      }

      console.log(`👥 Admin ${req.firebaseUser?.email} assigning ${teacherEmails.length} teacher(s) to session ${id}`);

      await unifiedDb.assignTeachersToSession(parseInt(id), teacherEmails);

      res.status(200).json({
        message: `${teacherEmails.length} teacher(s) assigned successfully`,
        success: true
      });
    } catch (error) {
      console.error('Error assigning teachers to session:', error);
      res.status(500).json({
        error: 'Failed to assign teachers to session',
        code: 'SESSION_TEACHERS_ASSIGN_FAILED'
      });
    }
  });

  // Remove teachers from a training session
  app.delete("/api/training-sessions/:id/teachers", requireFirebaseAdmin, ecosSessionRateLimit.middleware(), validateContentType(), validateRequestSize(), async (req: FirebaseAuthRequest, res: Response) => {
    try {
      // SECURITY: Admin access verified by requireFirebaseAdmin middleware
      const { id } = req.params;
      const { teacherEmails } = req.body;

      if (!teacherEmails || !Array.isArray(teacherEmails)) {
        return res.status(400).json({
          error: "teacherEmails array is required in request body",
          code: "MISSING_TEACHER_EMAILS"
        });
      }

      if (teacherEmails.length === 0) {
        return res.status(400).json({
          error: "teacherEmails array cannot be empty",
          code: "EMPTY_TEACHER_EMAILS"
        });
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const invalidEmails = teacherEmails.filter((email: string) => !emailRegex.test(email));

      if (invalidEmails.length > 0) {
        return res.status(400).json({
          error: "Invalid email format",
          code: "INVALID_EMAIL_FORMAT",
          invalidEmails
        });
      }

      console.log(`👥 Admin ${req.firebaseUser?.email} removing ${teacherEmails.length} teacher(s) from session ${id}`);

      await unifiedDb.removeTeachersFromSession(parseInt(id), teacherEmails);

      res.status(200).json({
        message: `${teacherEmails.length} teacher(s) removed successfully`,
        success: true
      });
    } catch (error) {
      console.error('Error removing teachers from session:', error);
      res.status(500).json({
        error: 'Failed to remove teachers from session',
        code: 'SESSION_TEACHERS_REMOVE_FAILED'
      });
    }
  });

  // ==================== TRAINING SESSIONS WITH TEACHERS & ENROLLMENT ====================

  // POST /api/training-sessions/with-teachers
  // Create a training session with multiple teachers and enrollment link
  app.post("/api/training-sessions/with-teachers",
    requireTeacher,  // Must be authenticated teacher
    validateContentType(),
    validateRequestSize(),
    async (req: FirebaseAuthRequest, res: Response) => {
      try {
        const teacherEmail = req.firebaseUser!.email;
        const { title, description, teacherEmails, scenarioIds, tokenExpiresAt } = req.body;

        // Validate required fields
        if (!title || !scenarioIds || !Array.isArray(scenarioIds) || scenarioIds.length === 0) {
          return res.status(400).json({
            error: 'Title and at least one scenario are required',
            code: 'MISSING_REQUIRED_FIELDS'
          });
        }

        // Import trainingSessionService
        const { trainingSessionService } = await import('./services/training-session.service.js');

        // Create session with enrollment link
        const session = await trainingSessionService.createTrainingSession({
          title,
          description: description || '',
          createdBy: teacherEmail,
          teacherEmails: Array.isArray(teacherEmails) ? teacherEmails : [],
          scenarioIds,
          tokenExpiresAt: tokenExpiresAt ? new Date(tokenExpiresAt) : undefined
        });

        res.status(201).json({
          success: true,
          session,
          enrollmentUrl: session.enrollmentUrl,
          enrollmentToken: session.enrollmentToken,
          message: 'Training session created successfully'
        });

      } catch (error: any) {
        console.error('❌ Failed to create training session with teachers:', {
          error: error.message,
          stack: error.stack
        });
        res.status(500).json({
          error: 'Failed to create training session',
          code: 'SESSION_CREATE_FAILED',
          message: error.message
        });
      }
    }
  );

  // GET /api/enroll/:token
  // Get training session info by enrollment token (public, no auth required)
  app.get("/api/enroll/:token", async (req: Request, res: Response) => {
    const startTime = Date.now();
    try {
      const { token } = req.params;
      console.log('✅ Enrollment link accessed:', { token, url: req.url });

      if (!token || !token.startsWith('ts_')) {
        console.warn('⚠️ Invalid enrollment token format:', { token });
        return res.status(400).json({
          error: 'Invalid enrollment token format',
          code: 'INVALID_TOKEN_FORMAT'
        });
      }

      // Import trainingSessionService
      const { trainingSessionService } = await import('./services/training-session.service.js');

      // Get session by token
      console.log('🔍 Fetching session by token:', { token });
      const session = await trainingSessionService.getSessionByToken(token);
      const duration = Date.now() - startTime;

      if (!session) {
        console.error('❌ Session not found for enrollment token:', {
          token,
          duration
        });
        return res.status(404).json({
          error: 'Invalid enrollment link',
          code: 'INVALID_TOKEN',
          message: 'No training session found with this enrollment token'
        });
      }

      console.log('✅ Enrollment link validated successfully:', {
        token,
        sessionId: session.id,
        sessionTitle: session.title,
        duration
      });

      res.status(200).json({
        success: true,
        session
      });

    } catch (error: any) {
      const duration = Date.now() - startTime;
      console.error('❌ Enrollment check failed:', {
        token: req.params.token,
        error: error.message,
        errorName: error.name,
        stack: error.stack,
        duration
      });

      if (error.message === 'ENROLLMENT_LINK_EXPIRED') {
        return res.status(410).json({
          error: 'Enrollment link has expired',
          code: 'TOKEN_EXPIRED'
        });
      }

      res.status(500).json({
        error: 'Failed to check enrollment link',
        code: 'ENROLLMENT_CHECK_FAILED',
        message: error.message
      });
    }
  });

  // POST /api/enroll/:token
  // Enroll authenticated student in training session
  app.post("/api/enroll/:token",
    verifyFirebaseToken,  // Student must be authenticated
    async (req: FirebaseAuthRequest, res: Response) => {
      try {
        const { token } = req.params;
        const studentEmail = req.firebaseUser!.email;

        if (!token || !token.startsWith('ts_')) {
          return res.status(400).json({
            error: 'Invalid enrollment token format',
            code: 'INVALID_TOKEN_FORMAT'
          });
        }

        // Import trainingSessionService
        const { trainingSessionService } = await import('./services/training-session.service.js');

        // Enroll student
        const result = await trainingSessionService.enrollStudent(token, studentEmail);

        res.status(200).json({
          success: true,
          session: result.session,
          alreadyEnrolled: result.alreadyEnrolled,
          message: result.alreadyEnrolled
            ? 'You are already enrolled in this training session'
            : 'Successfully enrolled in training session'
        });

      } catch (error: any) {
        console.error('❌ Student enrollment failed:', { error: error.message, stack: error.stack });

        if (error.message === 'INVALID_ENROLLMENT_TOKEN') {
          return res.status(404).json({
            error: 'Invalid enrollment link',
            code: 'INVALID_TOKEN'
          });
        }

        if (error.message === 'ENROLLMENT_LINK_EXPIRED') {
          return res.status(410).json({
            error: 'Enrollment link has expired',
            code: 'TOKEN_EXPIRED'
          });
        }

        res.status(500).json({
          error: 'Failed to enroll student',
          code: 'ENROLLMENT_FAILED',
          message: error.message
        });
      }
    }
  );

  // ==================== END TRAINING SESSIONS WITH TEACHERS ====================


  // ECOS Core Functionality Endpoints

  // Get ECOS sessions for a student (filtered by email)
  // 🔒 SECURED: Requires student authentication via Firebase token
  app.get("/api/ecos/sessions", requireStudent, async (req: FirebaseAuthRequest, res: Response) => {
    try {
      // SECURITY: Email retrieved from verified Firebase token (NOT from query params)
      const email = req.firebaseUser!.email;

      console.log(`📚 Fetching ECOS sessions for student: ${email}`);

      // Use the new method to get student sessions with scenario information
      const sessions = await unifiedDb.getStudentSessions(email);

      console.log(`✅ Retrieved ${sessions.length} sessions for student ${email}`);

      res.status(200).json({
        sessions,
        count: sessions.length,
        message: 'Sessions retrieved successfully'
      });
    } catch (error: any) {
      console.error('Error getting ECOS sessions:', error);
      res.status(500).json({
        error: 'Failed to get ECOS sessions',
        code: 'SESSIONS_GET_FAILED',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  });

  // Start a new ECOS session
  // 🔒 SECURED: Requires student authentication via Firebase token
  app.post("/api/ecos/sessions", requireStudent, ecosSessionRateLimit.middleware(), validateContentType(), validateRequestSize(), validateCreateEcosSession, async (req: FirebaseAuthRequest, res: Response) => {
    try {
      // SECURITY: Email retrieved from verified Firebase token (NOT from body)
      const studentEmail = req.firebaseUser!.email;
      const { scenarioId } = req.validatedBody || req.body;
      
      if (!scenarioId) {
        return res.status(400).json({ 
          error: "scenarioId is required",
          code: "MISSING_REQUIRED_FIELDS"
        });
      }
      
      console.log(`🔧 Creating session for student: ${studentEmail}, scenario: ${scenarioId}`);


      // Generate session ID that includes scenario ID for easy retrieval
      const sessionId = `session_${scenarioId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Store session in database using UnifiedDatabaseService
      try {
        const sessionData = await unifiedDb.createSession({
          sessionId,
          studentEmail,
          scenarioId: parseInt(scenarioId),
          status: 'active'
        });

        console.log('✅ Created and stored ECOS session:', sessionId, 'in database');
      } catch (dbError: any) {
        console.error('❌ Failed to store session in database:', dbError.message);
        // Continue with response even if DB storage fails
        console.warn('⚠️ Session created in memory only due to database error');
      }

      res.status(201).json({
        sessionId,
        scenarioId: parseInt(scenarioId),
        studentEmail,
        status: 'active',
        startTime: new Date(),
        message: 'ECOS session created successfully'
      });
    } catch (error) {
      console.error('Error creating ECOS session:', error);
      res.status(500).json({
        error: 'Failed to create ECOS session',
        code: 'SESSION_CREATE_FAILED'
      });
    }
  });

  // Get ECOS session details
  // 🔒 SECURED: Requires student authentication via Firebase token
  app.get("/api/ecos/sessions/:sessionId", requireStudent, async (req: FirebaseAuthRequest, res: Response) => {
    try {
      const { sessionId } = req.params;
      // SECURITY: Email retrieved from verified Firebase token (NOT from query params)
      const email = req.firebaseUser!.email;

      // Try to get session from database and fetch actual scenario data
      try {
        // Extract scenario ID from session ID (format: session_SCENARIOID_timestamp_random)
        let scenarioId = null;
        if (sessionId.startsWith('session_')) {
          const parts = sessionId.split('_');
          if (parts.length >= 2 && !isNaN(parseInt(parts[1]))) {
            scenarioId = parseInt(parts[1]);
          }
        }
        
        if (!scenarioId) {
          return res.status(400).json({
            error: 'Invalid session ID format - cannot extract scenario ID',
            code: 'INVALID_SESSION_ID'
          });
        }
        
        // Get actual scenario data from database
        const scenarios = await unifiedDb.getScenarios();
        const scenario = scenarios.find(s => s.id === scenarioId);
        
        if (!scenario) {
          return res.status(404).json({
            error: `Scenario ${scenarioId} not found in database`,
            code: 'SCENARIO_NOT_FOUND'
          });
        }

        // Clean and normalize evaluation criteria format
        const cleanEvaluationCriteria = (criteria: any) => {
          if (!criteria) return null;
          
          // If criteria has both generatedText and evaluation_criteria, use only evaluation_criteria
          if (criteria.evaluation_criteria && Array.isArray(criteria.evaluation_criteria)) {
            console.log('✅ Using clean evaluation_criteria array format');
            return criteria.evaluation_criteria;
          }
          
          // If criteria is already a clean array or object, return as is
          if (Array.isArray(criteria) || (typeof criteria === 'object' && !criteria.generatedText)) {
            console.log('✅ Using existing clean criteria format');
            return criteria;
          }
          
          // If only generatedText exists, try to extract the proper format
          if (criteria.generatedText && typeof criteria.generatedText === 'string') {
            try {
              console.log('🔄 Parsing generatedText to extract evaluation criteria');
              const parsed = JSON.parse(criteria.generatedText.replace(/```json\n?|\n?```/g, ''));
              return parsed.evaluation_criteria || parsed;
            } catch (e) {
              console.warn('❌ Failed to parse generatedText criteria, using original format');
              return criteria;
            }
          }
          
          return criteria;
        };

        // Return session with actual scenario data
        return res.status(200).json({
          session: {
            id: sessionId,
            status: 'active',
            startTime: new Date(),
            studentEmail: email,
            scenario: {
              id: scenario.id,
              title: scenario.title,
              description: scenario.description,
              patient_prompt: scenario.patient_prompt,
              voice_type: scenario.voice_type,
              evaluation_criteria: cleanEvaluationCriteria(scenario.evaluation_criteria)
            }
          },
          messages: [],
          totalMessages: 0,
          note: 'Session with complete scenario data from database'
        });

        // This code was moved above and is no longer needed here
      } catch (dbError) {
        console.error('❌ Database error retrieving scenario:', dbError);
        return res.status(500).json({
          error: 'Database error - unable to retrieve scenario data',
          code: 'DATABASE_ERROR',
          details: process.env.NODE_ENV === 'development' ? dbError.message : 'Internal server error'
        });
      }
    } catch (error) {
      console.error('Error getting ECOS session:', error);
      res.status(500).json({
        error: 'Failed to get ECOS session',
        code: 'SESSION_GET_FAILED'
      });
    }
  });

  // Update ECOS session (end session)
  // 🔒 SECURED: Requires student authentication via Firebase token
  app.put("/api/ecos/sessions/:sessionId", requireStudent, validateContentType(), validateRequestSize(), async (req: FirebaseAuthRequest, res: Response) => {
    try {
      const { sessionId } = req.params;
      const { status } = req.body;
      // SECURITY: Email retrieved from verified Firebase token (NOT from body)
      const email = req.firebaseUser!.email;

      if (!status) {
        return res.status(400).json({ 
          error: "Status is required",
          code: "MISSING_STATUS"
        });
      }

      console.log(`📝 Updating session ${sessionId} status to ${status} for ${email}`);

      // Update session status in database
      try {
        await unifiedDb.updateSessionStatus(sessionId, status);
        console.log(`✅ Session ${sessionId} marked as ${status} in database`);
      } catch (dbError: any) {
        console.warn('⚠️ Failed to update session status in database:', dbError.message);
        // Continue anyway - frontend shows status locally
      }

      res.status(200).json({
        sessionId,
        status,
        updatedAt: new Date(),
        message: 'Session updated successfully'
      });
    } catch (error) {
      console.error('Error updating ECOS session:', error);
      res.status(500).json({
        error: 'Failed to update ECOS session',
        code: 'SESSION_UPDATE_FAILED'
      });
    }
  });

  // Add message to ECOS session (Chat functionality)
  // 🔒 SECURED: Requires student authentication via Firebase token
  app.post("/api/ecos/sessions/:sessionId/messages", requireStudent, apiRateLimit.middleware(), validateContentType(), validateRequestSize(), validateEcosMessage, async (req: FirebaseAuthRequest, res: Response) => {
    try {
      const { sessionId } = req.params;
      // SECURITY: Email retrieved from verified Firebase token (NOT from query)
      const email = req.firebaseUser!.email;
      const { message, role, type } = req.body;

      const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Store user message in database
      try {
        await unifiedDb.storeSessionMessage({
          sessionId,
          role: role || 'user',
          question: message,
          response: '',
          content: message
        });
        console.log('✅ Stored user message in database for session:', sessionId);
      } catch (dbError: any) {
        console.warn('⚠️ Failed to store user message:', dbError.message);
      }

      // Generate AI response (placeholder for now)
      const aiResponseContent = `I understand your message: "${message}". How can I assist you further in this medical scenario?`;

      const aiResponse = {
        id: `msg_ai_${Date.now()}`,
        sessionId,
        content: aiResponseContent,
        role: 'assistant',
        type: 'text',
        senderEmail: 'system@ecos.ai',
        createdAt: new Date()
      };

      // Store AI response in database
      try {
        await unifiedDb.storeSessionMessage({
          sessionId,
          role: 'assistant',
          question: '',
          response: aiResponseContent,
          content: aiResponseContent
        });
        console.log('✅ Stored AI response in database for session:', sessionId);
      } catch (dbError: any) {
        console.warn('⚠️ Failed to store AI response:', dbError.message);
      }

      // CRITICAL: Analyze session progress for real-time monitoring after messages are added
      try {
        const { realtimeAnalysisService } = await import('./services/realtime-analysis.service.js');
        await realtimeAnalysisService.analyzeSessionProgress(sessionId, {
          sessionStatus: 'in_progress'
        });
        console.log('✅ Real-time analysis triggered for session:', sessionId);
      } catch (analysisError: any) {
        console.warn('⚠️ Real-time analysis failed (non-blocking):', analysisError.message);
        // Don't fail the request if analysis fails - it's a monitoring feature
      }

      res.status(201).json({
        userMessage: {
          id: messageId,
          sessionId,
          content: message,
          role: role || 'user',
          type: type || 'text',
          senderEmail: email,
          createdAt: new Date()
        },
        aiResponse,
        message: 'Message added to session successfully'
      });
    } catch (error) {
      console.error('Error adding message to ECOS session:', error);
      res.status(500).json({
        error: 'Failed to add message to session',
        code: 'MESSAGE_ADD_FAILED'
      });
    }
  });

  const slugifyId = (value: string, fallback: string) => {
    if (!value) return fallback;
    return value.toString().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '') || fallback;
  };

  const normalizeText = (value: string) => {
    return value
      ? value
          .toString()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase()
      : '';
  };

  /**
   * Extract relevant message excerpts to justify evaluation scores
   * Instead of keyword matching, we sample representative messages from the conversation
   */
  const extractRelevantExcerpts = (messages: any[], maxExcerpts: number = 3) => {
    if (!Array.isArray(messages) || messages.length === 0) {
      return [];
    }

    // Sample messages from different parts of the conversation
    // to give a representative view: beginning, middle, end
    const excerpts: any[] = [];
    const totalMessages = messages.length;

    if (totalMessages <= maxExcerpts) {
      // If few messages, return all
      excerpts.push(...messages);
    } else {
      // Sample from beginning, middle, and end
      const indices = [
        0, // First exchange
        Math.floor(totalMessages / 2), // Middle
        totalMessages - 1 // Last exchange
      ].slice(0, maxExcerpts);

      indices.forEach(index => {
        if (messages[index]) {
          excerpts.push(messages[index]);
        }
      });
    }

    return excerpts.map((msg: any) => {
      // Determine content and role based on which field has data
      let excerpt = '';
      let role = '';

      if (msg.role === 'user') {
        excerpt = (msg.question || msg.content || '').toString().slice(0, 220);
        role = 'Étudiant';
      } else if (msg.role === 'assistant') {
        excerpt = (msg.response || msg.content || '').toString().slice(0, 220);
        role = 'Patient';
      } else {
        // Fallback for unexpected roles
        excerpt = (msg.question || msg.response || msg.content || '').toString().slice(0, 220);
        role = msg.role === 'user' ? 'Étudiant' : 'Patient';
      }

      return {
        role,
        rawRole: msg.role,
        excerpt,
        timestamp: msg.timestamp || msg.created_at || msg.updated_at || null
      };
    });
  };

  // Evaluate ECOS session performance (ASYNC)
  // 🔒 SECURED: Requires student authentication via Firebase token
  app.post("/api/ecos/sessions/:sessionId/evaluate", requireStudent, ecosEvaluationRateLimit.middleware(), validateContentType(), validateRequestSize(), validateEcosEvaluation, async (req: FirebaseAuthRequest, res: Response) => {
    try {
      const { sessionId } = req.params;
      // SECURITY: Email retrieved from verified Firebase token (NOT from query)
      const email = req.firebaseUser!.email;
      const { evaluationJobService } = await import('./services/evaluation-job.service.js');

      // Create asynchronous evaluation job
      const job = evaluationJobService.createJob({
        sessionId,
        email: email as string
      });

      console.log(`🚀 Created async evaluation job ${job.jobId} for session ${sessionId}`);

      // Return immediately with job ID
      return res.status(202).json({
        jobId: job.jobId,
        sessionId,
        status: job.status,
        message: 'Evaluation started in background',
        statusUrl: `/api/ecos/sessions/${sessionId}/evaluation/status`
      });
    } catch (error) {
      console.error('Error creating evaluation job:', error);
      return res.status(500).json({
        error: 'Failed to start evaluation',
        code: 'EVALUATION_START_FAILED'
      });
    }
  });

  // OLD SYNCHRONOUS ENDPOINT (kept temporarily for backward compatibility)
  // 🔒 SECURED: Requires student authentication via Firebase token
  app.post("/api/ecos/sessions/:sessionId/evaluate-sync", requireStudent, ecosEvaluationRateLimit.middleware(), validateContentType(), validateRequestSize(), validateEcosEvaluation, async (req: FirebaseAuthRequest, res: Response) => {
    try {
      const { sessionId } = req.params;
      // SECURITY: Email retrieved from verified Firebase token (NOT from query)
      const email = req.firebaseUser!.email;
      const { criteria, responses } = req.body;

      // Extract scenarioId from sessionId
      const scenarioIdMatch = sessionId.match(/^session_(\d+)_/);
      const scenarioId = scenarioIdMatch ? parseInt(scenarioIdMatch[1]) : null;

      // Load scenario to get evaluation_criteria from DB
      const scenarios = await unifiedDb.getScenarios();
      const scenario = scenarioId ? scenarios.find(s => s.id === scenarioId) : null;
      console.log('🔍 [TRACE] Loaded scenario:', scenario?.id, scenario?.title);
      console.log('🔍 [TRACE] Scenario has evaluation_criteria?', !!scenario?.evaluation_criteria);
      const dbCriteria = scenario?.evaluation_criteria || null;

      // Fetch conversation history using the correct method
      const messages = await unifiedDb.getSessionMessages(sessionId, 50);

      if (!messages || messages.length === 0) {
        return res.status(400).json({
          error: "Pas assez d'échanges pour une évaluation - la session était vide",
          code: 'INSUFFICIENT_CONTENT',
          sessionId: sessionId,
          messagesFound: messages?.length || 0
        });
      }

      // Build transcript from messages
      const transcript = messages.map((msg: any, idx: number) => {
        // Determine content and role based on which field has data
        // Messages with role='user' have content in 'question', messages with role='assistant' have content in 'response'
        let content = '';
        let role = '';

        if (msg.role === 'user') {
          content = msg.question || msg.content || '';
          role = 'Étudiant';
        } else if (msg.role === 'assistant') {
          content = msg.response || msg.content || '';
          role = 'Patient';
        } else {
          // Fallback for unexpected roles (should not happen with .neq('role', 'system') filter)
          content = msg.question || msg.response || msg.content || '';
          role = msg.role === 'user' ? 'Étudiant' : 'Patient';
          console.warn(`⚠️ Unexpected role '${msg.role}' in message #${idx}, using fallback logic`);
        }

        return `${role}: ${content.toString().trim()}`;
      }).join('\n---\n');

      console.log(`📊 Building evaluation from ${messages.length} messages for session ${sessionId}`);
      console.log(`📝 Transcript preview:`, transcript.substring(0, 200) + '...');

      // Normalize criteria from DB
      const normalizeCriteria = (raw: any) => {
        try {
          if (!raw) return [] as any[];

          // Handle nested structure: { evaluation_criteria: [...] }
          if (raw.evaluation_criteria && Array.isArray(raw.evaluation_criteria)) {
            return raw.evaluation_criteria.map((c: any, i: number) => ({
              id: (c.id || c.key || c.name || c.label || `crit_${i}`).toString().toLowerCase().replace(/\s+/g,'_'),
              name: c.name || c.label || c.id || `Critère ${i+1}`,
              description: c.description || '',
              maxScore: typeof c.maxScore === 'number' ? c.maxScore : 4,
              weight: typeof c.weight === 'number' ? c.weight : (typeof c.poids === 'number' ? c.poids : null),
              indicators: Array.isArray(c.indicators) ? c.indicators.map((ind: any) => ind.description || ind.name || ind).filter(Boolean) :
                          Array.isArray(c.elements) ? c.elements.map((el: any) => typeof el === 'string' ? el : el.description || el.name || '').filter(Boolean) :
                          c.description ? [c.description] : []
            }));
          }

          if (Array.isArray(raw)) {
            return raw.map((c: any, i: number) => ({
              id: (c.id || c.key || c.name || c.label || `crit_${i}`).toString().toLowerCase().replace(/\s+/g,'_'),
              name: c.name || c.label || c.id || `Critère ${i+1}`,
              description: c.description || '',
              maxScore: typeof c.maxScore === 'number' ? c.maxScore : 4,
              weight: typeof c.weight === 'number' ? c.weight : (typeof c.poids === 'number' ? c.poids : null),
              indicators: Array.isArray(c.indicators) ? c.indicators.map((ind: any) => ind.description || ind.name || ind).filter(Boolean) :
                          Array.isArray(c.elements) ? c.elements.map((el: any) => typeof el === 'string' ? el : el.description || el.name || '').filter(Boolean) :
                          c.description ? [c.description] : []
            }));
          }
          if (raw.categories && Array.isArray(raw.categories)) {
            return raw.categories.map((category: any, i: number) => {
              const baseId = (category.id || category.name || `category_${i}`).toString().toLowerCase().replace(/\s+/g, '_');
              const indicators = Array.isArray(category.indicators)
                ? category.indicators.map((ind: any) => ind.description || ind.name || '').filter(Boolean)
                : [];

              return {
                id: baseId,
                name: category.name || category.id || `Catégorie ${i + 1}`,
                description: indicators.length ? indicators.join(' ; ') : (category.description || ''),
                maxScore: typeof category.maxScore === 'number' ? category.maxScore : 4,
                weight: typeof category.weight === 'number' ? category.weight : (typeof category.poids === 'number' ? category.poids : null),
                indicators
              };
            });
          }
          if (raw.criteria && Array.isArray(raw.criteria)) {
            return raw.criteria.map((c: any, i: number) => ({
              id: (c.id || c.key || c.name || c.label || `crit_${i}`).toString().toLowerCase().replace(/\s+/g,'_'),
              name: c.name || c.label || c.id || `Critère ${i+1}`,
              description: c.description || '',
              maxScore: typeof c.maxScore === 'number' ? c.maxScore : 4,
              weight: typeof c.weight === 'number' ? c.weight : (typeof c.poids === 'number' ? c.poids : null),
              indicators: Array.isArray(c.indicators) ? c.indicators.map((ind: any) => ind.description || ind.name || ind).filter(Boolean) :
                          Array.isArray(c.elements) ? c.elements.map((el: any) => typeof el === 'string' ? el : el.description || el.name || '').filter(Boolean) :
                          c.description ? [c.description] : []
            }));
          }
          if (typeof raw === 'object') {
            return Object.keys(raw).map((k, i) => {
              const value = raw[k];

              // Support both French (elements/poids) and English (indicators/weight) property names
              const indicators = Array.isArray(value?.indicators)
                ? value.indicators.map((ind: any) => ind.description || ind.name || ind).filter(Boolean)
                : Array.isArray(value?.elements)
                ? value.elements.map((el: any) => typeof el === 'string' ? el : el.description || el.name || '').filter(Boolean)
                : [];

              const weight = typeof value?.weight === 'number'
                ? value.weight
                : typeof value?.poids === 'number'
                ? value.poids
                : null;

              return {
                id: k.toLowerCase().replace(/\s+/g, '_'),
                name: k.charAt(0).toUpperCase() + k.slice(1).replace(/_/g, ' '),
                description: typeof value === 'string' ? value : (value?.description || ''),
                maxScore: 4,
                weight,
                indicators
              };
            });
          }
          return [] as any[];
        } catch {
          return [] as any[];
        }
      };

      // DIAGNOSTIC LOGGING - START
      console.log('🔍 [TRACE] dbCriteria type:', typeof dbCriteria);
      console.log('🔍 [TRACE] dbCriteria is null?', dbCriteria === null);
      console.log('🔍 [TRACE] dbCriteria is array?', Array.isArray(dbCriteria));
      if (dbCriteria && typeof dbCriteria === 'object') {
        console.log('🔍 [TRACE] dbCriteria keys:', Object.keys(dbCriteria));
        console.log('🔍 [TRACE] dbCriteria sample:', JSON.stringify(dbCriteria).substring(0, 500));
      } else {
        console.log('🔍 [TRACE] dbCriteria value:', dbCriteria);
      }
      // DIAGNOSTIC LOGGING - END

      const criteriaList = normalizeCriteria(dbCriteria);

      // DIAGNOSTIC LOGGING - START
      console.log('🔍 [TRACE] criteriaList length:', criteriaList.length);
      if (criteriaList.length > 0) {
        console.log('🔍 [TRACE] First criterion:', JSON.stringify(criteriaList[0], null, 2));
        console.log('🔍 [TRACE] First criterion indicators:', criteriaList[0].indicators);
      } else {
        console.log('🔍 [TRACE] criteriaList is EMPTY - will use fallback');
      }
      // DIAGNOSTIC LOGGING - END

      const fallbackCriteria = [
        { id: 'communication', name: 'Communication', maxScore: 4 },
        { id: 'clinical_reasoning', name: 'Raisonnement Clinique', maxScore: 4 },
        { id: 'empathy', name: 'Empathie', maxScore: 4 },
        { id: 'professionalism', name: 'Professionnalisme', maxScore: 4 }
      ];
      const usedCriteria = criteriaList.length > 0 ? criteriaList : fallbackCriteria;

      // DIAGNOSTIC LOGGING - START
      console.log('🔍 [TRACE] Using criteriaList or fallback?', criteriaList.length > 0 ? 'criteriaList' : 'FALLBACK');
      console.log('🔍 [TRACE] usedCriteria length:', usedCriteria.length);
      console.log('🔍 [TRACE] usedCriteria[0]:', JSON.stringify(usedCriteria[0], null, 2));
      // DIAGNOSTIC LOGGING - END

      // Build LLM prompt enforcing JSON output
      const systemPrompt = `Tu es un examinateur ECOS. Évalue la performance de l'étudiant en te basant UNIQUEMENT sur la transcription fournie.

Consignes :
- Pour CHAQUE critère, vérifie si l'étudiant a abordé les indicateurs spécifiques listés
- Attribue une note entière de 0 à 4 basée sur la couverture des indicateurs :
  * 0 = aucun indicateur traité
  * 1 = abordé superficiellement (< 25% des indicateurs)
  * 2 = partiellement traité (25-50% des indicateurs)
  * 3 = bien traité (50-75% des indicateurs)
  * 4 = maîtrisé (> 75% des indicateurs avec qualité)
- Pour chaque critère, identifie 2-3 points forts, 2-3 points faibles, 2-3 actions d'amélioration
- Pour chaque critère, sélectionne 2-3 extraits PRÉCIS de la transcription qui illustrent les points faibles ou les points forts identifiés
- Les extraits doivent être des citations EXACTES de la transcription (pas de paraphrase)
- Chaque extrait doit clairement démontrer pourquoi le critère a reçu ce score
- Justifie chaque note en citant des exemples précis de la transcription
- Fournis une synthèse globale avec forces majeures, faiblesses prioritaires, recommandations actionnables

IMPORTANT: Base-toi sur les indicateurs spécifiques fournis pour chaque critère. Ne te contente pas de notions génériques.

Réponds UNIQUEMENT en JSON valide sans texte avant/après.

Format JSON attendu :
{
  "criteria": [
    {
      "id": "crit_id",
      "name": "Nom du critère",
      "score": number,
      "maxScore": 4,
      "strengths": ["point fort 1 avec référence à la transcription", "point fort 2", ...],
      "weaknesses": ["faiblesse 1 avec exemple", "faiblesse 2", ...],
      "actions": ["recommandation 1 actionnable", "recommandation 2", ...],
      "justification": "Justification détaillée citant des passages de la transcription",
      "evidence": [
        {"role": "Étudiant" ou "Patient", "excerpt": "extrait exact de la transcription qui illustre une faiblesse ou un point fort"},
        {"role": "Étudiant" ou "Patient", "excerpt": "autre extrait pertinent pour ce critère"},
        ...
      ]
    }
  ],
  "overall": {
    "strengths": ["force majeure 1", "force majeure 2", ...],
    "weaknesses": ["faiblesse prioritaire 1", "faiblesse prioritaire 2", ...],
    "recommendations": ["recommandation 1", "recommandation 2", "recommandation 3"],
    "summary": "Synthèse en 2-3 phrases résumant la performance globale"
  },
  "overall_score_percent": number
}`;

      const rubricText = usedCriteria.map(c => {
        const indicatorsList = c.indicators && c.indicators.length > 0
          ? `\n  Indicateurs à évaluer:\n${c.indicators.map(ind => `  * ${ind}`).join('\n')}`
          : '';
        const weight = c.weight ? ` (pondération: ${c.weight}%)` : '';
        return `- ${c.name} (id: ${c.id})${weight} — max ${c.maxScore}${indicatorsList}`;
      }).join('\n\n');
      const userPrompt = `Scénario: ${scenario?.title || 'Inconnu'}\n\nCritères d'évaluation:\n${rubricText}\n\nTranscription de la session:\n${transcript}`;

      let llmJson: any = null;
      try {
        const completion = await openaiService.createCompletion({
          model: "gpt-4o",
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: 0.3,
          max_completion_tokens: 2000,
          response_format: { type: "json_object" }
        });
        const content = completion.choices?.[0]?.message?.content || '{}';
        // Strip markdown code blocks that OpenAI sometimes adds despite instructions
        const cleanedContent = content.replace(/```json\s*\n?|```\s*$/g, '').trim();
        llmJson = JSON.parse(cleanedContent);
      } catch (err) {
        console.warn('⚠️ LLM evaluation parsing failed, using heuristic fallback. Error:', (err as Error).message);
      }

      // Map LLM output to evaluation structure
      const evaluationId = `eval_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const criteriaResults = (llmJson?.criteria && Array.isArray(llmJson.criteria))
        ? llmJson.criteria
        : [];

      const clamp = (n: any) => Math.max(0, Math.min(4, Math.round(Number(n) || 0)));
      const toArray = (value: any): string[] => {
        if (!value) return [];
        if (Array.isArray(value)) return value.map((entry: any) => (entry ?? '').toString()).filter((entry: string) => entry.trim().length > 0);
        return [value.toString()].filter(Boolean);
      };

      // Extract representative message excerpts as evidence
      const conversationExcerpts = extractRelevantExcerpts(messages, 3);

      const weightValues = usedCriteria.map((criterion: any) => {
        const weight = Number(criterion.weight);
        return Number.isFinite(weight) && weight > 0 ? weight : 1;
      });
      const weightSum = weightValues.reduce((sum: number, w: number) => sum + w, 0) || usedCriteria.length;

      const combinedCriteria = usedCriteria.map((criterion: any, index: number) => {
        const criterionId = criterion.id;
        const llmMatch = criteriaResults.find((entry: any) => {
          const entryId = (entry.id || '').toString().toLowerCase();
          const entryName = (entry.name || '').toString().toLowerCase();
          return entryId === criterionId || entryName === criterion.name.toLowerCase();
        }) || null;

        const llmScore = clamp(llmMatch?.score ?? llmMatch?.note ?? 2);
        const maxScore = typeof llmMatch?.maxScore === 'number' ? llmMatch.maxScore : 4;

        // Use LLM score directly without heuristic limitation
        const finalScore = llmScore;

        return {
          id: criterionId,
          name: criterion.name,
          description: criterion.description || '',
          indicators: criterion.indicators || [],
          weight: Math.round((weightValues[index] / weightSum) * 10000) / 100, // pourcentage arrondi à 2 décimales
          rawWeight: weightValues[index],
          maxScore,
          score: finalScore,
          rawScore: llmScore,
          strengths: toArray(llmMatch?.strengths),
          weaknesses: toArray(llmMatch?.weaknesses),
          actions: toArray(llmMatch?.actions || llmMatch?.recommendations),
          justification: (llmMatch?.justification || '').toString(),
          // Use LLM-provided evidence if available, otherwise fallback to generic excerpts
          evidence: Array.isArray(llmMatch?.evidence) && llmMatch.evidence.length > 0
            ? llmMatch.evidence.map((ev: any) => ({
                role: ev.role || 'Étudiant',
                rawRole: ev.role === 'Patient' ? 'assistant' : 'user',
                excerpt: (ev.excerpt || '').toString().slice(0, 220),
                timestamp: null
              }))
            : conversationExcerpts
        };
      });

      const weightedTotal = combinedCriteria.reduce((sum: number, criterion: any) => {
        return sum + ((criterion.score / criterion.maxScore) * (criterion.rawWeight || 1));
      }, 0);
      const weightedPercent = Math.round((weightedTotal / weightSum) * 100);

      const llmOverallPercent = typeof llmJson?.overall_score_percent === 'number'
        ? Math.round(llmJson.overall_score_percent)
        : null;

      // Use LLM score or calculated weighted score (no heuristic limitation)
      const overallScorePercent = llmOverallPercent ?? weightedPercent;

      const uniqueList = (list: string[], limit = 3) => {
        const seen = new Set<string>();
        const result: string[] = [];
        for (const item of list) {
          const trimmed = item.trim();
          if (!trimmed || seen.has(trimmed)) continue;
          seen.add(trimmed);
          result.push(trimmed);
          if (result.length >= limit) break;
        }
        return result;
      };

      const overallSection = llmJson?.overall || {};
      const aggregatedStrengths = uniqueList([
        ...toArray(overallSection.strengths || llmJson?.strengths),
        ...combinedCriteria.flatMap((criterion: any) => criterion.strengths)
      ]);
      const aggregatedWeaknesses = uniqueList([
        ...toArray(overallSection.weaknesses || llmJson?.weaknesses),
        ...combinedCriteria.flatMap((criterion: any) => criterion.weaknesses)
      ]);
      const aggregatedRecommendations = uniqueList([
        ...toArray(overallSection.recommendations || llmJson?.recommendations),
        ...combinedCriteria.flatMap((criterion: any) => criterion.actions)
      ]);

      // Add default feedback if LLM didn't provide any
      if (aggregatedStrengths.length === 0) {
        if (overallScorePercent >= 75) {
          aggregatedStrengths.push('Performance globalement très satisfaisante');
          aggregatedStrengths.push('Bonne maîtrise des compétences évaluées');
        } else if (overallScorePercent >= 50) {
          aggregatedStrengths.push('Performance satisfaisante dans l\'ensemble');
          aggregatedStrengths.push('Plusieurs compétences correctement démontrées');
        } else {
          aggregatedStrengths.push('Certaines compétences de base démontrées');
        }
      }

      if (aggregatedWeaknesses.length === 0) {
        if (overallScorePercent < 50) {
          aggregatedWeaknesses.push('Plusieurs compétences nécessitent un renforcement significatif');
          aggregatedWeaknesses.push('Difficulté à démontrer la maîtrise des critères évalués');
        } else if (overallScorePercent < 75) {
          aggregatedWeaknesses.push('Certains aspects nécessitent amélioration');
          aggregatedWeaknesses.push('Marge de progression sur plusieurs critères');
        } else {
          aggregatedWeaknesses.push('Quelques détails à peaufiner pour une maîtrise complète');
        }
      }

      if (aggregatedRecommendations.length === 0) {
        if (overallScorePercent < 50) {
          aggregatedRecommendations.push('Revoir les fondamentaux de chaque critère évalué');
          aggregatedRecommendations.push('Pratiquer davantage les compétences cliniques de base');
          aggregatedRecommendations.push('Solliciter un accompagnement pédagogique pour progresser');
        } else if (overallScorePercent < 75) {
          aggregatedRecommendations.push('Approfondir les compétences sur les critères les moins maîtrisés');
          aggregatedRecommendations.push('Pratiquer régulièrement pour consolider les acquis');
          aggregatedRecommendations.push('Analyser les situations cliniques avec plus de rigueur');
        } else {
          aggregatedRecommendations.push('Continuer à pratiquer pour maintenir le niveau de compétence');
          aggregatedRecommendations.push('Affiner les détails pour viser l\'excellence');
        }
      }
      const summaryText = (overallSection.summary || overallSection.comment || llmJson?.summary || '').toString();

      const evaluation = {
        overall_score: overallScorePercent,
        criteria_scores: combinedCriteria.reduce((acc: any, c: any) => { acc[c.id] = Math.round((c.score / c.maxScore) * 100); return acc; }, {}),
        scores: combinedCriteria.reduce((acc: any, c: any) => { acc[c.id] = c.score; return acc; }, {}),
        criteria: combinedCriteria,
        feedback: aggregatedStrengths,
        recommendations: aggregatedRecommendations,
        weaknesses: aggregatedWeaknesses,
        summary: summaryText,
        llmScorePercent: llmOverallPercent ?? weightedPercent,
        weightedScorePercent: weightedPercent
      };

      // Store evaluation in database
      try {
        await unifiedDb.createEvaluation({
          sessionId,
          scenarioId: scenarioId!,
          studentEmail: email as string,
          scores: evaluation.scores,
          globalScore: overallScorePercent,
          strengths: Array.isArray(evaluation.feedback) ? evaluation.feedback : [],
          weaknesses: Array.isArray(evaluation.weaknesses) ? evaluation.weaknesses : [],
          recommendations: Array.isArray(evaluation.recommendations) ? evaluation.recommendations : [],
          feedback: `Évaluation automatique - Score IA: ${overallScorePercent}%`,
          llmScorePercent: evaluation.llmScorePercent,
          criteriaDetails: evaluation.criteria
        });
        console.log(`✅ Stored evaluation for session ${sessionId} in database`);

        // Finalize session for real-time dashboard (mark as completed)
        try {
          const { realtimeAnalysisService } = await import('./services/realtime-analysis.service.js');
          await realtimeAnalysisService.finalizeSession(sessionId);
          console.log(`📊 Session ${sessionId} finalized for real-time dashboard`);
        } catch (finalizeError) {
          console.warn('⚠️ Failed to finalize session for dashboard (non-critical):', finalizeError);
        }
      } catch (dbError: any) {
        console.error(`❌ Failed to store evaluation in database:`, {
          message: dbError?.message,
          code: dbError?.code,
          details: dbError?.details,
          hint: dbError?.hint,
          sessionId,
          studentEmail: email
        });

        // Return error to frontend - evaluation computed but not persisted
        return res.status(500).json({
          error: 'Failed to store evaluation in database',
          code: 'EVALUATION_STORAGE_FAILED',
          details: process.env.NODE_ENV === 'development' ? dbError?.message : undefined,
          evaluation: evaluation  // Still return the computed evaluation
        });
      }

      res.status(200).json({
        evaluationId,
        sessionId,
        evaluation,
        message: 'Session evaluated and stored successfully'
      });
    } catch (error) {
      console.error('Error evaluating ECOS session:', error);
      res.status(500).json({
        error: 'Failed to evaluate session',
        code: 'EVALUATION_FAILED'
      });
    }
  });

  // Get evaluation job status
  // 🔒 SECURED: Requires student authentication via Firebase token
  app.get("/api/ecos/sessions/:sessionId/evaluation/status", requireStudent, async (req: FirebaseAuthRequest, res: Response) => {
    try {
      const { sessionId } = req.params;
      // SECURITY: Email retrieved from verified Firebase token (NOT from query)
      const email = req.firebaseUser!.email;
      const { evaluationJobService } = await import('./services/evaluation-job.service.js');

      // Get job by session ID
      const job = evaluationJobService.getJobBySessionId(sessionId);

      if (!job) {
        // No job found - check if evaluation already exists in database
        const existingEvaluation = await unifiedDb.getEvaluation(sessionId);
        if (existingEvaluation) {
          // Evaluation already exists (probably from old sync endpoint)
          return res.status(200).json({
            status: 'completed',
            sessionId,
            message: 'Evaluation already exists',
            result: {
              evaluationId: existingEvaluation.id,
              sessionId,
              evaluation: {
                overall_score: existingEvaluation.global_score,
                criteria_scores: existingEvaluation.scores || {},
                scores: existingEvaluation.scores || {},
                criteria: existingEvaluation.criteria_details || [],
                feedback: existingEvaluation.strengths || [],
                recommendations: existingEvaluation.recommendations || [],
                weaknesses: existingEvaluation.weaknesses || [],
                summary: existingEvaluation.feedback || '',
                llmScorePercent: existingEvaluation.llm_score_percent,
                weightedScorePercent: existingEvaluation.global_score
              }
            }
          });
        }

        return res.status(404).json({
          error: 'Evaluation job not found',
          code: 'JOB_NOT_FOUND',
          sessionId
        });
      }

      // Return job status
      const response: any = {
        jobId: job.jobId,
        sessionId: job.sessionId,
        status: job.status,
        progress: job.progress,
        createdAt: job.createdAt,
        startedAt: job.startedAt,
        completedAt: job.completedAt
      };

      if (job.status === 'completed' && job.result) {
        response.result = job.result;
      } else if (job.status === 'failed' && job.error) {
        response.error = job.error;
      }

      return res.status(200).json(response);
    } catch (error: any) {
      console.error('Error getting evaluation status:', error);
      return res.status(500).json({
        error: 'Failed to get evaluation status',
        code: 'STATUS_CHECK_FAILED'
      });
    }
  });

  // Get evaluation report for ECOS session
  // 🔒 SECURED: Requires student authentication via Firebase token
  app.get("/api/ecos/sessions/:sessionId/report", requireStudent, async (req: FirebaseAuthRequest, res: Response) => {
    try {
      const { sessionId } = req.params;
      // SECURITY: Email retrieved from verified Firebase token (NOT from query)
      const email = req.firebaseUser!.email;

      const evaluationRecord = await unifiedDb.getEvaluation(sessionId);
      if (!evaluationRecord) {
        return res.status(404).json({
          error: 'Aucune évaluation enregistrée pour cette session',
          code: 'EVALUATION_NOT_FOUND'
        });
      }

      const scenarioIdMatch = sessionId.match(/^session_(\d+)_/);
      const scenarioId = scenarioIdMatch ? parseInt(scenarioIdMatch[1]) : null;

      let scenarioTitle = 'Scénario inconnu';
      let evaluationCriteria: any = null;

      if (scenarioId) {
        try {
          const scenarios = await unifiedDb.getScenarios();
          const scenario = scenarios.find(s => s.id === scenarioId);
          if (scenario) {
            scenarioTitle = scenario.title;
            evaluationCriteria = scenario.evaluation_criteria || null;
          }
        } catch (dbError) {
          console.warn('⚠️ Could not load scenario for evaluation report:', (dbError as Error).message);
        }
      }

      const messages = await unifiedDb.getSessionMessages(sessionId, 100);

      const storedScores = evaluationRecord.scores || {};
      const storedCriteriaDetails = Array.isArray(evaluationRecord.criteria_details) ? evaluationRecord.criteria_details : null;

      const criteria = Object.keys(storedScores).map(key => {
        const scoreValue = Number(storedScores[key] ?? 0);
        const storedDetail = storedCriteriaDetails?.find((detail: any) => (detail.id || '').toString() === key);
        const name = storedDetail?.name || key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        const weight = typeof storedDetail?.weight === 'number' ? storedDetail.weight : null;

        // Use stored evidence (conversation excerpts) from evaluation
        const evidence = storedDetail?.evidence || [];

        return {
          id: key,
          name,
          score: scoreValue,
          percent: Math.round((scoreValue / (storedDetail?.maxScore || 4)) * 100),
          maxScore: storedDetail?.maxScore || 4,
          weight,
          strengths: Array.isArray(storedDetail?.strengths) ? storedDetail.strengths : [],
          weaknesses: Array.isArray(storedDetail?.weaknesses) ? storedDetail.weaknesses : [],
          actions: Array.isArray(storedDetail?.actions) ? storedDetail.actions : [],
          justification: storedDetail?.justification || '',
          indicators: Array.isArray(storedDetail?.indicators) ? storedDetail.indicators : [],
          evidence: evidence  // Conversation excerpts as justification
        };
      });

      const overallScore = Number(evaluationRecord.global_score ?? 0);
      const summary = evaluationRecord.summary || `Évaluation du scénario "${scenarioTitle}" basée sur ${messages.length} échange${messages.length > 1 ? 's' : ''} patient/CEERRF.`;

      res.status(200).json({
        report: {
          sessionId,
          scenarioTitle,
          overallScore,
          criteria,
          strengths: evaluationRecord.strengths || [],
          weaknesses: evaluationRecord.weaknesses || [],
          recommendations: evaluationRecord.recommendations || [],
          feedback: evaluationRecord.feedback || null,
          transcriptMessageCount: messages.length,
          summary,
          generatedAt: evaluationRecord.evaluated_at || evaluationRecord.created_at || new Date().toISOString()
        },
        message: 'Evaluation report generated successfully'
      });
    } catch (error) {
      console.error('Error generating ECOS session report:', error);
      res.status(500).json({
        error: 'Failed to generate evaluation report',
        code: 'EVALUATION_REPORT_FAILED'
      });
    }
  });

  // Session ID parsing utility function
  function extractScenarioIdFromSessionId(sessionId: string): number | null {
    if (!sessionId || typeof sessionId !== 'string') return null;
    const match = sessionId.match(/^session_(\d+)_/);
    if (match && match[1]) {
      const parsed = parseInt(match[1], 10);
      return Number.isNaN(parsed) || parsed <= 0 ? null : parsed;
    }
    return null;
  }

  // AI-powered virtual patient simulator with memory and role recognition
  // 🔒 SECURED: Requires student authentication via Firebase token
  app.post("/api/ecos/patient-simulator", requireStudent, apiRateLimit.middleware(), validateContentType(), validateRequestSize(), patientTiming, async (req: FirebaseAuthRequest, res: Response) => {
    try {
      // SECURITY: Email retrieved from verified Firebase token (NOT from body)
      const email = req.firebaseUser!.email;
      const { sessionId, query, scenarioId: providedScenarioId } = req.body;

      // Try to resolve scenarioId with fallback to sessionId parsing
      let resolvedScenarioId = providedScenarioId;

      if (!resolvedScenarioId && sessionId) {
        resolvedScenarioId = extractScenarioIdFromSessionId(sessionId);
      }

      // Convert scenarioId to number if it's a string (CRITICAL for emotional state system)
      if (resolvedScenarioId) {
        const numericScenarioId = typeof resolvedScenarioId === 'string'
          ? parseInt(resolvedScenarioId, 10)
          : resolvedScenarioId;

        if (!isNaN(numericScenarioId)) {
          resolvedScenarioId = numericScenarioId;
        }
      }

      // Import services
      const { virtualPatientService } = await import('./services/virtual-patient.service.js');

      // Validate input using resolved scenarioId
      const validation = virtualPatientService.validateInput({
        sessionId,
        email,
        query,
        scenarioId: resolvedScenarioId
      });

      if (!validation.valid) {
        return res.status(400).json({
          error: validation.error,
          code: 'INVALID_INPUT'
        });
      }

      // Validate scenario exists before processing
      if (resolvedScenarioId) {
        try {
          const scenarios = await timedPatientPhase('scenario_validation', () => unifiedDb.getScenarios());
          const scenario = scenarios.find(s => s.id === parseInt(resolvedScenarioId.toString(), 10));
          if (!scenario) {
            return res.status(404).json({
              error: `Scenario ${resolvedScenarioId} not found`,
              code: 'SCENARIO_NOT_FOUND'
            });
          }
        } catch (error) {
          return res.status(500).json({
            error: 'Failed to validate scenario',
            code: 'SCENARIO_VALIDATION_FAILED'
          });
        }
      }

      const patientResponse = await virtualPatientService.generatePatientResponse(
        sessionId,
        email,
        query,
        resolvedScenarioId
      );

      // Store conversation in database
      try {
        await timedPatientPhase('persistence', async () => {
          await unifiedDb.storeSessionMessage({
            sessionId,
            role: 'user',
            question: query,
            response: ''
          });
          await unifiedDb.storeSessionMessage({
            sessionId,
            role: 'assistant',
            question: '',
            response: patientResponse.response,
            content: patientResponse.response
          });
        });

        // Trigger real-time analysis for teacher dashboard
        try {
          const { realtimeAnalysisService } = await timedPatientPhase('analysis_dispatch', () => import('./services/realtime-analysis.service.js'));
          // Fire and forget - don't await to avoid slowing down response
          realtimeAnalysisService.analyzeSessionProgress(sessionId, {
            sessionStatus: 'in_progress'
          }).catch(err => {
            patientTimingError('analysis_dispatch', err);
          });
        } catch (analysisError) {
          // The timed import already recorded the error class.
        }
      } catch (storageError) {
        // The persistence phase already recorded the error class.
        // Continue - storage failure shouldn't break patient simulator
      }

      res.status(200).json({
        response: patientResponse.response,
        sessionId,
        timestamp: new Date(),
        addressing: patientResponse.addressing,
        medicalContext: patientResponse.medicalContext,
        message: 'AI patient response generated with memory and role awareness'
      });

    } catch (error) {
      if (error instanceof VerifiedPatientScenarioUnavailableError) {
        return res.status(503).json({ code: 'PATIENT_SCENARIO_UNAVAILABLE' });
      }
      if (error instanceof EmptyPatientResponseError) {
        return res.status(422).json({ code: 'AI_PATIENT_EMPTY_RESPONSE' });
      }
      patientTimingError('route', error);
      res.status(500).json({
        error: 'Failed to generate AI patient response',
        code: 'AI_PATIENT_SIMULATOR_FAILED'
      });
    }
  });

  return httpServer;
}
