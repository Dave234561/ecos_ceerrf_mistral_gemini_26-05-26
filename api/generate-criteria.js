// Direct generate-criteria API endpoint for Vercel deployment
// Fixes the 400 error in scenario modification functionality

export default async function handler(req, res) {
  const startTime = Date.now();
  
  // Set comprehensive CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ 
      error: 'Method not allowed', 
      allowedMethods: ['POST', 'OPTIONS'],
      timestamp: new Date().toISOString()
    });
  }

  try {
    console.log(`[${new Date().toISOString()}] Generate-criteria request:`, req.body);
    
    // Extract parameters - handle both parameter naming conventions
    const { email, description, scenarioDescription } = req.body;
    const actualDescription = description || scenarioDescription;
    
    // Validate required parameters
    if (!email) {
      return res.status(400).json({ 
        error: 'Email is required',
        code: 'MISSING_EMAIL',
        timestamp: new Date().toISOString()
      });
    }

    // Simple admin authorization check
    const adminEmails = [
      'colombemadoungou@gmail.com',
      'david@cherubini.fr',
      'cherubindavid@gmail.com',
      'admin@ecos.fr'
    ];

    if (!adminEmails.includes(email.toLowerCase())) {
      return res.status(403).json({ 
        error: 'Accès non autorisé',
        code: 'UNAUTHORIZED',
        timestamp: new Date().toISOString()
      });
    }

    if (!actualDescription) {
      return res.status(400).json({ 
        error: 'Scenario description is required',
        code: 'MISSING_DESCRIPTION',
        timestamp: new Date().toISOString()
      });
    }

    console.log(`✅ Generating criteria for description: ${actualDescription.substring(0, 100)}...`);

    // Environment validation
    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (!openaiApiKey) {
      console.error('❌ OPENAI_API_KEY is missing');
      return res.status(500).json({
        error: 'OpenAI configuration missing',
        code: 'OPENAI_CONFIG_ERROR',
        timestamp: new Date().toISOString()
      });
    }

    // Generate evaluation criteria using OpenAI
    try {
      const systemPrompt = `Tu es un expert en évaluation ECOS. Crée des critères d'évaluation structurés pour ce scénario clinique.

Les critères doivent inclure:
1. Communication (écoute, empathie, clarté)
2. Anamnèse (questions pertinentes, organisation)
3. Examen clinique (techniques, systématique)
4. Raisonnement clinique (diagnostic différentiel, hypothèses)
5. Prise en charge (plan thérapeutique, suivi)

Chaque critère doit avoir:
- Un nom clair
- Une description détaillée
- Une échelle de notation (0-4 points)
- Des indicateurs de performance pour chaque niveau

Retourne le résultat en format JSON structuré avec une clé "evaluation_criteria" contenant un tableau d'objets.`;

      const userPrompt = `Crée des critères d'évaluation pour ce scénario ECOS:\n\n${actualDescription}`;

      console.log('🤖 Calling OpenAI API...');
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 55000); // 55s timeout for Vercel
      
      try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${openaiApiKey}`,
            'Content-Type': 'application/json',
          },
          signal: controller.signal,
          body: JSON.stringify({
            model: "gpt-4o",
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt }
            ],
            temperature: 0.3,
            max_tokens: 1500
          })
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorData = await response.text();
          console.error('❌ OpenAI API error:', response.status, errorData);
          throw new Error(`OpenAI API error: ${response.status}`);
        }

        const openaiResponse = await response.json();
        const criteriaText = openaiResponse.choices[0].message.content;

        console.log('📝 Generated criteria text:', criteriaText.substring(0, 200) + '...');

        // Try to parse as JSON, fallback to structured object if it fails
        let criteria;
        try {
          const parsedCriteria = JSON.parse(criteriaText);
          // Ensure we have the right structure
          if (parsedCriteria.evaluation_criteria) {
            criteria = parsedCriteria;
          } else if (Array.isArray(parsedCriteria)) {
            criteria = { evaluation_criteria: parsedCriteria };
          } else {
            criteria = { evaluation_criteria: [parsedCriteria] };
          }
        } catch (parseError) {
          console.warn('⚠️ JSON parsing failed, creating structured fallback');
          // If JSON parsing fails, create a structured object from the text
          criteria = {
            evaluation_criteria: [
              {
                name: "Communication",
                description: "Évaluation des compétences de communication avec le patient",
                maxScore: 4,
                weight: 20,
                indicators: {
                  "0": "Aucune communication effective",
                  "1": "Communication minimale",
                  "2": "Communication acceptable",
                  "3": "Bonne communication",
                  "4": "Communication excellente"
                }
              },
              {
                name: "Anamnèse",
                description: "Capacité à recueillir les informations pertinentes sur l'histoire du patient",
                maxScore: 4,
                weight: 25,
                indicators: {
                  "0": "Aucune question pertinente posée",
                  "1": "Questions de base posées",
                  "2": "Anamnèse correcte mais incomplète",
                  "3": "Anamnèse complète et structurée",
                  "4": "Anamnèse exhaustive et ciblée"
                }
              },
              {
                name: "Raisonnement clinique",
                description: "Capacité d'analyse et de raisonnement diagnostique",
                maxScore: 4,
                weight: 30,
                indicators: {
                  "0": "Aucun raisonnement apparent",
                  "1": "Raisonnement élémentaire",
                  "2": "Raisonnement acceptable",
                  "3": "Bon raisonnement clinique",
                  "4": "Raisonnement clinique excellent"
                }
              },
              {
                name: "Prise en charge",
                description: "Propositions de prise en charge appropriées",
                maxScore: 4,
                weight: 25,
                indicators: {
                  "0": "Aucune prise en charge proposée",
                  "1": "Prise en charge inadéquate",
                  "2": "Prise en charge partielle",
                  "3": "Prise en charge appropriée",
                  "4": "Prise en charge optimale"
                }
              }
            ],
            generatedText: criteriaText
          };
        }

        const responseTime = Date.now() - startTime;
        console.log(`✅ Criteria generated successfully in ${responseTime}ms`);

        res.status(200).json({ 
          message: "Critères d'évaluation générés avec succès",
          criteria,
          responseTime,
          timestamp: new Date().toISOString(),
          source: 'direct-openai-api'
        });
      } finally {
        clearTimeout(timeoutId);
      }

    } catch (openaiError) {
      console.error('❌ OpenAI error:', openaiError);
      res.status(500).json({ 
        error: "Erreur lors de la génération des critères d'évaluation",
        message: openaiError.message,
        code: 'OPENAI_ERROR',
        timestamp: new Date().toISOString(),
        responseTime: Date.now() - startTime
      });
    }

  } catch (error) {
    console.error('❌ Unexpected error in generate-criteria handler:', error);
    res.status(500).json({
      error: 'Failed to generate evaluation criteria',
      message: error.message,
      code: 'HANDLER_ERROR',
      timestamp: new Date().toISOString(),
      responseTime: Date.now() - startTime
    });
  }
}