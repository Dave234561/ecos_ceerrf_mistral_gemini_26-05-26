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
};
export type PatientCase = {
  scenarioId: number;
  sourceDigest: string;
  opening: string;
  clarify: string;
  slots: readonly Slot[];
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
  const candidates = patientCase.slots.filter(slot => slot.topics.some(topic => {
    const label = words(topic);
    return label !== '  ' && normalized.includes(label);
  }));
  if (candidates.length === 0 && /^(bonjour|bonsoir|salut)[. !]*$/i.test(question.trim())) {
    return { text: patientCase.opening, state: 'opening' };
  }
  const looksLikeQuestion = question.includes('?') ||
    / (quel(?:le|s|les)?|combien|comment|quand|est ce que|avez vous|a t il|y a t il|depuis quand|pouvez vous) /.test(normalized);
  if (!looksLikeQuestion || candidates.length !== 1) return { text: patientCase.clarify, state: 'clarify' };

  const { id, answer, after } = candidates[0];
  if (after && !revealed.has(after)) return { text: patientCase.clarify, state: 'withheld' };
  return { text: answer.text, state: answer.state, ...(answer.state !== 'unknown' ? { slotId: id } : {}) };
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
  const known = (id: string, topics: readonly string[], text: string): Slot =>
    ({ id, topics, answer: { state: 'known', text } });
  const negative = (id: string, topics: readonly string[], text: string): Slot =>
    ({ id, topics, answer: { state: 'negative', text } });
  const unknown = (id: string, topics: readonly string[]): Slot =>
    ({ id, topics, answer: { state: 'unknown', text: 'Je ne peux pas vous le préciser.' } });

  return {
    ...PILOT_SOURCE,
    opening: `Bonjour. Je suis la ${fragment(0, 9, 19)} et je suis inquiète.`,
    clarify: 'Pouvez-vous me poser une question plus précise ?',
    slots: [
      known('identity', ['qui êtes vous', 'comment il s appelle', 'prénom', 'âge', 'combien de mois'], `Je suis la ${fragment(0, 9, 19)}. Il a ${fragment(0, 34, 49)}.`),
      known('fever', ['fièvre', 'fébrile', 'depuis combien de jours', 'depuis quand a t il de la fièvre', 'raison de votre venue', 'qu est ce qui vous amène', 'pourquoi êtes vous venue'], `Il a de la fièvre depuis ${fragment(0, 95, 102)}. Elle est forte.`),
      known('mood', ['grognon', 'humeur', 'irritable', 'grincheux'], `Il est ${fragment(0, 104, 111)}.`),
      known('ears', ['frotte', 'frotté', 'touche les oreilles', 'se touche les oreilles', 'se frotte les oreilles'], `Il ${fragment(4, 13, 35)}.`),
      known('food', ['appétit', 'manger', 'mange', 'alimentation', 'mangé'], `J’ai remarqué une ${fragment(0, 118, 141)}. Il a du mal à manger.`),
      negative('vomiting', ['vomir', 'vomi', 'vomissement', 'vomissements'], 'Non, il n’a pas vomi.'),
      known('cold', ['rhume', 'enrhumé'], `Il a eu un ${fragment(5, 11, 31)}.`),
      negative('history', ['antécédent', 'antécédents', 'opéré', 'opération', 'chirurgical', 'chirurgicaux'], `Il n’a pas d’${fragment(6, 13, 49)}.`),
      known('vaccines', ['vaccins', 'vaccin', 'vaccination', 'vacciné'], `Ses ${fragment(6, 51, 58)} sont ${fragment(6, 59, 66)}`),
      known('medicine', ['doliprane', 'paracétamol', 'médicament', 'traitement donné'], `Je lui ai donné du ${fragment(7, 15, 24)}${fragment(7, 24, 46)}`),
      unknown('temperature', ['température', 'combien de degrés', 'thermomètre']),
      unknown('earDetail', ['oreille droite', 'oreille gauche', 'quelle oreille', 'depuis quand a t il mal', 'otorrhée', 'écoulement', 'coule']),
      unknown('hydration', ['boit', 'boire', 'bu', 'urines', 'urine', 'pipi', 'couches', 'hydratation']),
      unknown('dose', ['dose', 'dosage', 'heure', 'dernière prise', 'combien de fois']),
      unknown('alertness', ['somnolent', 'somnolence', 'éveil', 'difficile à réveiller', 'réactif']),
      unknown('clinical', ['diagnostic', 'otite', 'otoscope', 'tympan', 'antibiotique', 'antibiotiques', 'prescrivez']),
    ],
  };
}
