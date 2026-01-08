import { Pinecone } from '@pinecone-database/pinecone';
import { unifiedDb } from './unified-database.service.js';
import { cacheService } from './cache.service.js';
import { authService } from '../middleware/auth.middleware.js';

interface PineconeMetadata {
  title?: string;
  description?: string;
  patientPrompt?: string;
  evaluationCriteria?: any;
  imageUrl?: string;
  createdBy?: string;
}

export class ScenarioSyncService {
  private pinecone: Pinecone | null;
  private indexName: string;
  private namespace: string;
  // Remove dbService as we're using the unified database service
  private pineconeEnabled: boolean;
  
  // Cache configuration
  private readonly CACHE_KEY = 'scenarios:all';
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes cache

  constructor() {
    
    if (!process.env.PINECONE_API_KEY) {
      console.warn('⚠️  PINECONE_API_KEY not provided, Pinecone features will be disabled');
      this.pinecone = null;
      this.pineconeEnabled = false;
      this.indexName = '';
      this.namespace = '';
      return;
    }
    
    this.pineconeEnabled = true;
    
    this.pinecone = new Pinecone({
      apiKey: process.env.PINECONE_API_KEY,
    });
    
    this.indexName = process.env.PINECONE_INDEX_NAME || 'arthrologie-du-membre-superieur';
    this.namespace = process.env.PINECONE_NAMESPACE || 'default';
  }

  async syncScenariosFromPinecone(): Promise<void> {
    if (!this.pineconeEnabled || !this.pinecone) {
      console.log('⚠️ Pinecone not enabled, skipping sync');
      return;
    }
    
    try {
      
      await unifiedDb.initialize(); // Ensure database is initialized
      
      const index = this.pinecone.index(this.indexName);
      
      // Query all vectors from Pinecone with metadata
      const queryResponse = await index.namespace(this.namespace).query({
        vector: new Array(1536).fill(0), // OpenAI embeddings dimension
        topK: 100, // Get up to 100 scenarios
        includeMetadata: true,
        includeValues: false
      });

      if (!queryResponse.matches || queryResponse.matches.length === 0) {
        console.log('📭 No scenarios found in Pinecone');
        return;
      }

      console.log(`📋 Found ${queryResponse.matches.length} scenarios in Pinecone`);

      for (const match of queryResponse.matches) {
        if (!match.metadata) continue;
        
        const metadata = match.metadata as PineconeMetadata;
        
        // Skip if essential fields are missing
        if (!metadata.title || !metadata.description || !metadata.patientPrompt) {
          console.log(`⚠️ Skipping scenario ${match.id} - missing essential fields`);
          continue;
        }

        try {
          // Create scenario using unified database service
          await unifiedDb.initialize(); // Ensure database is initialized
          await unifiedDb.createScenario({
            title: metadata.title,
            description: metadata.description,
            patientPrompt: metadata.patientPrompt,
            evaluationCriteria: metadata.evaluationCriteria || {},
            imageUrl: metadata.imageUrl,
            createdBy: metadata.createdBy || 'system'
          });
          
          console.log(`✅ Created scenario: ${metadata.title}`);
        } catch (error: any) {
          if (error.message?.includes('duplicate')) {
            console.log(`⚠️ Scenario already exists: ${metadata.title}`);
          } else {
            console.error(`❌ Error creating scenario ${metadata.title}:`, error.message);
          }
        }
      }

      console.log('✅ Scenario synchronization completed');
    } catch (error) {
      console.error('❌ Error syncing scenarios from Pinecone:', error);
      throw error;
    }
  }

  async getAvailableScenarios(): Promise<any[]> {
    try {
      // Use cache service with getOrSet pattern
      return await cacheService.getOrSet(
        this.CACHE_KEY,
        async () => {
          console.log('🔄 Fetching scenarios from database (cache miss/expired)');
          await unifiedDb.initialize(); // Ensure database is initialized
          return await unifiedDb.getScenarios();
        },
        this.CACHE_TTL
      );
    } catch (error) {
      console.error('❌ Error fetching scenarios from Supabase:', error);
      throw error;
    }
  } 
  /**
   * Invalidate the scenarios cache
   * Call this when scenarios are created/updated/deleted
   */
  invalidateCache(): void {
    console.log('🗑️ Invalidating scenarios cache');
    cacheService.delete(this.CACHE_KEY);
  }

  async getScenarioById(id: string): Promise<any | null> {
    try {
      // Use cached scenarios if available
      const scenarios = await this.getAvailableScenarios();
      return scenarios.find(s => s.id === id) || null;
    } catch (error) {
      console.error('❌ Error fetching scenario by ID from Supabase:', error);
      throw error;
    }
  }

  /**
   * Get scenarios filtered by student's assigned training sessions
   * @param studentEmail - Email of the student
   * @returns Array of scenarios assigned to the student via training sessions
   */
  async getScenariosForStudent(studentEmail: string): Promise<any[]> {
    try {
      console.log(`🔍 Fetching scenarios for student: ${studentEmail}`);
      await unifiedDb.initialize();

      // Check if user is an admin - admins can see all scenarios for testing
      const isAdmin = authService.isAdmin(studentEmail);
      if (isAdmin) {
        console.log(`👑 Admin user detected (${studentEmail}), returning all scenarios`);
        const { data: allScenarios, error: allScenariosError } = await unifiedDb.supabase
          .from('scenarios')
          .select('*')
          .order('id', { ascending: true });

        if (allScenariosError) {
          console.error('❌ Error fetching all scenarios for admin:', allScenariosError);
          throw allScenariosError;
        }

        console.log(`✅ Returning ${allScenarios?.length || 0} scenario(s) for admin`);
        return allScenarios || [];
      }

      // Get all training sessions assigned to this student
      const { data: assignedSessions, error: sessionsError } = await unifiedDb.supabase
        .from('training_session_students')
        .select('training_session_id')
        .eq('student_email', studentEmail);

      if (sessionsError) {
        console.error('❌ Error fetching student training sessions:', sessionsError);
        throw sessionsError;
      }

      if (!assignedSessions || assignedSessions.length === 0) {
        console.log(`⚠️ No training sessions assigned to student: ${studentEmail}`);
        return [];
      }
      
      const sessionIds = assignedSessions.map(s => s.training_session_id);
      console.log(`📋 Student assigned to ${sessionIds.length} training session(s):`, sessionIds);
      
      // Get training sessions with their scenario_ids
      const { data: trainingSessions, error: tsError } = await unifiedDb.supabase
        .from('training_sessions')
        .select('scenario_ids')
        .in('id', sessionIds);
      
      if (tsError) {
        console.error('❌ Error fetching training sessions:', tsError);
        throw tsError;
      }
      
      // Flatten and deduplicate scenario IDs
      const scenarioIds = [...new Set(
        trainingSessions
          .flatMap(ts => ts.scenario_ids || [])
          .filter(id => id != null)
      )];
      
      console.log(`🎯 Found ${scenarioIds.length} unique scenario(s) for student:`, scenarioIds);
      
      if (scenarioIds.length === 0) {
        console.log(`⚠️ No scenarios assigned to student's training sessions`);
        return [];
      }
      
      // Get the actual scenarios
      const { data: scenarios, error: scenariosError } = await unifiedDb.supabase
        .from('scenarios')
        .select('*')
        .in('id', scenarioIds);
      
      if (scenariosError) {
        console.error('❌ Error fetching scenarios:', scenariosError);
        throw scenariosError;
      }
      
      console.log(`✅ Returning ${scenarios?.length || 0} scenario(s) for student`);
      return scenarios || [];
      
    } catch (error) {
      console.error('❌ Error in getScenariosForStudent:', error);
      throw error;
    }
  }
}

export const scenarioSyncService = new ScenarioSyncService();