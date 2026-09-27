/* COPIE DE REFERENCE — le banc d'essai du routeur.
   L'original vit dans le repertoire de travail ; cette copie est versionnee pour
   que les regles verifiees ne dependent pas d'un fichier temporaire.

   Il charge le code du noeud `Router evenement` tel qu'il sera deploye, et ne
   substitue que trois choses : le client PostgreSQL devient un magasin en
   memoire, le journal ecrit dans ce meme magasin, et $input fournit le corps de
   la requete. Tout le reste, regles de date, de statut, d'usage unique et de
   cloture comprises, est le code de production.

   Usage : placer le code du noeud dans routeur_patch.js a cote, puis
     node test_routeur.js

   ATTENTION : routeur_patch.js porte le mot de passe PostgreSQL en clair, comme
   tout le code du noeud. Il ne doit jamais etre commite — le depot est public.
   Il est pour cela ignore par git, voir .gitignore.
*/
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, 'routeur_patch.js');
/* Le noeud est enregistre avec des fins de ligne Windows : on les retire avant
   toute substitution, sinon les motifs ancres sur une fin de ligne ne trouvent
   rien, et le banc testerait autre chose que le code deploye. */
const CR = String.fromCharCode(13);
let source = fs.readFileSync(SRC, 'utf8').split(CR).join('');

source = source
  .replace("const { Client } = require('pg');", '')
  .replace(/const PG_CONFIG = \{[^}]*\};/, '')
  .replace(/async function readJSON\(name, fallback\) \{[\s\S]*?\n\}\n/,
    "async function readJSON(name, fallback) {\n" +
    "  const key = name.replace(/\\.json$/, '');\n" +
    "  return Object.prototype.hasOwnProperty.call(MAGASIN, key)\n" +
    "    ? JSON.parse(JSON.stringify(MAGASIN[key])) : fallback;\n}\n")
  .replace(/async function writeJSON\(name, data\) \{[\s\S]*?\n\}\n/,
    "async function writeJSON(name, data) {\n" +
    "  MAGASIN[name.replace(/\\.json$/, '')] = JSON.parse(JSON.stringify(data));\n}\n")
  /* journalise() ouvre sa propre connexion PostgreSQL : on la remplace par un
     ajout au magasin, pour que les assertions sur le journal restent vraies. */
  .replace(/async function journalise\(entree\) \{[\s\S]*?\n\}\n/,
    "async function journalise(entree) {\n" +
    "  MAGASIN.audit = (MAGASIN.audit || []).concat([entree]);\n}\n");

if (source.includes('PG_CONFIG')) throw new Error('le client PostgreSQL subsiste');

/* new Function s'evalue dans la portee globale : require doit lui etre passe,
   car le routeur s'en sert pour crypto. */
const corps = new Function('MAGASIN', '$input', 'require',
  'return (async () => {' + String.fromCharCode(10) + source + String.fromCharCode(10) + '})();');

function aujourdHui(tz) {
  return new Intl.DateTimeFormat('fr-CA', {
    timeZone: tz || 'Africa/Libreville', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

function magasinDeBase() {
  return {
    appointments: [
      { id: 'a1', visitor: 'Ada Nguema', firstName: 'Ada', lastName: 'Nguema', email: 'ada@example.com',
        company: 'Exemple SA', host: 'commercial', purpose: 'Visite technique', date: aujourdHui(),
        time: '10:00', status: 'confirme', validation_code: 'BONJOUR1', dataCenter: 'libreville',
        accessType: 'visite', teamResponses: [{ email: 'hote@example.com', available: true }] },
      { id: 'a2', visitor: 'Paul Obame', firstName: 'Paul', email: 'paul@example.com', company: 'Autre SARL',
        host: 'technique', purpose: 'Intervention', date: '2026-01-15', time: '09:00', status: 'confirme',
        validation_code: 'HIERHIER', dataCenter: 'libreville', teamResponses: [] },
      { id: 'a3', visitor: 'Lea Mba', firstName: 'Lea', email: 'lea@example.com', company: 'Trois SA',
        host: 'commercial', purpose: 'Rendez-vous', date: aujourdHui(), time: '14:00', status: 'annule',
        validation_code: 'ANNULEE1', dataCenter: 'libreville', teamResponses: [] },
      { id: 'a4', visitor: 'Marc Ella', firstName: 'Marc', email: 'marc@example.com', company: 'Quatre SA',
        host: 'technique', purpose: 'Audit', date: aujourdHui(), time: '11:00', status: 'refuse',
        validation_code: 'REFUSEE1', dataCenter: 'libreville', teamResponses: [] },
    ],
    staff: [{ id: 's1', name: 'Site Manager', email: 'sm@example.com', service: 'site_manager', dataCenter: 'libreville' }],
    visits: [],
    notifications: [],
    admin_accounts: { gabon: { password: 'motdepasse', dataCenter: 'libreville', label: 'Gabon - Libreville' } },
  };
}

async function appel(magasin, body) {
  const out = await corps(magasin, { first: () => ({ json: { body } }) }, require);
  return out[0].json;
}

const resultats = [];
function verifie(nom, condition, detail) {
  resultats.push({ nom, ok: !!condition, detail: detail || '' });
}

(async () => {
  // ---------------------------------------------------------- lecture du code
  const m = magasinDeBase();

  let r = await appel(m, { event: 'invitation_lookup', code: 'BONJOUR1' });
  verifie('code valide du jour accepte', r.httpStatus === 200 && r.response.visitor === 'Ada Nguema',
    r.httpStatus + ' ' + JSON.stringify(r.response).slice(0, 90));

  r = await appel(m, { event: 'invitation_lookup', code: 'HIERHIER' });
  verifie('code d une autre date refuse', r.httpStatus === 403 && r.response.raison === 'date',
    r.httpStatus + ' ' + (r.response.error || ''));

  r = await appel(m, { event: 'invitation_lookup', code: 'ANNULEE1' });
  verifie('code d un rendez-vous annule refuse', r.httpStatus === 403 && r.response.status === 'annule',
    r.httpStatus + ' ' + (r.response.error || ''));

  r = await appel(m, { event: 'invitation_lookup', code: 'REFUSEE1' });
  verifie('code d un rendez-vous refuse refuse', r.httpStatus === 403 && r.response.status === 'refuse',
    r.httpStatus + ' ' + (r.response.error || ''));

  r = await appel(m, { event: 'invitation_lookup', code: 'INCONNU0' });
  verifie('code inconnu toujours 404', r.httpStatus === 404, String(r.httpStatus));

  r = await appel(m, { event: 'invitation_lookup', code: '' });
  verifie('code vide toujours 400', r.httpStatus === 400, String(r.httpStatus));

  // ---------------------------------------------------------- arrivee
  r = await appel(m, { event: 'visitor_arrival_confirmed', visit: { code: 'BONJOUR1' } });
  const idVisite = r.response.visitId;
  verifie('arrivee enregistree', r.httpStatus === 200 && !!idVisite && r.response.dejaPresent === false,
    JSON.stringify(r.response).slice(0, 110));
  verifie('hote prevenu', r.emails.length === 1 && r.emails[0].to === 'hote@example.com',
    r.emails.map((e) => e.to).join(','));
  verifie('visite ouverte dans le registre',
    m.visits.length === 1 && m.visits[0].exitAt === null && m.visits[0].visitor === 'Ada Nguema',
    JSON.stringify(m.visits));

  r = await appel(m, { event: 'visitor_arrival_confirmed', visit: { code: 'BONJOUR1' } });
  verifie('seconde arrivee non dupliquee', r.response.dejaPresent === true && m.visits.length === 1,
    m.visits.length + ' visite(s)');
  verifie('pas de second courriel a l hote', r.emails.length === 0, r.emails.length + ' courriel(s)');

  r = await appel(m, { event: 'visitor_arrival_confirmed', visit: { code: 'ANNULEE1' } });
  verifie('arrivee refusee pour rendez-vous annule', r.httpStatus === 403, String(r.httpStatus));
  verifie('rendez-vous annule non ressuscite',
    m.appointments.find((a) => a.id === 'a3').status === 'annule',
    m.appointments.find((a) => a.id === 'a3').status);

  // ---------------------------------------------------------- depart
  r = await appel(m, { event: 'visitor_departure', code: 'BONJOUR1' });
  verifie('sortie enregistree',
    r.httpStatus === 200 && typeof r.response.durationMinutes === 'number' && m.visits[0].exitAt !== null,
    JSON.stringify(r.response).slice(0, 110));

  r = await appel(m, { event: 'visitor_departure', code: 'BONJOUR1' });
  verifie('seconde sortie refusee', r.httpStatus === 404, String(r.httpStatus));

  r = await appel(m, { event: 'visitor_departure', code: '' });
  verifie('sortie sans code refusee', r.httpStatus === 400, String(r.httpStatus));

  // ---------------------------------------------------------- registre
  r = await appel(m, { event: 'admin_list_visits', adminCountry: 'gabon', adminPassword: 'motdepasse' });
  verifie('registre lisible par l administrateur',
    r.httpStatus === 200 && r.response.visits.length === 1 && r.response.presents === 0,
    JSON.stringify(r.response).slice(0, 120));

  r = await appel(m, { event: 'admin_list_visits', adminCountry: 'gabon', adminPassword: 'faux' });
  verifie('registre refuse sans identifiants', r.httpStatus === 401, String(r.httpStatus));

  // ---------------------------------------------------------- usage unique
  /* Le parcours complet sur un seul code : arrivee, depart, puis tentative de
     seconde arrivee. C'est exactement le scenario du code preté ou reutilise. */
  const mu = magasinDeBase();

  r = await appel(mu, { event: 'visitor_arrival_confirmed', visit: { code: 'BONJOUR1' } });
  verifie('premiere arrivee acceptee', r.httpStatus === 200 && r.response.accepted === true, String(r.httpStatus));

  r = await appel(mu, { event: 'invitation_lookup', code: 'BONJOUR1' });
  verifie('lecture pendant la visite : en cours signalee',
    r.response.visiteEnCours && r.response.visiteTerminee === null,
    JSON.stringify({ c: !!r.response.visiteEnCours, t: r.response.visiteTerminee }));

  r = await appel(mu, { event: 'visitor_departure', code: 'BONJOUR1' });
  verifie('depart accepte', r.httpStatus === 200, String(r.httpStatus));

  r = await appel(mu, { event: 'visitor_arrival_confirmed', visit: { code: 'BONJOUR1' } });
  verifie('seconde arrivee refusee apres le depart',
    r.httpStatus === 409 && r.response.raison === 'code_epuise', r.httpStatus + ' ' + (r.response.error || ''));
  verifie('aucune seconde visite creee', mu.visits.length === 1, mu.visits.length + ' visite(s)');
  verifie('aucun courriel a l hote pour un code epuise', r.emails.length === 0, r.emails.length + ' courriel(s)');

  r = await appel(mu, { event: 'invitation_lookup', code: 'BONJOUR1' });
  verifie('lecture apres le depart : code signale epuise',
    r.httpStatus === 200 && r.response.visiteTerminee && !r.response.visiteEnCours,
    JSON.stringify(r.response.visiteTerminee));

  r = await appel(mu, { event: 'visitor_departure', code: 'BONJOUR1' });
  verifie('second depart toujours refuse', r.httpStatus === 404, String(r.httpStatus));

  /* Un code clos d'office est epuise au meme titre : sans cela, il suffisait
     d'attendre la cloture de nuit pour reutiliser son code le lendemain. */
  const mu2 = magasinDeBase();
  mu2.visits = [{ id: 'close_office', code: 'BONJOUR1', visitor: 'Ada Nguema', dataCenter: 'libreville',
    entryAt: Date.now() - 2 * 86400000, exitAt: Date.now() - 2 * 86400000 + 3600000,
    clotureConstatee: false, clotureMotif: 'automatique' }];
  r = await appel(mu2, { event: 'visitor_arrival_confirmed', visit: { code: 'BONJOUR1' } });
  verifie('code clos d office egalement epuise', r.httpStatus === 409, String(r.httpStatus));

  // ---------------------------------------------------------- cloture manuelle
  const mc = magasinDeBase();
  mc.visits = [
    { id: 'ouverte_1', code: 'BONJOUR1', visitor: 'Ada Nguema', company: 'Exemple SA',
      dataCenter: 'libreville', entryAt: Date.now() - 7200000, exitAt: null },
    { id: 'close_1', code: 'HIERHIER', visitor: 'Paul Obame', company: 'Autre SARL',
      dataCenter: 'libreville', entryAt: Date.now() - 86400000, exitAt: Date.now() - 82800000 },
  ];

  r = await appel(mc, { event: 'admin_close_visit', visitId: 'ouverte_1' });
  verifie('cloture refusee sans identifiants', r.httpStatus === 401, String(r.httpStatus));

  r = await appel(mc, { event: 'admin_close_visit', adminCountry: 'gabon', adminPassword: 'motdepasse', visitId: 'inconnue' });
  verifie('cloture d une visite inconnue refusee', r.httpStatus === 404, String(r.httpStatus));

  r = await appel(mc, { event: 'admin_close_visit', adminCountry: 'gabon', adminPassword: 'motdepasse', visitId: 'close_1' });
  verifie('cloture d une visite deja close refusee', r.httpStatus === 409, String(r.httpStatus));

  r = await appel(mc, { event: 'admin_close_visit', adminCountry: 'gabon', adminPassword: 'motdepasse', visitId: 'ouverte_1' });
  const close = mc.visits.find((v) => v.id === 'ouverte_1');
  verifie('cloture manuelle acceptee', r.httpStatus === 200 && close.exitAt, String(r.httpStatus));
  verifie('sortie marquee non constatee', close.clotureConstatee === false && close.clotureMotif === 'manuelle',
    JSON.stringify({ c: close.clotureConstatee, m: close.clotureMotif }));
  verifie('site ayant prononce la cloture note', !!close.clotureParSite, String(close.clotureParSite));

  // ---------------------------------------------------------- cloture de nuit
  const SECRET = '0e53a394825963f27883195f496927cd621e748c';
  /* Deux cas deterministes, independants de l'heure a laquelle le banc tourne :
     une visite dont le jour est clos depuis longtemps, et une dont le jour n'a
     pas encore ferme. Prendre une visite « du jour » rendrait l'essai
     dependant de l'heure de la journee. */
  const ma = magasinDeBase();
  ma.visits = [
    { id: 'demain', code: 'FUTURXX1', visitor: 'Pas Encore Venu', dataCenter: 'libreville',
      entryAt: Date.now() + 86400000, exitAt: null },
    { id: 'avant_hier', code: 'VIEUXXX1', visitor: 'Oublie Sansortie', dataCenter: 'libreville',
      entryAt: Date.now() - 2 * 86400000, exitAt: null },
  ];

  r = await appel(ma, { event: 'visits_autoclose', secret: 'mauvais' });
  verifie('cloture de nuit refusee sans le secret', r.httpStatus === 401, String(r.httpStatus));
  verifie('aucune visite touchee par l appel refuse',
    ma.visits.every((v) => v.exitAt === null), JSON.stringify(ma.visits.map((v) => v.exitAt)));

  r = await appel(ma, { event: 'visits_autoclose', secret: SECRET });
  const pasEncore = ma.visits.find((v) => v.id === 'demain');
  const vieille = ma.visits.find((v) => v.id === 'avant_hier');
  verifie('une seule visite close', r.httpStatus === 200 && r.response.closes === 1, JSON.stringify(r.response.closes));
  verifie('visite dont le jour n a pas ferme : laissee ouverte', pasEncore.exitAt === null, String(pasEncore.exitAt));
  verifie('la visite oubliee est close', !!vieille.exitAt, String(vieille.exitAt));
  verifie('cloture marquee automatique et non constatee',
    vieille.clotureMotif === 'automatique' && vieille.clotureConstatee === false,
    JSON.stringify({ m: vieille.clotureMotif, c: vieille.clotureConstatee }));
  verifie('sortie bornee a l heure de fermeture, pas a maintenant',
    vieille.exitAt < Date.now() - 86400000, new Date(vieille.exitAt).toISOString());
  verifie('le site est prevenu', r.emails.length === 1 && /close/i.test(r.emails[0].subject),
    r.emails.map((e) => e.subject).join(' | '));

  r = await appel(ma, { event: 'visits_autoclose', secret: SECRET });
  verifie('second passage sans effet', r.response.closes === 0 && r.emails.length === 0,
    JSON.stringify({ closes: r.response.closes, courriels: r.emails.length }));

  // ---------------------------------------------------------- journal d activite
  const mj = magasinDeBase();
  mj.visits = [{ id: 'j_ouverte', code: 'BONJOUR1', visitor: 'Ada Nguema', dataCenter: 'libreville',
    entryAt: Date.now() - 3600000, exitAt: null }];
  const AUTH = { adminCountry: 'gabon', adminPassword: 'motdepasse' };

  r = await appel(mj, { event: 'admin_list_appointments', ...AUTH });
  verifie('une actualisation ne remplit pas le journal', (mj.audit || []).length === 0,
    (mj.audit || []).length + ' entree(s)');

  r = await appel(mj, { event: 'admin_list_appointments', ...AUTH, journaliserConnexion: true, adminEmail: 'tech@st.digital' });
  verifie('la connexion est journalisee',
    mj.audit.length === 1 && mj.audit[0].action === 'connexion' && mj.audit[0].site === 'Gabon - Libreville',
    JSON.stringify(mj.audit[0]));

  r = await appel(mj, { event: 'admin_list_appointments', adminCountry: 'gabon', adminPassword: 'faux', journaliserConnexion: true });
  verifie('un echec de connexion est journalise aussi',
    r.httpStatus === 401 && mj.audit.length === 2 && mj.audit[1].action === 'connexion_refusee',
    JSON.stringify(mj.audit[1] && mj.audit[1].action));

  r = await appel(mj, { event: 'admin_update_status', ...AUTH, id: 'a2', status: 'refuse', reason: 'Site ferme' });
  const refusJournal = mj.audit[mj.audit.length - 1];
  verifie('un refus de rendez-vous est journalise',
    refusJournal.action === 'rendez_vous_refuse' && refusJournal.cible === 'Paul Obame' && /Site ferme/.test(refusJournal.detail),
    JSON.stringify(refusJournal));

  r = await appel(mj, { event: 'admin_close_visit', ...AUTH, visitId: 'j_ouverte' });
  const clot = mj.audit[mj.audit.length - 1];
  verifie('une cloture manuelle est journalisee',
    clot.action === 'visite_close_manuellement' && /non constatee/.test(clot.detail), JSON.stringify(clot));

  r = await appel(mj, { event: 'admin_add_staff', ...AUTH, name: 'Nouveau Membre', email: 'nm@example.com', service: 'commercial' });
  const ajout = mj.audit[mj.audit.length - 1];
  verifie('un ajout a l equipe est journalise',
    ajout.action === 'membre_ajoute' && ajout.cible === 'Nouveau Membre', JSON.stringify(ajout.action));

  r = await appel(mj, { event: 'admin_list_audit', ...AUTH });
  /* Cinq actions tracees jusqu'ici : connexion, connexion refusee, refus de
     rendez-vous, cloture manuelle, ajout a l'equipe. */
  verifie('le journal est lisible par l administrateur',
    r.httpStatus === 200 && r.response.entries.length === 5,
    r.response.entries.map((e) => e.action).join(', '));
  verifie('le journal est trie du plus recent au plus ancien',
    r.response.entries[0].timestamp >= r.response.entries[r.response.entries.length - 1].timestamp, 'ordre decroissant');

  r = await appel(mj, { event: 'admin_list_audit', adminCountry: 'gabon', adminPassword: 'faux' });
  verifie('le journal est refuse sans identifiants', r.httpStatus === 401, String(r.httpStatus));

  /* Une action d'un autre site ne doit pas apparaitre, mais les taches
     automatiques, qui n'ont pas de site, restent visibles partout. */
  mj.audit.push({ id: 'x1', timestamp: Date.now(), site: 'Cameroun - Douala', pays: 'cameroun', action: 'connexion' });
  mj.audit.push({ id: 'x2', timestamp: Date.now(), site: null, pays: null, action: 'visites_closes_d_office' });
  r = await appel(mj, { event: 'admin_list_audit', ...AUTH });
  const actions = r.response.entries.map((e) => e.action);
  verifie('une action d un autre site est ecartee',
    !r.response.entries.some((e) => e.site === 'Cameroun - Douala'), 'aucune entree Douala');
  verifie('une tache automatique reste visible',
    actions.includes('visites_closes_d_office'), 'presente');

  r = await appel(mj, { event: 'admin_change_password', ...AUTH, newPassword: 'unMotDePasseLong' });
  const mdp = mj.audit[mj.audit.length - 1];
  verifie('un changement de mot de passe est journalise', mdp.action === 'mot_de_passe_change', JSON.stringify(mdp.action));
  verifie('le mot de passe n apparait pas dans le journal',
    !JSON.stringify(mj.audit).includes('unMotDePasseLong'), 'aucune occurrence');
  r = await appel(mj, { event: 'admin_list_audit', ...AUTH });
  verifie('l ancien mot de passe ne donne plus acces', r.httpStatus === 401, String(r.httpStatus));

  // ---------------------------------------------------------- courriels reparés
  const m2 = magasinDeBase();
  r = await appel(m2, { event: 'admin_update_status', adminCountry: 'gabon', adminPassword: 'motdepasse',
    id: 'a2', status: 'refuse', reason: 'Site ferme ce jour-la' });
  const refus = r.emails.find((e) => e.audience === 'visitor');
  verifie('confirmation ne leve plus de ReferenceError', r.httpStatus === 200, String(r.httpStatus));
  verifie('courriel de refus porte le bon texte',
    !!refus && /n'a pas pu &ecirc;tre confirm/.test(refus.html) && !/VOTRE CODE D'ACC/.test(refus.html),
    refus ? refus.subject : 'aucun courriel visiteur');
  verifie('motif du refus repris', !!refus && refus.html.includes('Site ferme ce jour-la'), '');

  const m3 = magasinDeBase();
  m3.appointments.push({ id: 'a5', visitor: 'Neuf Client', firstName: 'Neuf', email: 'neuf@example.com',
    company: 'Neuf SA', host: 'commercial', purpose: 'Visite', date: aujourdHui(), time: '15:00',
    status: 'en attente equipe', validation_code: null, dataCenter: 'libreville', teamResponses: [] });
  r = await appel(m3, { event: 'admin_update_status', adminCountry: 'gabon', adminPassword: 'motdepasse',
    id: 'a5', status: 'confirme' });
  const conf = r.emails.find((e) => e.audience === 'visitor');
  verifie('courriel de confirmation emis', r.httpStatus === 200 && !!conf, String(r.httpStatus));
  verifie('code et QR presents dans la confirmation',
    !!conf && /VOTRE CODE D'ACC/.test(conf.html) && conf.html.includes('<table') && !conf.html.includes('undefined'),
    conf ? conf.subject : '');

  // ---------------------------------------------------------- restitution
  let ko = 0;
  resultats.forEach((x) => {
    if (!x.ok) ko++;
    console.log((x.ok ? '  ok   ' : '  ECHEC') + '  ' + x.nom + (x.detail ? '   [' + x.detail + ']' : ''));
  });
  console.log('\n' + (resultats.length - ko) + '/' + resultats.length + ' verifications passees');
  process.exit(ko ? 1 : 0);
})().catch((e) => { console.error('ERREUR DU BANC :', e); process.exit(2); });
