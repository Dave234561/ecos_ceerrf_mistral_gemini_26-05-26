/**
 * Virtual Patient Service
 * 
 * AI-powered virtual patient for ECOS medical training scenarios
 * - Uses intelligent responses
 * - Integrates with conversation memory
 * - Role-aware interactions (CEERRF vs docteur)
 * - Scenario-specific patient personas
 */

import { llmService } from './llm.service.js';
import { timedPatientPhase, patientTimingError } from './patient-timing.js';
import { createHash } from 'node:crypto';
import { adultPsychiatricTone } from './patient-case-adult.js';
import { shouldUsePatientPilot, projectPatientPilot, resolvePatientCaseReply, VerifiedPatientScenarioUnavailableError } from './patient-case-guard.js';
import { EmptyPatientResponseError } from './mistral.service.js';
import { conversationMemoryService } from './conversation-memory.service.js';
import { unifiedDb } from './unified-database.service.js';
import { emotionalStateService } from './emotional-state.service.js';


export interface PatientResponse {
  response: string;
  addressing: string; // How to address the student
  message?: string;
  medicalContext?: {
    symptomsRevealed: string[];
    questionsAnswered: string[];
    nextSteps: string[];
  };
}

export class VirtualPatientService {
  private sanitizePatientResponse(text: string): string {
    if (!text) return '';

    let out = text;

    // Remove stage directions like *les bras croisés*, even if multiline
    out = out.replace(/\*[\s\S]*?\*/g, '');

    // Remove common role prefixes if model outputs them
    out = out.replace(/^\s*(patient|\u00e9tudiant|etudiant)\s*:\s*/gim, '');

    // Normalize whitespace
    out = out.replace(/\n{3,}/g, '\n\n');
    out = out.replace(/[ \t]{2,}/g, ' ');

    return out.trim();
  }
  
  /**
   * Generate virtual patient response using AI
   */
  async generatePatientResponse(
    sessionId: string,
    studentEmail: string,
    query: string,
    scenarioId?: number
  ): Promise<PatientResponse> {
    if (shouldUsePatientPilot(scenarioId, process.env.VERCEL_ENV)) {
      const sourcePrompt = await this.getScenarioPatientPrompt(scenarioId);
      const strictCase = projectPatientPilot(scenarioId, sourcePrompt);
      // If the authoritative revision changes or is unavailable, never let the
      // pilot fall back to a model that can add unverified clinical details.
      if (!strictCase) throw new VerifiedPatientScenarioUnavailableError('Verified patient scenario unavailable');
      const reply = await timedPatientPhase('patient_case_resolution', () =>
        resolvePatientCaseReply(strictCase, query, new Set()));
      let response = reply.text;
      if (strictCase.scenarioId === 4) {
        // Keep this in-memory state separate per authenticated student and case.
        // Neither student text nor prior model dialogue is a factual input.
        const key = 'verified-patient-' + createHash('sha256')
          .update(JSON.stringify([sessionId, studentEmail, strictCase.sourceDigest])).digest('hex');
        const state = await conversationMemoryService.initializeConversation(
          key, studentEmail, 4, undefined, emotionalStateService.initializeEmotionalState(4));
        if (state.emotionalState) {
          response = adultPsychiatricTone(response, state.emotionalState.agitationLevel);
          conversationMemoryService.updateEmotionalState(key, emotionalStateService.updateEmotionalState(
            state.emotionalState, emotionalStateService.analyzeResponseQuality(query, 4), 4));
        }
      }
      return {
        response,
        addressing: 'étudiant',
        medicalContext: this.extractMedicalContext(reply.text),
        message: 'Verified patient reply',
      };
    }

    try {
      // Check if scenario supports emotional state tracking
      const emotionalStateEnabled = emotionalStateService.isEmotionalStateEnabled(scenarioId || 1);
      console.log(`🎭 [generatePatientResponse] Emotional state system status:`, {
        scenarioId: scenarioId || 1,
        enabled: emotionalStateEnabled
      });

      // Initialize emotional state if this is a new session for a supported scenario
      let initialEmotionalState = undefined;
      if (emotionalStateEnabled) {
        // Check if we already have emotional state for this session
        const existingState = conversationMemoryService.getEmotionalState(sessionId);
        if (!existingState) {
          initialEmotionalState = emotionalStateService.initializeEmotionalState(scenarioId || 1);
          console.log(`🎭 [generatePatientResponse] Initialized emotional state for scenario ${scenarioId}`);
        }
      }

      // Initialize or get conversation memory
      const memory = await timedPatientPhase('conversation_memory', () => conversationMemoryService.initializeConversation(
        sessionId,
        studentEmail,
        scenarioId || 1,
        undefined, // patientPrompt
        initialEmotionalState
      ));

      // Detect and update student role from query
      conversationMemoryService.updateStudentRole(sessionId, query);

      // Get scenario-specific patient prompt
      console.log(`🔄 [generatePatientResponse] About to fetch patient prompt for scenario ${scenarioId}`);
      const patientPrompt = await this.getScenarioPatientPrompt(scenarioId);
      const isFallbackPrompt = patientPrompt.includes('Ce prompt générique doit être remplacé');
      
      // Get conversation context
      const context = conversationMemoryService.getConversationContext(sessionId);
      
      // Get appropriate addressing
      const addressing = conversationMemoryService.getStudentAddressing(sessionId);

      // Build AI system prompt
      const systemPrompt = this.buildSystemPrompt(patientPrompt, context, addressing, scenarioId);

      // Get conversation history in OpenAI format
      const conversationMessages = conversationMemoryService.getConversationMessages(sessionId, 8);

      // Generate AI response with scenario-specific initial message
      const aiResponse = await timedPatientPhase('generation', () => this.callOpenAI(systemPrompt, query, conversationMessages, scenarioId));
      const cleanedResponse = await timedPatientPhase('patient_normalization', () => {
        const cleaned = this.sanitizePatientResponse(aiResponse);
        if (!cleaned) throw new EmptyPatientResponseError('No visible patient response after sanitization');
        return cleaned;
      });

      // Update emotional state if enabled for this scenario
      if (emotionalStateEnabled && context.emotionalState) {
        // Analyze student response quality
        const responseAnalysis = emotionalStateService.analyzeResponseQuality(
          query,
          scenarioId || 1
        );

        // Update emotional state based on analysis
        const updatedState = emotionalStateService.updateEmotionalState(
          context.emotionalState,
          responseAnalysis,
          scenarioId || 1
        );

        // Store updated state
        conversationMemoryService.updateEmotionalState(sessionId, updatedState);

        // Log emotional state change
        const stateSummary = emotionalStateService.getStateSummary(updatedState, scenarioId || 1);
        console.log(`🎭 [generatePatientResponse] Emotional state updated: ${stateSummary}`);
        console.log(`   Response analysis: ${responseAnalysis.isAdaptive ? 'ADAPTIVE' : 'NON-ADAPTIVE'} (score: ${responseAnalysis.score}/100, change: ${responseAnalysis.agitationChange > 0 ? '+' : ''}${responseAnalysis.agitationChange})`);
      }

      // Add messages to memory
      conversationMemoryService.addMessage(sessionId, query, 'student');
      conversationMemoryService.addMessage(sessionId, cleanedResponse, 'patient');

      // Extract medical context from response
      const medicalContext = this.extractMedicalContext(cleanedResponse);

      return {
        response: cleanedResponse,
        addressing: addressing || 'étudiant',
        medicalContext,
        message: isFallbackPrompt
          ? 'AI patient response generated with fallback prompt'
          : 'AI patient response generated with scenario prompt and memory awareness'
      };

    } catch (error) {
      if (error instanceof EmptyPatientResponseError) throw error;
      patientTimingError('patient_fallback', error);
      
      // Fallback response
      const addressing = conversationMemoryService.getStudentAddressing(sessionId);

      return {
        response: `Excusez-moi ${addressing || ''}, pourriez-vous répéter votre question ? Je n'ai pas bien compris.`,
        addressing: addressing || 'étudiant',
        message: 'AI patient fallback response'
      };
    }
  }

  /**
   * Get scenario-specific patient prompt from database
   */
  private async getScenarioPatientPrompt(scenarioId?: number): Promise<string> {
    console.log(`🔍 [getScenarioPatientPrompt] Called with scenarioId: ${scenarioId}`);
    
    if (!scenarioId) {
      console.warn(`⚠️ [getScenarioPatientPrompt] No scenarioId provided, using default prompt`);
      return this.getDefaultPatientPrompt();
    }

    try {
      console.log(`🔄 [getScenarioPatientPrompt] Fetching scenarios from database...`);
      const scenarios = await timedPatientPhase('scenario_prompt_fetch', () => unifiedDb.getScenarios());
      console.log(`📊 [getScenarioPatientPrompt] Found ${scenarios.length} scenarios in database`);

      const parsedScenarioId =
        typeof scenarioId === 'string' ? parseInt(scenarioId, 10) : scenarioId;

      const normalizedScenarioId =
        typeof parsedScenarioId === 'number' && !Number.isNaN(parsedScenarioId)
          ? parsedScenarioId
          : null;

      const scenario = normalizedScenarioId !== null
        ? scenarios.find(s => {
            const scenarioDbId = typeof s.id === 'string' ? parseInt(s.id, 10) : s.id;
            return !Number.isNaN(scenarioDbId) && scenarioDbId === normalizedScenarioId;
          })
        : undefined;
      console.log(`🔍 [getScenarioPatientPrompt] Scenario ${scenarioId} found:`, scenario ? 'YES' : 'NO');
      
      if (scenario?.patient_prompt && scenario.patient_prompt.trim()) {
        console.log(`✅ [getScenarioPatientPrompt] Using scenario-specific prompt for scenario ${normalizedScenarioId ?? scenarioId}`);
        return scenario.patient_prompt;
      }
      
      if (scenario) {
        console.warn(`⚠️ [getScenarioPatientPrompt] Scenario ${normalizedScenarioId ?? scenarioId} exists but has no patient_prompt`);
      } else {
        console.warn(`⚠️ [getScenarioPatientPrompt] Scenario ${normalizedScenarioId ?? scenarioId} not found in database`);
      }
      
      console.warn(`⚠️ [getScenarioPatientPrompt] Using fallback prompt for scenario ${scenarioId}`);
      return this.getDefaultPatientPrompt();
      
    } catch (error) {
      console.warn('⚠️ [getScenarioPatientPrompt] Using emergency fallback prompt due to database error');
      return this.getDefaultPatientPrompt();
    }
  }

  /**
   * Build comprehensive system prompt for AI
   */
  private buildSystemPrompt(
    patientPrompt: string,
    context: { history: string; role: string; medicalContext: string; emotionalState?: any },
    addressing: string,
    scenarioId?: number
  ): string {
    const roleInstruction = this.getRoleInstruction(addressing);

    // Get emotional state instructions if applicable
    let emotionalStateInstructions = '';
    if (context.emotionalState && scenarioId) {
      const behavioralInstructions = emotionalStateService.getBehavioralInstructions(
        context.emotionalState.agitationLevel,
        scenarioId
      );
      if (behavioralInstructions) {
        emotionalStateInstructions = `\n\n${behavioralInstructions}\n`;
      }
    }

    return `⚠️ TU ES UN PATIENT, PAS UN SOIGNANT ⚠️
NE DIS JAMAIS: "Je peux vous aider", "Comment puis-je vous aider", "Je suis là pour vous écouter"
TU ES LA PERSONNE QUI A BESOIN D'AIDE, PAS CELLE QUI L'OFFRE.

Tu es un patient virtuel dans un exercice de formation médicale ECOS (Examen Clinique Objectif Structuré).

PERSONNALITÉ ET CONTEXTE DU PATIENT (À RESPECTER ABSOLUMENT):
${patientPrompt}
${emotionalStateInstructions}
INSTRUCTIONS COMPORTEMENTALES CRITIQUES:
- Parle uniquement en français
- RESPECTE STRICTEMENT le contexte et les symptômes décrits dans ton prompt de patient
- NE JAMAIS inventer ou mentionner des symptômes qui ne sont PAS dans ton contexte
- NE JAMAIS nier des symptômes qui SONT explicitement mentionnés dans ton contexte
- Si ton prompt mentionne des symptômes spécifiques, tu DOIS les avoir
- Tu es le patient. Ne bascule JAMAIS dans le rôle du CEERRF ou d'un soignant.
- N'emploie jamais des phrases comme "je suis là pour vous aider/écouter" ou toute formulation qui implique que tu prends en charge l'étudiant.
- ${roleInstruction}
- Réponds de manière réaliste et cohérente avec EXACTEMENT tes symptômes décrits
- Sois coopératif mais réaliste (certaines informations peuvent nécessiter des questions spécifiques)
- Ton: conversationnel, simple, neutre (pas théâtral)
- Ne fais AUCUNE mise en scène: pas de didascalies, pas d'actions, pas de narration
- N'utilise jamais de texte entre astérisques (ex: *les bras croisés*, *voix tremblante*) ni de labels type "Patient:"/"Étudiant:"
- Référence les informations déjà échangées dans la conversation
${context.emotionalState ? '- ADAPTE ton comportement selon ton ÉTAT ÉMOTIONNEL ACTUEL décrit ci-dessus' : ''}

⚠️ EXEMPLES DE COMPORTEMENT - À RESPECTER ABSOLUMENT ⚠️

❌ INCORRECT (tu agis comme un soignant):
Étudiant: "Bonjour"
Patient: "Bonjour, je peux vous aider ?"  ← NE JAMAIS FAIRE ÇA

❌ INCORRECT (tu offres de l'aide comme un soignant):
Étudiant: "Comment allez-vous ?"
Patient: "Je suis là pour vous écouter"  ← NE JAMAIS FAIRE ÇA

✅ CORRECT (tu es un patient qui exprime ses besoins/symptômes):
Étudiant: "Bonjour"
Patient: "Bonjour... Qu'est-ce que vous voulez ?"

✅ CORRECT (tu es méfiant, anxieux, selon ton contexte):
Étudiant: "Comment allez-vous ?"
Patient: "Pas bien... j'ai mal/peur/les voix me parlent..." (selon ton contexte)

CONTEXTE MÉDICAL ACTUEL:
${context.medicalContext}

RÈGLES D'OR:
1. RESTE FIDÈLE à ton prompt de patient - ne jamais en dévier
2. Si ton contexte mentionne des symptômes, tu les as RÉELLEMENT
3. Ne mentionne JAMAIS de symptômes non inclus dans ton contexte
4. Utilise l'historique de conversation (messages précédents) pour maintenir la continuité
5. Si l'étudiant a déjà posé une question similaire, fais référence à ta réponse précédente
${context.emotionalState ? '6. Ton état émotionnel ÉVOLUE en fonction des réponses de l\'étudiant - reste cohérent avec ton niveau d\'agitation actuel' : ''}

IMPORTANT: Respecte ton contexte médical à 100%. L'historique complet de la conversation t'est fourni dans les messages précédents - utilise-le pour assurer la cohérence.`;
  }

  /**
   * Get role-specific instruction
   */
  private getRoleInstruction(addressing: string): string {
    console.log(`🎭 Generating role instruction for addressing: "${addressing}"`);
    
    switch (addressing) {
      case 'CEERRF':
        return 'Adresse-toi au CEERRF de manière appropriée. Tu peux demander "Que faites-vous comme soins infirmier?" ou dire "Merci CEERRF" quand c\'est approprié.';
      case 'docteur':
        return 'Adresse-toi au docteur de manière formelle. Tu peux dire "Docteur, qu\'est-ce que j\'ai?" ou "Merci docteur" quand c\'est approprié.';
      default:
        // Default to CEERRF for ECOS-CEERRF platform if no role detected yet
        console.log('🎭 No specific role detected, defaulting to CEERRF addressing for ECOS-CEERRF platform');
        return 'Adresse-toi au CEERRF de manière appropriée. Tu peux demander "Que faites-vous comme soins infirmier?" ou dire "Merci CEERRF" quand c\'est approprié.';
    }
  }

  /**
   * Get initial patient message to establish correct behavior
   * This prevents GPT-4 from acting like an assistant/caregiver
   */
  private getInitialPatientMessage(scenarioId?: number): string {
    // Default initial message if no scenario ID
    const defaultMessage = "Bonjour... Qu'est-ce que vous voulez savoir ?";

    if (!scenarioId) {
      return defaultMessage;
    }

    // Scenario-specific initial messages that establish patient role
    const scenarioMessages: Record<number, string> = {
      4: "Qu'est-ce que vous me voulez ? Qui vous envoie ? Les voix me disent de ne faire confiance à personne...",
      5: "Bonjour... j'ai très mal au ventre depuis ce matin. Ça me fait vraiment souffrir.",
      // Add more scenarios as needed
    };

    return scenarioMessages[scenarioId] || defaultMessage;
  }

  /**
   * Call OpenAI API with conversation history
   */
  private async callOpenAI(
    systemPrompt: string,
    query: string,
    conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>,
    scenarioId?: number
  ): Promise<string> {
    // Build messages array with system prompt, history, and current query
    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: "system", content: systemPrompt }
    ];

    // Add initial patient message ONLY if this is the first interaction
    if (conversationHistory.length === 0) {
      const initialMessage = this.getInitialPatientMessage(scenarioId);
      messages.push({ role: "assistant", content: initialMessage });
    }

    messages.push(...conversationHistory);
    messages.push({ role: "user", content: query });

    // Utilise Mistral (via llmService) pour le patient virtuel
    return await llmService.generateResponse('', messages, { simulatedPatient: true });
  }

  /**
   * Extract medical context from AI response
   * NOTE: Symptômes gérés par le LLM + RAG, pas de hardcode
   */
  private extractMedicalContext(response: string): PatientResponse['medicalContext'] {
    // Extraction simplifiée - le LLM gère les symptômes selon ses connaissances
    // Pas de liste hardcodée de symptômes
    
    return {
      symptomsRevealed: [], // LLM + RAG gèrent les symptômes dynamiquement
      questionsAnswered: [], // Pourrait être amélioré avec NLP
      nextSteps: [] // Pourrait suggérer les prochaines étapes diagnostiques
    };
  }

  /**
   * Default patient prompt - Emergency fallback only
   * This should only be used if database scenarios are missing patient prompts
   */
  private getDefaultPatientPrompt(): string {
    console.warn('⚠️ Using emergency fallback patient prompt - this indicates missing patient_prompt in database');
    return `Tu es un patient virtuel dans un exercice de formation médicale ECOS.

CONTEXTE GÉNÉRAL :
- Tu es un patient qui consulte pour un problème de santé
- Tu ressens des symptômes que tu peux décrire quand on te pose les bonnes questions
- Tu es coopératif mais réaliste dans tes réponses
- Tu restes conversationnel, simple et non théâtral

COMPORTEMENT :
- Réponds aux questions médicales de manière cohérente
- Ne mentionne que les symptômes qu'on t'a déjà demandés ou qui sont évidents
- Sois patient et poli avec le personnel soignant
- Si on te demande des détails spécifiques, tu peux les fournir graduellement
- Exprime tes préoccupations de santé de manière naturelle

FORMAT:
- Ne fais AUCUNE mise en scène: pas de didascalies, pas d'actions, pas de narration
- N'utilise jamais de texte entre astérisques (ex: *...*)

IMPORTANT : Ce prompt générique doit être remplacé par un prompt spécifique au scénario dans la base de données.`;
  }

  /**
   * Get conversation memory for a session
   */
  getConversationMemory(sessionId: string): any {
    return conversationMemoryService.getConversationMemory(sessionId);
  }

  /**
   * Get memory statistics for monitoring
   */
  getServiceStats(): {
    memoryStats: any;
    totalSessions: number;
  } {
    return {
      memoryStats: conversationMemoryService.getMemoryStats(),
      totalSessions: conversationMemoryService.getMemoryStats().activeSessions
    };
  }

  /**
   * Clear specific session data
   */
  clearPatientSession(sessionId: string): boolean {
    return conversationMemoryService.clearSession(sessionId);
  }

  /**
   * Validate patient simulator input
   */
  validateInput(input: {
    sessionId?: string;
    email?: string;
    query?: string;
    scenarioId?: number;
  }): { valid: boolean; error?: string } {
    if (!input.sessionId) {
      return { valid: false, error: 'Session ID is required' };
    }

    if (!input.email) {
      return { valid: false, error: 'Student email is required' };
    }

    if (!input.query || input.query.trim().length === 0) {
      return { valid: false, error: 'Query cannot be empty' };
    }

    if (input.query.length > 500) {
      return { valid: false, error: 'Query is too long (max 500 characters)' };
    }

    return { valid: true };
  }
}

// Export singleton instance
export const virtualPatientService = new VirtualPatientService();
