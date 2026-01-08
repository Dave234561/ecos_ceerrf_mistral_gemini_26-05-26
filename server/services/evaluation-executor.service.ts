/**
 * Evaluation Executor Service
 *
 * Contains the core evaluation logic extracted from routes.ts
 * Used by both synchronous endpoint and asynchronous job processor
 */

import { unifiedDb } from './unified-database.service.js';
import { openaiService } from './openai.service.js';
import { logger } from './logger.service.js';

/**
 * Extract relevant message excerpts from conversation
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

/**
 * Normalize criteria from database
 */
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

/**
 * Execute evaluation for a session
 * @param sessionId - The session ID to evaluate
 * @param email - Student email
 * @param progressCallback - Optional callback for progress updates (0-100)
 */
export async function executeEvaluation(
  sessionId: string,
  email: string,
  progressCallback?: (progress: number) => void
): Promise<any> {
  const updateProgress = (p: number) => {
    if (progressCallback) progressCallback(p);
  };

  try {
    updateProgress(10);

    // Extract scenarioId from sessionId
    const scenarioIdMatch = sessionId.match(/^session_(\d+)_/);
    const scenarioId = scenarioIdMatch ? parseInt(scenarioIdMatch[1]) : null;

    updateProgress(20);

    // Load scenario to get evaluation_criteria from DB
    const scenarios = await unifiedDb.getScenarios();
    const scenario = scenarioId ? scenarios.find(s => s.id === scenarioId) : null;
    logger.info('Loaded scenario for evaluation', { scenarioId, hasScenario: !!scenario });

    const dbCriteria = scenario?.evaluation_criteria || null;

    updateProgress(30);

    // Fetch conversation history
    const messages = await unifiedDb.getSessionMessages(sessionId, 50);

    if (!messages || messages.length === 0) {
      throw new Error('Pas assez d\'échanges pour une évaluation - la session était vide');
    }

    updateProgress(40);

    // Build transcript from messages
    const transcript = messages.map((msg: any, idx: number) => {
      let content = '';
      let role = '';

      if (msg.role === 'user') {
        content = msg.question || msg.content || '';
        role = 'Étudiant';
      } else if (msg.role === 'assistant') {
        content = msg.response || msg.content || '';
        role = 'Patient';
      } else {
        content = msg.question || msg.response || msg.content || '';
        role = msg.role === 'user' ? 'Étudiant' : 'Patient';
      }

      return `${role}: ${content.toString().trim()}`;
    }).join('\n---\n');

    logger.info('Built transcript for evaluation', {
      sessionId,
      messageCount: messages.length,
      transcriptLength: transcript.length
    });

    updateProgress(50);

    // Normalize criteria from DB
    const criteriaList = normalizeCriteria(dbCriteria);

    const fallbackCriteria = [
      { id: 'communication', name: 'Communication', maxScore: 4 },
      { id: 'clinical_reasoning', name: 'Raisonnement Clinique', maxScore: 4 },
      { id: 'empathy', name: 'Empathie', maxScore: 4 },
      { id: 'professionalism', name: 'Professionnalisme', maxScore: 4 }
    ];
    const usedCriteria = criteriaList.length > 0 ? criteriaList : fallbackCriteria;

    logger.info('Using evaluation criteria', {
      criteriaSource: criteriaList.length > 0 ? 'database' : 'fallback',
      criteriaCount: usedCriteria.length
    });

    updateProgress(60);

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

    updateProgress(70);

    // Call OpenAI for evaluation
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

      logger.info('LLM evaluation completed', { sessionId, hasCriteria: !!llmJson?.criteria });
    } catch (err) {
      logger.warn('LLM evaluation parsing failed, using heuristic fallback', {
        sessionId,
        error: (err as Error).message
      });
    }

    updateProgress(80);

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
      const finalScore = llmScore;

      return {
        id: criterionId,
        name: criterion.name,
        description: criterion.description || '',
        indicators: criterion.indicators || [],
        weight: Math.round((weightValues[index] / weightSum) * 10000) / 100,
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

    updateProgress(90);

    // Store evaluation in database
    try {
      await unifiedDb.createEvaluation({
        sessionId,
        scenarioId: scenarioId!,
        studentEmail: email,
        scores: evaluation.scores,
        globalScore: overallScorePercent,
        strengths: Array.isArray(evaluation.feedback) ? evaluation.feedback : [],
        weaknesses: Array.isArray(evaluation.weaknesses) ? evaluation.weaknesses : [],
        recommendations: Array.isArray(evaluation.recommendations) ? evaluation.recommendations : [],
        feedback: `Évaluation automatique - Score IA: ${overallScorePercent}%`,
        llmScorePercent: evaluation.llmScorePercent,
        criteriaDetails: evaluation.criteria
      });

      logger.info('Stored evaluation in database', { sessionId, score: overallScorePercent });

      // Finalize session for real-time dashboard
      try {
        const { realtimeAnalysisService } = await import('./realtime-analysis.service.js');
        await realtimeAnalysisService.finalizeSession(sessionId);
        logger.info('Session finalized for real-time dashboard', { sessionId });
      } catch (finalizeError) {
        logger.warn('Failed to finalize session for dashboard (non-critical)', { sessionId });
      }
    } catch (dbError: any) {
      logger.error('Failed to store evaluation in database', {
        sessionId,
        error: dbError?.message
      });
      throw new Error('Failed to store evaluation: ' + dbError?.message);
    }

    updateProgress(100);

    return {
      evaluationId,
      sessionId,
      evaluation
    };
  } catch (error: any) {
    logger.error('Evaluation execution failed', {
      sessionId,
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}
