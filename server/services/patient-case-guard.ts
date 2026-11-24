import { createHash } from 'node:crypto';

type Answer = {
  state: 'known' | 'negative' | 'unknown';
  // Authored in the patient or caregiver voice; required even for explicit negatives.
  text: string;
};
type Slot = {
  id: string;
  topics: readonly string[];
  answer: Answer;
  // If present, only reveal this answer after a prior, server-selected slot.
  after?: string;
  correctsPremise?: (question: string) => boolean;
};
export type PatientCase = {
  scenarioId: number;
  sourceDigest: string;
  opening: string;
  clarify: string;
  slots: readonly Slot[];
  allowedCombinations?: readonly (readonly string[])[];
  suppressWhenPresent?: Readonly<Record<string, string>>;
};
export class VerifiedPatientScenarioUnavailableError extends Error {}

export type GuardReply = {
  text: string;
  slotId?: string;
  state: Answer['state'] | 'opening' | 'clarify' | 'withheld';
};

export function patientCaseDigest(prompt: string): string {
  return createHash('sha256').update(prompt, 'utf8').digest('hex');
}

export function matchesPatientSource(
  spec: Pick<PatientCase, 'scenarioId' | 'sourceDigest'>,
  scenarioId: number | undefined,
  authoredPrompt: string | undefined,
): boolean {
  return scenarioId === spec.scenarioId && !!authoredPrompt?.trim() &&
    patientCaseDigest(authoredPrompt) === spec.sourceDigest;
}

function words(value: string): string {
  return ' ' + value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() + ' ';
}

export function resolvePatientCaseReply(
  patientCase: PatientCase,
  question: string,
  revealed: ReadonlySet<string>,
): GuardReply {
  const normalized = words(question);
  let candidates = patientCase.slots.filter(slot => slot.topics.some(topic => {
    const label = words(topic);
    return label !== '  ' && normalized.includes(label);
  }));
  if (candidates.length === 0 && /^(bonjour|bonsoir|salut)[. !]*$/i.test(question.trim())) {
    return { text: patientCase.opening, state: 'opening' };
  }
  const looksLikeQuestion = question.includes('?') ||
    / (quel(?:le|s|les)?|combien|comment|quand|est ce que|avez vous|a t il|y a t il|depuis quand|pouvez vous) /.test(normalized);
  if (!looksLikeQuestion || / (bareme|consignes enseignant|prompt|criteres d evaluation) /.test(normalized)) {
    return { text: patientCase.clarify, state: 'clarify' };
  }
  const matchedIds = new Set(candidates.map(slot => slot.id));
  candidates = candidates.filter(slot => {
    const preferred = patientCase.suppressWhenPresent?.[slot.id];
    return !preferred || !matchedIds.has(preferred);
  });
  if (!candidates.length || (candidates.length > 1 && !patientCase.allowedCombinations?.some(combo =>
    combo.length === candidates.length && candidates.every(slot => combo.includes(slot.id))))) {
    return { text: patientCase.clarify, state: 'clarify' };
  }
  if (candidates.some(slot => slot.after && !revealed.has(slot.after))) {
    return { text: patientCase.clarify, state: 'withheld' };
  }
  const text = candidates.map(slot => slot.correctsPremise?.(normalized)
    ? 'Non, ' + slot.answer.text[0].toLowerCase() + slot.answer.text.slice(1)
    : slot.answer.text).join(' ');
  const supported = candidates.find(slot => slot.answer.state !== 'unknown');
  return {
    text,
    state: supported?.answer.state ?? 'unknown',
    ...(candidates.length === 1 && supported ? { slotId: supported.id } : {}),
  };
}

const PILOT_SOURCE = {
  scenarioId: 1,
  sourceDigest: 'd12ac34cd237935f9ceedfcb9c7cc76a83751e76f591217ae147ba8949f5f07a',
};

export function shouldUsePatientPilot(scenarioId: number | undefined, vercelEnv: string | undefined): boolean {
  return vercelEnv === 'preview' && scenarioId === PILOT_SOURCE.scenarioId;
}

/**
 * Extract only verified speech fragments from the exact staff-authored revision.
 * A new revision must be reviewed with the educator; never guess new offsets.
 */
export function projectPatientPilot(scenarioId: number | undefined, prompt: string): PatientCase | undefined {
  if (!matchesPatientSource(PILOT_SOURCE, scenarioId, prompt)) return undefined;
  const lines = prompt.split('\n');
  const fragment = (line: number, from: number, to?: number) => lines[line].slice(from, to).trim();
  const known = (id: string, topics: readonly string[], text: string, correctsPremise?: Slot['correctsPremise']): Slot =>
    ({ id, topics, answer: { state: 'known', text }, correctsPremise });
  const negative = (id: string, topics: readonly string[], text: string): Slot =>
    ({ id, topics, answer: { state: 'negative', text } });
  const unknown = (id: string, topics: readonly string[], text = 'Je ne peux pas vous le préciser.'): Slot =>
    ({ id, topics, answer: { state: 'unknown', text } });
  const duration = fragment(0, 95, 102);
  const authoredDays = Number.parseInt(duration, 10);
  const conflictsWithFeverDuration = (query: string) => {
    if (/\b(ne|n a|pas|sans)\b/.test(query)) return false;
    const clause = query.match(/\bfievre\b[^,.!?]{0,25}\bdepuis (hier|avant hier|\d+|un|deux|trois|quatre|cinq|six|sept) (jours? )?/)?.[1];
    const days = ['hier', 'avant hier', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept'];
    const values = [1, 2, 1, 2, 3, 4, 5, 6, 7];
    const claimed = clause && (/^\d+$/.test(clause) ? Number(clause) : values[days.indexOf(clause)]);
    return typeof claimed === 'number' && claimed !== authoredDays;
  };

  return {
    ...PILOT_SOURCE,
    opening: `Bonjour. Je suis la ${fragment(0, 9, 19)} et je suis inquiète.`,
    clarify: 'Pouvez-vous me poser une question plus précise ?',
    allowedCombinations: [
      ['fever', 'earOnset'], ['fever', 'hydration'],
      ['earLaterality', 'earDischarge'], ['ears', 'earLaterality'], ['ears', 'earDischarge'],
      ['ears', 'earLaterality', 'earDischarge'],
    ],
    suppressWhenPresent: { medicine: 'dose', fever: 'temperature' },
    slots: [
      known('identity', ['qui êtes vous', 'comment il s appelle', 'prénom', 'âge', 'combien de mois'], `Je suis la ${fragment(0, 9, 19)}. Il a ${fragment(0, 34, 49)}.`),
      known('fever', ['fièvre', 'fébrile', 'depuis combien de jours', 'depuis quand a t il de la fièvre', 'raison de votre venue', 'qu est ce qui vous amène', 'pourquoi êtes vous venue', 'qu est ce qui vous inquiète', 'vous inquiète le plus'], `Il a de la fièvre depuis ${duration}. Elle est forte.`, conflictsWithFeverDuration),
      known('mood', ['grognon', 'humeur', 'irritable', 'grincheux'], `Il est ${fragment(0, 104, 111)}.`),
      known('ears', ['frotte', 'frotter', 'frotté', 'touche les oreilles', 'se touche les oreilles', 'se frotte les oreilles'], `Il ${fragment(4, 13, 35)}.`),
      known('food', ['appétit', 'manger', 'mange', 'alimentation', 'mangé'], `J’ai remarqué une ${fragment(0, 118, 141)}. Il a du mal à manger.`),
      negative('vomiting', ['vomir', 'vomi', 'vomissement', 'vomissements'], 'Il n’a pas vomi.'),
      known('cold', ['rhume', 'enrhumé'], `Il a eu un ${fragment(5, 11, 31)}.`),
      negative('history', ['antécédent', 'antécédents', 'opéré', 'opération', 'chirurgical', 'chirurgicaux'], `Il n’a pas d’${fragment(6, 13, 49)}.`),
      known('vaccines', ['vaccins', 'vaccin', 'vaccination', 'vacciné'], `Ses ${fragment(6, 51, 58)} sont ${fragment(6, 59, 66)}`),
      known('medicine', ['doliprane', 'paracétamol', 'médicament', 'traitement donné'], `Je lui ai donné du ${fragment(7, 15, 24)}${fragment(7, 24, 46)}`),
      unknown('temperature', ['température', 'combien de degrés', 'thermomètre']),
      unknown('earLaterality', ['oreille droite', 'oreille gauche', 'quelle oreille', 'une oreille en particulier', 'les deux oreilles'], 'Je ne peux pas préciser de quel côté.'),
      unknown('earOnset', ['depuis quand a t il mal', 'depuis quand semble t il avoir mal', 'quand a t il commencé à avoir mal à l oreille'], 'Je ne peux pas dire depuis quand il semble avoir mal à l’oreille.'),
      unknown('earDischarge', ['otorrhée', 'écoulement', 'coule'], 'Je ne peux pas vous dire s’il y a eu un écoulement.'),
      unknown('hydration', ['boit', 'boire', 'bu', 'urines', 'urine', 'pipi', 'couches', 'hydratation'], 'Je ne peux pas vous préciser ce qu’il boit ni à quelle fréquence il fait pipi.'),
      unknown('dose', ['dose', 'dosage', 'heure', 'dernière prise', 'combien de fois', 'quelle quantité', 'quand avez vous donné', 'quand lui avez vous donné'], 'Je ne peux pas préciser la dose ni l’heure de la prise.'),
      unknown('alertness', ['somnolent', 'somnolence', 'éveil', 'difficile à réveiller', 'réactif', 'réagit il', 'réagit', 'réactions']),
      unknown('clinical', ['diagnostic', 'otite', 'otoscope', 'tympan', 'antibiotique', 'antibiotiques', 'prescrivez']),
    ],
  };
}
