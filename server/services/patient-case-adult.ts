import type { PatientCase } from './patient-case-guard.js';

export const adultSources = {
  4: { scenarioId: 4, sourceDigest: 'd464c8c11cb365207a607c8c697e3fcbb72290f6ffb83970cb640e7126eab31c' },
  5: { scenarioId: 5, sourceDigest: 'a9d0278800fb036f4cbdcdfb4086caf258dc178322319538eb2f3bd22ed2b867' },
} as const;

type Slot = PatientCase['slots'][number];
const slot = (id: string, topics: readonly string[], text: string, state: Slot['answer']['state'] = 'known'): Slot =>
  ({ id, topics, answer: { state, text } });
const unknown = (id: string, topics: readonly string[], text: string): Slot => slot(id, topics, text, 'unknown');

export const adultCases: Readonly<Record<4 | 5, PatientCase>> = {
  4: {
    ...adultSources[4],
    opening: 'Est-ce que je peux avoir mon téléphone ? Je voudrais appeler ma compagne, c’est son anniversaire.',
    clarify: 'Qu’est-ce que vous voulez savoir exactement ?',
    openingTopics: ['que puis je faire pour vous', 'qu est ce qui vous amène', 'de quoi avez vous besoin', 'comment puis je vous aider', 'qu est ce que vous voulez'],
    slots: [
      slot('phone', ['téléphone', 'appeler', 'appeler qui', 'portable', 'anniversaire', 'compagne', 'qu est ce qui vous préoccupe', 'vous préoccupe le plus'], 'J’attends le téléphone qu’on m’a promis. Je voudrais appeler ma compagne : c’est son anniversaire.'),
      slot('age', ['âge', 'quel age', 'vous avez quel âge', 'combien d années avez vous'], 'J’ai 35 ans.'),
      slot('hospital', ['déjà hospitalisé', 'hospitalisation', 'hospitalisé avant', 'déjà été ici'], 'J’ai déjà été hospitalisé il y a deux ans.'),
      slot('sleep', ['dormez', 'dormi', 'dormir', 'sommeil', 'insomnie', 'nuits'], 'Je n’ai pas dormi depuis trois jours.'),
      slot('medication', ['traitement', 'médicament', 'médicaments', 'antipsychotique', 'repris', 'repri', 'arrêté'], 'J’ai arrêté le traitement il y a six mois. Je l’ai repris il y a sept jours.'),
      unknown('medicationDetail', ['quel médicament', 'lequel', 'nom du traitement', 'nom du médicament', 'dose', 'dosage', 'posologie', 'combien de comprimés'], 'Je ne peux pas préciser le nom ou la dose.'),
      slot('voices', ['entendez vous des voix', 'des voix', 'quelles voix', 'les voix', 'qu entendez vous'], 'J’entends des voix.'),
      unknown('voiceDetails', ['que disent', 'les voix vous disent', 'ordres', 'combien de voix'], 'Je ne veux pas en dire plus.'),
      slot('mistrust', ['qui vous surveille', 'suivi', 'surveille', 'surveillent', 'méfiant', 'complot'], 'J’ai l’impression qu’on me surveille.'),
      slot('belly', ['ventre', 'abdominal', 'abdominale', 'digestif', 'digestive'], 'Je n’ai pas mal au ventre.', 'negative'),
      unknown('clinical', ['diagnostic', 'schizophrénie', 'psychose', 'constantes', 'tension artérielle', 'examen clinique'], 'Je ne peux pas vous dire ça.'),
    ],
    allowedCombinations: [['sleep', 'medication'], ['phone', 'age'], ['voices', 'mistrust']],
    suppressWhenPresent: { medication: 'medicationDetail', voices: 'voiceDetails' },
  },
  5: {
    ...adultSources[5],
    opening: 'Je ne me sens vraiment pas bien. Je suis très essoufflé et je me sens très faible.',
    clarify: 'Vous pouvez préciser votre question ?',
    openingTopics: ['qu est ce qui vous amène', 'que ressentez vous', 'comment vous sentez vous', 'qu est ce qui ne va pas', 'que se passe t il', 'qu est ce qui vous arrive'],
    slots: [
      slot('age', ['âge', 'quel age'], 'J’ai 79 ans.'),
      slot('diabetes', ['diabète', 'diabétique', 'insulinodépendant', 'non insulinodépendant'], 'Je suis diabétique non insulinodépendant.'),
      unknown('residence', ['où habitez vous', 'résidence', 'ehpad', 'foyer', 'lieu de vie'], 'Je ne peux pas préciser où j’habite.'),
      slot('onset', ['depuis quand', 'quand ça a commencé', 'ça a commencé', 'a commencé il y a', 'ont commencé il y a', 'ont commencé ce matin', 'ont commencé cet après midi', 'ont commencé ce soir', 'quand ont commencé', 'début des signes', 'depuis hier', 'depuis combien de temps'], 'J’ai commencé à me sentir mal hier.'),
      unknown('sequence', ['quelle heure', 'heure précise', 'quel signe en premier', 'quel symptôme en premier', 'apparu en premier', 'apparu d abord', 'commencé en premier', 'quel ordre', 'premier symptôme', 'en premier', 'avant le reste'], 'Je ne saurais pas dire à quelle heure ni dans quel ordre.'),
      slot('fever', ['fièvre', 'frissons', 'fébrile'], 'J’ai de la fièvre et des frissons.'),
      slot('heart', ['palpitations', 'bat vite', 'cœur s emballe', 'cœur qui bat'], 'Je sens mon cœur battre très vite.'),
      slot('breathing', ['respirer', 'respiration', 'souffle', 'essoufflé', 'essoufflement'], 'J’ai beaucoup de mal à respirer.'),
      slot('fatigue', ['fatigue', 'fatigué', 'faible', 'faiblesse', 'épuisé', 'épuisement'], 'Je me sens très faible et épuisé.'),
      slot('confusion', ['confus', 'confusion', 'idées claires', 'désorienté'], 'J’ai un peu de mal à avoir les idées claires.'),
      slot('worry', ['inquiet', 'angoissé', 'stressé', 'peur', 's aggrave', 'va empirer'], 'Ça m’inquiète, j’ai peur que ça empire.'),
      slot('thirst', ['soif', 'bouche sèche', 'sec dans la bouche'], 'J’ai soif et la bouche sèche.'),
      unknown('intake', ['bu', 'boire', 'quantité bue', 'combien de verres', 'bu aujourd hui', 'hydratation', 'mangé', 'repas', 'alimentation'], 'Je ne peux pas vous préciser ce que j’ai bu ou mangé.'),
      unknown('urine', ['urine', 'uriner', 'urines', 'pipi', 'toilettes'], 'Je ne peux pas vous préciser mes urines.'),
      unknown('medication', ['traitement', 'médicament', 'médicaments', 'dose', 'oublié', 'posologie'], 'Je ne peux pas préciser mes médicaments ni leurs prises.'),
      unknown('pain', ['poitrine', 'thoracique', 'abdomen', 'abdominale', 'abdominal', 'ventre'], 'Je ne peux pas vous préciser si j’ai une douleur à cet endroit.'),
      unknown('clinical', ['diagnostic', 'saturation', 'fréquence respiratoire', 'fréquence cardiaque', 'tension', 'glycémie', 'thermomètre', 'degrés', 'mesurée', 'chiffres', 'examen'], 'Je ne peux pas donner ce résultat.'),
    ],
    allowedCombinations: [
      ['onset', 'sequence'], ['onset', 'clinical'], ['onset', 'fever'], ['onset', 'breathing'], ['onset', 'heart'],
      ['onset', 'fatigue'], ['fever', 'breathing'], ['breathing', 'heart'], ['breathing', 'fatigue'],
      ['thirst', 'intake'], ['thirst', 'urine'], ['intake', 'urine'], ['thirst', 'intake', 'urine'],
    ],
    suppressWhenPresent: {
      fever: 'clinical', breathing: 'clinical', heart: 'clinical',
    },
    refineMatches(question, matchedIds) {
      const q = question.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ');
      const symptomIds = ['fever', 'heart', 'breathing', 'fatigue', 'confusion', 'thirst'];
      const symptomCount = symptomIds.filter(id => matchedIds.has(id)).length;
      const impliedOrder = (symptomCount > 1 || (symptomCount > 0 && matchedIds.has('onset'))) &&
        /\bd abord\b.{1,120}\b(puis|ensuite)\b/.test(q);
      if (!matchedIds.has('sequence') && !impliedOrder) return matchedIds;
      // Named symptoms used as candidates for chronology are not confirmation
      // questions. Keep requested onset, but never assign an order by echo.
      const matches = new Set(matchedIds);
      matches.add('sequence');
      for (const id of symptomIds) matches.delete(id);
      return matches;
    },
  },
};

// Same thresholds as the existing scenario-4 emotional state. These phrases
// modulate cooperation, not the clinical facts or access to educator material.
export function adultPsychiatricTone(text: string, level: number): string {
  if (level <= 30) return text;
  if (level <= 60) return 'Attendez… ' + text;
  if (level <= 80) return 'Laissez-moi parler. ' + text;
  return 'Laissez-moi tranquille ! ' + text;
}
