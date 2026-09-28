/* Banc d'essai du routeur, hors n8n et hors PostgreSQL.
   Le code du noeud est charge tel quel, avec trois seules substitutions :
   le client PostgreSQL devient un magasin en memoire, et $input fournit le
   corps de la requete. Tout le reste, y compris les regles de date et de
   statut, est le code qui sera deploye. */
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

  // ---------------------------------------------------------- comptes nominatifs
  const mn = magasinDeBase();
  const ADMIN = { adminCountry: 'gabon', adminPassword: 'motdepasse' };
  /* Des mots de passe qui passent le controle de robustesse : assez longs, sans
     mot courant, sans suite, et sans reprendre le nom de la personne. */
  const MDP_SOLIDE = 'Vr7-tulipe-orage';
  const MDP_AUTRE = 'Bq4-cedre-fauve';

  /* Ce que fera l'equipe : le mot de passe partage sert UNE fois, a poser le
     premier administrateur, et les comptes suivants se creent avec lui. */
  async function amorceAdmin(magasin, nom, email) {
    await appel(magasin, { event: 'admin_add_user', ...ADMIN, nom, email, password: MDP_SOLIDE });
    const rep = await appel(magasin, { event: 'admin_login', email, password: MDP_SOLIDE });
    return rep.response.sessionToken;
  }

  /* Le premier compte se cree avec le compte partage : sans ce repli, personne
     ne pourrait installer les comptes nominatifs. */
  r = await appel(mn, { event: 'admin_add_user', ...ADMIN,
    nom: 'Ambre Mengue', email: 'Ambre.Mengue@ST.digital', password: MDP_SOLIDE, role: 'administrateur' });
  verifie('premier compte cree depuis le compte partage', r.httpStatus === 200 && r.response.accepted,
    r.httpStatus + ' ' + JSON.stringify(r.response).slice(0, 80));

  const enregistre = mn.admin_users[0];
  verifie('le mot de passe n est pas stocke en clair',
    !JSON.stringify(mn.admin_users).includes(MDP_SOLIDE), 'aucune occurrence');
  verifie('une empreinte et un sel sont poses',
    !!enregistre.empreinte && !!enregistre.sel && enregistre.empreinte.length === 64,
    'empreinte de ' + (enregistre.empreinte || '').length + ' caracteres');

  /* A partir d'ici, le mot de passe partage a epuise son role : les comptes
     suivants se creent avec le compte nominatif qu'il vient de poser. */
  const jetonMn = (await appel(mn, { event: 'admin_login',
    email: 'ambre.mengue@st.digital', password: MDP_SOLIDE })).response.sessionToken;

  r = await appel(mn, { event: 'admin_add_user', sessionToken: jetonMn,
    nom: 'Court', email: 'court@st.digital', password: 'trop', role: 'accueil' });
  verifie('mot de passe trop court refuse', r.httpStatus === 400, String(r.httpStatus));

  r = await appel(mn, { event: 'admin_add_user', sessionToken: jetonMn,
    nom: 'Doublon', email: 'AMBRE.MENGUE@st.digital', password: MDP_AUTRE, role: 'accueil' });
  verifie('adresse deja prise refusee, casse ignoree', r.httpStatus === 409, String(r.httpStatus));

  // --- connexion
  r = await appel(mn, { event: 'admin_login', email: 'ambre.mengue@st.digital', password: MDP_SOLIDE });
  const jeton = r.response.sessionToken;
  verifie('connexion nominative acceptee', r.httpStatus === 200 && !!jeton, String(r.httpStatus));
  verifie('la reponse ne contient ni empreinte ni sel',
    !JSON.stringify(r.response).match(/empreinte|sel"/), 'aucun secret renvoye');
  verifie('la connexion est journalisee au nom de la personne',
    mn.audit.some((e) => e.action === 'connexion' && e.auteur === 'Ambre Mengue'),
    JSON.stringify(mn.audit[mn.audit.length - 1]));

  r = await appel(mn, { event: 'admin_list_visits', sessionToken: jeton });
  verifie('le jeton authentifie les autres appels', r.httpStatus === 200, String(r.httpStatus));

  r = await appel(mn, { event: 'admin_list_visits', sessionToken: 'jeton-invente' });
  verifie('un jeton invente est refuse', r.httpStatus === 401, String(r.httpStatus));

  // --- une action portee au journal nomme son auteur
  r = await appel(mn, { event: 'admin_update_status', sessionToken: jeton, id: 'a2', status: 'annule' });
  const derniere = mn.audit[mn.audit.length - 1];
  verifie('l action est attribuee a la personne',
    derniere.auteur === 'Ambre Mengue' && derniere.action === 'rendez_vous_annule',
    JSON.stringify({ a: derniere.auteur, act: derniere.action }));

  // --- limitation des tentatives
  const mb = magasinDeBase();
  const jetonMb = await amorceAdmin(mb, 'Chef Site', 'chef@st.digital');
  await appel(mb, { event: 'admin_add_user', sessionToken: jetonMb,
    nom: 'Cible', email: 'cible@st.digital', password: MDP_SOLIDE, role: 'accueil' });
  let dernierEchec = null;
  for (let i = 0; i < 5; i += 1) {
    dernierEchec = await appel(mb, { event: 'admin_login', email: 'cible@st.digital', password: 'faux' });
  }
  verifie('cinq echecs restent des 401', dernierEchec.httpStatus === 401, String(dernierEchec.httpStatus));
  r = await appel(mb, { event: 'admin_login', email: 'cible@st.digital', password: MDP_SOLIDE });
  verifie('le bon mot de passe est refuse apres cinq echecs',
    r.httpStatus === 429, r.httpStatus + ' ' + (r.response.error || ''));
  verifie('les echecs sont journalises',
    mb.audit.filter((e) => e.action === 'connexion_refusee').length === 5,
    mb.audit.filter((e) => e.action === 'connexion_refusee').length + ' entrees');

  // --- droits
  const md = magasinDeBase();
  const jetonMd = await amorceAdmin(md, 'Chef Site', 'chef@st.digital');
  await appel(md, { event: 'admin_add_user', sessionToken: jetonMd,
    nom: 'Agent Accueil', email: 'agent@st.digital', password: MDP_SOLIDE, role: 'accueil' });
  r = await appel(md, { event: 'admin_login', email: 'agent@st.digital', password: MDP_SOLIDE });
  const jetonAgent = r.response.sessionToken;
  r = await appel(md, { event: 'admin_add_user', sessionToken: jetonAgent,
    nom: 'X', email: 'x@st.digital', password: MDP_SOLIDE, role: 'administrateur' });
  verifie('un agent ne peut pas creer de compte', r.httpStatus === 403, String(r.httpStatus));
  r = await appel(md, { event: 'admin_list_visits', sessionToken: jetonAgent });
  verifie('un agent garde l acces au registre', r.httpStatus === 200, String(r.httpStatus));

  // --- desactivation
  const mx = magasinDeBase();
  const jetonMx = await amorceAdmin(mx, 'Chef Site', 'chef@st.digital');
  await appel(mx, { event: 'admin_add_user', sessionToken: jetonMx,
    nom: 'Partant', email: 'partant@st.digital', password: MDP_SOLIDE, role: 'accueil' });
  r = await appel(mx, { event: 'admin_login', email: 'partant@st.digital', password: MDP_SOLIDE });
  const jetonPartant = r.response.sessionToken;
  const idPartant = mx.admin_users.find((u) => u.email === 'partant@st.digital').id;
  r = await appel(mx, { event: 'admin_set_user_active', sessionToken: jetonMx, userId: idPartant, actif: false });
  verifie('desactivation acceptee', r.httpStatus === 200 && r.response.actif === false, String(r.httpStatus));
  r = await appel(mx, { event: 'admin_list_visits', sessionToken: jetonPartant });
  verifie('la session ouverte est fermee par la desactivation', r.httpStatus === 401, String(r.httpStatus));
  r = await appel(mx, { event: 'admin_login', email: 'partant@st.digital', password: MDP_SOLIDE });
  verifie('un compte desactive ne peut plus se connecter', r.httpStatus === 401, String(r.httpStatus));

  // ---------------------------------------------------------- securite des comptes

  /* Le defaut le plus grave trouve le 28/09. Le mot de passe partage du site
     est connu de toute l'equipe et a circule : s'il peut creer un compte
     nominatif d'administrateur, il fabrique un acces PERMANENT qui survivra a
     sa propre rotation, et qui aura l'air legitime dans le journal. Il ne doit
     servir qu'a poser le premier compte. */
  const ms = magasinDeBase();
  r = await appel(ms, { event: 'admin_add_user', ...ADMIN,
    nom: 'Premier Admin', email: 'premier@st.digital', password: MDP_SOLIDE, role: 'accueil' });
  verifie('le mot de passe partage cree le premier compte', r.httpStatus === 200, String(r.httpStatus));
  verifie('et ce premier compte est un administrateur, meme si on a demande accueil',
    ms.admin_users[0].role === 'administrateur', ms.admin_users[0].role);
  verifie('le journal dit que ce compte vient de l amorce, pas d une personne',
    /amorce/i.test(String(ms.admin_users[0].creePar)), String(ms.admin_users[0].creePar));

  r = await appel(ms, { event: 'admin_add_user', ...ADMIN,
    nom: 'Porte Derobee', email: 'derobee@st.digital', password: MDP_AUTRE, role: 'administrateur' });
  verifie('ESCALADE : le mot de passe partage ne cree plus rien ensuite',
    r.httpStatus === 403, r.httpStatus + ' ' + (r.response.error || ''));
  verifie('et aucun second compte n a ete ecrit', ms.admin_users.length === 1,
    ms.admin_users.length + ' compte(s)');

  const idPremier = ms.admin_users[0].id;
  r = await appel(ms, { event: 'admin_set_user_active', ...ADMIN, userId: idPremier, actif: false });
  verifie('le mot de passe partage ne peut pas non plus desactiver un compte',
    r.httpStatus === 403, String(r.httpStatus));

  /* Le mot de passe partage n avait AUCUN frein : il suffisait de frapper ici
     plutot qu a la connexion nominative pour essayer sans limite. */
  const mf = magasinDeBase();
  let dernier = null;
  for (let i = 0; i < 5; i += 1) {
    dernier = await appel(mf, { event: 'admin_list_visits', adminCountry: 'gabon', adminPassword: 'faux' });
  }
  verifie('cinq essais du mot de passe partage restent des 401', dernier.httpStatus === 401, String(dernier.httpStatus));
  r = await appel(mf, { event: 'admin_list_visits', ...ADMIN });
  verifie('FREIN : le bon mot de passe partage est refuse apres cinq echecs',
    r.httpStatus === 401, String(r.httpStatus));

  /* La comparaison en temps constant du routeur lit ses arguments en
     HEXADECIMAL. Deux mots de passe ordinaires y deviennent deux tampons vides,
     donc egaux : l authentification etait contournable avec n importe quoi.
     Cet essai garde la correction. */
  const mh = magasinDeBase();
  r = await appel(mh, { event: 'admin_list_visits', adminCountry: 'gabon', adminPassword: 'zzz-non-hexadecimal' });
  verifie('HEXADECIMAL : un mot de passe non hexadecimal ne passe pas',
    r.httpStatus === 401, String(r.httpStatus));

  /* Une longueur ne fait pas un mot de passe. */
  const mr = magasinDeBase();
  const jetonMr = await amorceAdmin(mr, 'Chef Site', 'chef@st.digital');
  const refuses = [
    ['dix zeros repetes', '0000000000'],
    ['une suite evidente', 'abcd123456789'],
    ['un mot courant', 'monMotDePasse2026'],
    ['le nom du projet', 'isaac-borne-2026'],
    ['son propre nom', 'Ada-Nguema-2026'],
  ];
  for (const [quoi, mdp] of refuses) {
    r = await appel(mr, { event: 'admin_add_user', sessionToken: jetonMr,
      nom: 'Ada Nguema', email: 'ada.nguema@st.digital', password: mdp, role: 'accueil' });
    verifie('mot de passe refuse : ' + quoi, r.httpStatus === 400, r.httpStatus + ' ' + (r.response.error || ''));
  }

  /* Changer son mot de passe ecrivait TOUJOURS le mot de passe partage du
     site, meme pour un compte nominatif. Selon ce que la personne tapait, soit
     l operation echouait sans raison comprehensible, soit elle remplacait le
     mot de passe de tout le site en croyant changer le sien. */
  const mp = magasinDeBase();
  const jetonMp = await amorceAdmin(mp, 'Ada Nguema', 'ada.nguema@st.digital');
  const partageAvant = JSON.stringify(mp.admin_accounts || null);

  r = await appel(mp, { event: 'admin_change_password', sessionToken: jetonMp,
    currentPassword: 'ce-n-est-pas-le-bon', newPassword: MDP_AUTRE });
  verifie('changer son mot de passe exige l actuel', r.httpStatus === 401, String(r.httpStatus));

  r = await appel(mp, { event: 'admin_change_password', sessionToken: jetonMp,
    currentPassword: MDP_SOLIDE, newPassword: MDP_AUTRE });
  verifie('changement accepte avec le bon mot de passe actuel', r.httpStatus === 200, String(r.httpStatus));
  verifie('MOT DE PASSE PARTAGE : il n a PAS ete touche',
    JSON.stringify(mp.admin_accounts || null) === partageAvant, 'inchange');
  r = await appel(mp, { event: 'admin_login', email: 'ada.nguema@st.digital', password: MDP_AUTRE });
  verifie('le nouveau mot de passe personnel fonctionne', r.httpStatus === 200, String(r.httpStatus));
  r = await appel(mp, { event: 'admin_login', email: 'ada.nguema@st.digital', password: MDP_SOLIDE });
  verifie('l ancien ne fonctionne plus', r.httpStatus === 401, String(r.httpStatus));
  verifie('le compte n est plus marque a changer',
    mp.admin_users[0].doitChanger === false, String(mp.admin_users[0].doitChanger));

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

  r = await appel(mj, { event: 'admin_change_password', ...AUTH, newPassword: MDP_SOLIDE });
  const mdp = mj.audit[mj.audit.length - 1];
  verifie('un changement de mot de passe est journalise', mdp.action === 'mot_de_passe_change', JSON.stringify(mdp.action));
  verifie('le mot de passe n apparait pas dans le journal',
    !JSON.stringify(mj.audit).includes(MDP_SOLIDE), 'aucune occurrence');
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
