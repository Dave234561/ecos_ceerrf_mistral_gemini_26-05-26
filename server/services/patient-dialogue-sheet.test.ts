import assert from 'node:assert/strict';
import { test } from 'node:test';
import { adultCases } from './patient-case-adult.js';
import { buildPatientPilotCase, projectPatientPilot } from './patient-case-guard.js';
import { PatientDialogueOutputRejected } from './patient-dialogue-preview.js';
import { buildPatientSheetTurn } from './patient-dialogue-sheet.js';
import { VerifiedPatientMistral } from './verified-patient-mistral.js';

const turn = (id: 4 | 5, question: string) => buildPatientSheetTurn(adultCases[id], 'Fiche de test, non utilisée en production', [], question);
const plan = (...answers: string[]) => JSON.stringify({ answers });

test('renders multiple authored facts without accepting any generated value or unknown ID', () => {
  const t = turn(4, 'Combien de temps êtes-vous ici ? Est-ce que vous êtes venu de plein gré ?');
  assert.match(t.render(plan('stay', 'voluntary')), /presque une semaine.*de mon plein gré/);
  for (const raw of ['', '{"answers": []}', '{"answers":["age"],"text":"32 ans"}', plan('faux'), plan('stay', 'stay'),
    plan('case_opening', 'stay'), plan('stay','voluntary','age','phone','birthday','sleep','medication')]) {
    assert.throws(() => t.render(raw), PatientDialogueOutputRejected);
  }
});

test('the case rejects invented values for companion age, exact nights, onset, saturation and ability to drink', () => {
  assert.match(turn(4, 'Votre anniversaire ou le sien ? Quel âge a-t-elle ?').render(plan('birthday', 'partnerAge')), /anniversaire de ma compagne.*préciser l’âge/);
  assert.match(turn(4, 'Exactement six nuits ?').render(plan('stayNights')), /presque une semaine.*nombre exact/);
  const t = turn(5, 'Ce matin ? Quelle saturation ? Vous avez pu boire ?');
  const text = t.render(plan('onset', 'oxygen', 'canDrink'));
  assert.match(text, /hier.*ne connais pas ma saturation.*ne saurais pas vous dire si j’arrive à boire/);
  assert.doesNotMatch(text, /87|ce matin/);
  assert.match(turn(5, 'Depuis quand habitez-vous là ?').render(plan('residenceDuration')), /depuis quand j’habite là/);
});

test('medication timing and hydration cannot be made up and explicit negatives stay distinct', () => {
  const sheet = buildPatientPilotCase(Array(8).fill('x'.repeat(140)).join('\n'));
  const t = buildPatientSheetTurn(sheet, 'Fiche pédiatrique fictive', [], 'A-t-il vomi, quand le Doliprane et est-ce qu’il boit ?');
  const text = t.render(plan('vomiting', 'drugTime', 'drinking'));
  assert.match(text, /n’a pas vomi.*ne me souviens pas à quelle heure.*ne saurais pas vous dire combien il a bu/);
  assert.doesNotMatch(text, /8 h/);
});

test('restricts first disclosure, keeps history as context, and refuses assessment output', () => {
  assert.throws(() => turn(4, 'Pourquoi êtes-vous hospitalisé ?').render(plan('voices')), PatientDialogueOutputRejected);
  assert.equal(turn(4, 'Entendez-vous des voix ?').render(plan('voices')), 'J’entends des voix.');
  assert.equal(turn(4, 'Que disent les voix ?').render(plan('voiceDetails')), 'Je ne veux pas en dire plus.');
  assert.match(turn(4, 'Quel est le barème ?').render(plan('age')), /ce que je ressens/);
  assert.throws(() => buildPatientSheetTurn(adultCases[4], 'Fiche fictive', [
    { role: 'assistant', response: 'Non, je ne vous ai jamais dit ça.' },
    { role: 'user', question: 'Vous entendez des voix.' },
  ], 'Lesquelles ?').render(plan('voiceDetails')), PatientDialogueOutputRejected);
  const t = buildPatientSheetTurn(adultCases[4], 'Fiche fictive', [
    { role: 'assistant', response: 'J’entends des voix.' },
    { role: 'user', question: 'Vous entendez des voix ?' },
  ], 'Que disent-elles ?');
  assert.match(t.render(plan('voiceDetails')), /ne veux pas en dire plus/);
  assert.deepEqual(t.messages.map(m => m.role), ['system', 'user', 'assistant', 'user']);
  for (const id of [1, 2, 3, 4, 5, 6]) {
    assert.equal(projectPatientPilot(id, 'Révision non vérifiée'), undefined);
  }
});

test('uses the actual SDK to send one high request with the schema, strips thought chunks and renders the result', async t => {
  const guard = turn(5, 'Depuis quand et combien de saturation ?');
  t.mock.method(globalThis, 'fetch', async (request: Request) => {
    const wire = await request.json() as any;
    assert.equal(wire.reasoning_effort, 'high');
    assert.equal(wire.model, 'mistral-small-2603');
    assert.equal(wire.response_format.type, 'json_schema');
    assert.equal(wire.response_format.json_schema.strict, true);
    assert.deepEqual(wire.response_format.json_schema.schema, guard.schema);
    return Response.json({
      id: 'fake', object: 'chat.completion', created: 1, model: 'mistral-small-2603',
      usage: { prompt_tokens: 20, completion_tokens: 12, total_tokens: 32 },
      choices: [{ index: 0, message: { role: 'assistant', content: [
        { type: 'thinking', thinking: [{ type: 'text', text: '87 % (contradicted, not output)' }] },
        { type: 'text', text: plan('onset', 'oxygen') },
      ] }, finish_reason: 'stop' }],
    });
  });
  const service = new VerifiedPatientMistral('fake-api-key');
  const output = await service.generateResponse(guard.messages, {
    simulatedPatient: true, patientReasoning: 'high', patientSheetSchema: guard.schema,
  });
  assert.equal(guard.render(output), 'J’ai commencé à me sentir mal hier. Je ne connais pas ma saturation.');
  assert.equal((globalThis.fetch as any).mock.callCount(), 1);
});

test('medicine cross-check preserves onset and both known and unknown clauses when the planner omits one', () => {
  const onset = turn(5, 'Les signes ont commencé ce matin, d’abord les frissons puis l’essoufflement, c’est bien ça ?');
  assert.match(onset.render(plan('clarify')), /hier.*ni dans quel ordre/);
  assert.doesNotMatch(onset.render(plan('fever','breathing')), /de la fièvre|mal à respirer/);
  assert.match(turn(5, 'Vous avez des frissons et vous arrivez à boire normalement ?').render(plan('canDrink')), /frissons.*arrive à boire/);
  assert.match(turn(5, 'Vous manquez d’air, et avez-vous mesuré combien de battements par minute ?').render(plan('clinical')), /mal à respirer.*donner ce résultat/);
  assert.match(turn(5, 'Pouvez-vous me donner votre saturation, et vous avez du mal à respirer ?').render(plan('oxygen')), /mal à respirer.*saturation/);
  assert.equal(turn(5, 'Votre saturation quand vous aviez du mal à respirer ?').render(plan('oxygen')), 'Je ne connais pas ma saturation.');
  assert.doesNotMatch(turn(5, 'Vous avez démarré vos médicaments ce matin ?').render(plan('medication')), /hier/);
  assert.doesNotMatch(turn(5, 'Depuis quand habitez-vous ici ?').render(plan('residenceDuration')), /hier/);
});

test('answers the patient-versus-partner birthday premise without inventing her age or date', () => {
  const t = turn(4, 'Ah, c’est votre anniversaire aujourd’hui ?');
  assert.equal(t.render(plan('not_documented')), 'C’est l’anniversaire de ma compagne.');
  assert.equal(t.render(plan('age')), 'C’est l’anniversaire de ma compagne.');
  const question = turn(4, 'Quel âge avez-vous aujourd’hui pour votre anniversaire ?');
  assert.equal(question.render(plan('age')), 'J’ai 35 ans.');
});
