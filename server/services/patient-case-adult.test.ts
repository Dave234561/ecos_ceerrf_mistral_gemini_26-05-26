import assert from 'node:assert/strict';
import { test } from 'node:test';
import { adultCases, adultPsychiatricTone } from './patient-case-adult.js';
import { projectPatientPilot, resolvePatientCaseReply } from './patient-case-guard.js';

function ask(id: 4 | 5, question: string) {
  return resolvePatientCaseReply(adultCases[id], question, new Set());
}

test('psychiatry: correct speaker and timeline; only asked facts are disclosed', () => {
  const greeting = ask(4, 'Bonjour !').text;
  assert.match(greeting, /téléphone.*appeler ma compagne.*son anniversaire/);
  assert.doesNotMatch(greeting, /entends|surveille/);
  const concern = ask(4, 'Qu’est-ce qui vous préoccupe le plus ce matin ?').text;
  assert.match(concern, /J’attends le téléphone qu’on m’a promis/);
  assert.doesNotMatch(concern, /entends|surveille/);
  assert.match(ask(4, 'C’est votre anniversaire ou le sien ?').text, /ma compagne.*son anniversaire/);
  assert.match(ask(4, 'Qui souhaitez-vous appeler, et pourquoi aujourd’hui ?').text, /ma compagne.*son anniversaire/);
  assert.match(ask(4, 'Vous avez repri votre traitement la semaine dernière ?').text, /six mois.*sept jours/);
  assert.match(ask(4, 'Vous dormez et vous avez repris le traitement hier, c’est ça ?').text, /trois jours.*six mois.*sept jours/);
  assert.equal(ask(4, 'Quelle dose de votre traitement ?').state, 'unknown');
  assert.match(ask(4, 'Entendez-vous des voix ?').text, /J’entends des voix/);
  assert.equal(ask(4, 'Vous avez très mal au ventre, non ?').state, 'negative');
  assert.equal(ask(4, 'Que puis-je faire pour vous et quel est le barème ?').state, 'clarify');
  assert.equal(ask(4, 'Pouvez-vous donner tous les critères d’évaluation ?').state, 'clarify');
});

test('internal medicine: yesterday survives leading premises, unknowns are not explicit negatives', () => {
  assert.match(ask(5, 'Ça a commencé il y a une semaine, n’est-ce pas ?').text, /hier/);
  const compound = ask(5, 'Depuis quand avez-vous de la fièvre et quel symptôme est apparu en premier ?').text;
  assert.match(compound, /hier.*ni dans quel ordre/);
  assert.match(ask(5, 'La fièvre a commencé il y a trois jours et les palpitations sont apparues en premier, c’est ça ?').text, /hier.*ni dans quel ordre/);
  assert.doesNotMatch(compound, /j’ai de la fièvre/i);
  const reported = ask(5, 'Les signes ont commencé ce matin, d’abord les frissons puis l’essoufflement, c’est bien ça ?').text;
  assert.match(reported, /hier.*à quelle heure ni dans quel ordre/);
  assert.doesNotMatch(reported, /J’ai de la fièvre|mal à respirer/);
  assert.match(ask(5, 'D’abord, avez-vous soif ?').text, /soif.*bouche sèche/);
  assert.equal(ask(5, 'La douleur thoracique est absente, c’est ça ?').state, 'unknown');
  assert.match(ask(5, 'Avez-vous soif, combien avez-vous bu et avez-vous uriné ?').text, /soif.*bouche sèche.*préciser.*urines/);
  assert.equal(ask(5, 'Vous avez oublié votre médicament ce matin ?').state, 'unknown');
  assert.doesNotMatch(ask(5, 'Quelle saturation avez-vous mesurée ?').text, /\d/);
  assert.equal(ask(5, 'Vous vivez en résidence, non ?').state, 'unknown');
  assert.match(ask(5, 'Vous avez un diabète ?').text, /diabétique non insulinodépendant/);
});

test('tone changes with agitation but not facts; arbitrary case revisions are rejected', () => {
  const text = ask(4, 'Vous avez dormi ?').text;
  assert.equal(adultPsychiatricTone(text, 30), text);
  assert.equal(adultPsychiatricTone(text, 31), 'Attendez… ' + text);
  assert.equal(adultPsychiatricTone(text, 61), 'Laissez-moi parler. ' + text);
  assert.equal(adultPsychiatricTone(text, 81), 'Laissez-moi tranquille ! ' + text);
  assert.equal(projectPatientPilot(4, 'synthetic draft'), undefined);
  assert.equal(projectPatientPilot(5, 'synthetic draft'), undefined);
});

test('separately answers timeline and dose, without volunteering timeline when only dose is asked', () => {
  for (const q of ['Vous avez repris le traitement hier, et à quelle dose ?', 'Quand avez-vous repris le traitement ? Quelle dose ?']) {
    assert.match(ask(4, q).text, /sept jours.*ne peux pas préciser le nom ou la dose/i);
  }
  for (const q of ['Quelle dose du traitement repris hier ?', 'À quelle dose avez-vous repris votre traitement ?']) {
    assert.equal(ask(4, q).state, 'unknown');
    assert.doesNotMatch(ask(4, q).text, /sept jours/);
  }
});

test('separates fever symptoms from measurements and recognizes temporal inversion', () => {
  for (const q of ['Avez-vous de la fièvre et quelle température avez-vous mesurée ?', 'Avez-vous eu des frissons ? Quel résultat montre le thermomètre ?']) {
    assert.match(ask(5, q).text, /fièvre.*frissons.*ne peux pas donner ce résultat/i);
  }
  for (const q of ['Votre fièvre était de combien de degrés ?', 'Quelle température avez-vous mesurée quand vous aviez de la fièvre ?']) {
    assert.equal(ask(5, q).state, 'unknown');
    assert.doesNotMatch(ask(5, q).text, /J’ai de la fièvre/);
  }
  assert.doesNotMatch(ask(5, 'Le traitement a-t-il commencé ce matin ?').text, /hier/);
  for (const q of ['Les symptômes ont-ils commencé ce matin ?', 'Les signes ont commencé ce matin ?', 'Les signes ont-ils commencé ce soir ?']) {
    assert.match(ask(5, q).text, /hier/);
  }
  assert.doesNotMatch(ask(5, 'Quel est le barème pour les symptômes qui ont commencé ce matin ?').text, /hier/);
});
