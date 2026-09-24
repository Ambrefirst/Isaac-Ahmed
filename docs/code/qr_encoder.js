/* Copie de reference de l'encodeur QR embarque dans le workflow n8n
   « Isaac - Rendez-vous ». Le workflow lui-meme n'est pas versionne ici : son
   noeud de code contient des identifiants de repli en clair, et le depot est
   public. Voir docs/A_FAIRE_AVANT_MISE_EN_PRODUCTION.md, point 2.

   Verifie le 24/09/2026 : cinq codes de test encodes puis relus par un
   decodeur independant (OpenCV), cinq succes sur cinq. */

/* Encodeur QR autonome, version 1, mode octet, correction d'erreur niveau M.
   Ecrit pour ce projet afin de ne plus dependre d'un service externe : le code
   d'acces d'un datacenter n'a pas a transiter par un tiers.

   Version 1 : 21 x 21 modules, 26 mots de code au total, 16 de donnees et 10 de
   correction, un seul bloc, aucun motif d'alignement. Capacite en mode octet :
   14 caracteres, largement suffisant pour un code de 8. */

function qrMatrice(texte) {
  var N = 21;
  var octets = [];
  for (var i = 0; i < texte.length; i++) octets.push(texte.charCodeAt(i) & 0xff);
  if (octets.length > 14) throw new Error('QR version 1 : 14 caracteres maximum');

  // ---- flux binaire : mode octet (0100), longueur sur 8 bits, puis les donnees
  var bits = [];
  function pousse(valeur, taille) {
    for (var k = taille - 1; k >= 0; k--) bits.push((valeur >> k) & 1);
  }
  pousse(0x4, 4);
  pousse(octets.length, 8);
  for (var i = 0; i < octets.length; i++) pousse(octets[i], 8);

  var CAPACITE = 16 * 8;
  for (var t = 0; t < 4 && bits.length < CAPACITE; t++) bits.push(0); // terminateur
  while (bits.length % 8) bits.push(0);
  var donnees = [];
  for (var i = 0; i < bits.length; i += 8) {
    var o = 0;
    for (var k = 0; k < 8; k++) o = (o << 1) | bits[i + k];
    donnees.push(o);
  }
  var bourrage = [0xec, 0x11], b = 0;
  while (donnees.length < 16) donnees.push(bourrage[b++ % 2]);

  // ---- correction d'erreur : Reed-Solomon sur GF(256)
  var EXP = new Array(512), LOG = new Array(256);
  for (var i = 0, x = 1; i < 255; i++) {
    EXP[i] = x; LOG[x] = i;
    x <<= 1; if (x & 0x100) x ^= 0x11d;
  }
  for (var i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
  function mul(a, b) { return a && b ? EXP[LOG[a] + LOG[b]] : 0; }

  var gen = [1];
  for (var d = 0; d < 10; d++) {
    var suivant = new Array(gen.length + 1).fill(0);
    for (var i = 0; i < gen.length; i++) {
      suivant[i] ^= gen[i];
      suivant[i + 1] ^= mul(gen[i], EXP[d]);
    }
    gen = suivant;
  }

  var reste = donnees.concat(new Array(10).fill(0));
  for (var i = 0; i < 16; i++) {
    var facteur = reste[i];
    if (!facteur) continue;
    for (var j = 0; j < gen.length; j++) reste[i + j] ^= mul(gen[j], facteur);
  }
  var correction = reste.slice(16);
  var mots = donnees.concat(correction); // 26 mots

  // ---- grille et motifs fixes
  var m = [], reserve = [];
  for (var r = 0; r < N; r++) { m.push(new Array(N).fill(0)); reserve.push(new Array(N).fill(0)); }

  function chercheur(lr, lc) {
    for (var r = -1; r <= 7; r++) for (var c = -1; c <= 7; c++) {
      var rr = lr + r, cc = lc + c;
      if (rr < 0 || rr >= N || cc < 0 || cc >= N) continue;
      var noir = (r >= 0 && r <= 6 && (c === 0 || c === 6)) ||
                 (c >= 0 && c <= 6 && (r === 0 || r === 6)) ||
                 (r >= 2 && r <= 4 && c >= 2 && c <= 4);
      m[rr][cc] = noir ? 1 : 0;
      reserve[rr][cc] = 1;
    }
  }
  chercheur(0, 0); chercheur(0, N - 7); chercheur(N - 7, 0);

  for (var i = 8; i < N - 8; i++) {
    var v = (i % 2 === 0) ? 1 : 0;
    m[6][i] = v; reserve[6][i] = 1;
    m[i][6] = v; reserve[i][6] = 1;
  }
  m[N - 8][8] = 1; reserve[N - 8][8] = 1; // module sombre

  // zones reservees a l'information de format
  for (var i = 0; i <= 8; i++) { if (!reserve[8][i]) reserve[8][i] = 1; if (!reserve[i][8]) reserve[i][8] = 1; }
  for (var i = N - 8; i < N; i++) { reserve[8][i] = 1; reserve[i][8] = 1; }

  // ---- placement des donnees en zigzag depuis le coin bas droit
  function place(masque) {
    var g = m.map(function (l) { return l.slice(); });
    var bitIndex = 0, montant = true;
    for (var col = N - 1; col > 0; col -= 2) {
      if (col === 6) col--; // la colonne de synchronisation est sautee
      for (var pas = 0; pas < N; pas++) {
        var row = montant ? N - 1 - pas : pas;
        for (var d = 0; d < 2; d++) {
          var c = col - d;
          if (reserve[row][c]) continue;
          var bit = 0;
          if (bitIndex < mots.length * 8) {
            bit = (mots[bitIndex >> 3] >> (7 - (bitIndex & 7))) & 1;
          }
          bitIndex++;
          if (estMasque(masque, row, c)) bit ^= 1;
          g[row][c] = bit;
        }
      }
      montant = !montant;
    }
    return g;
  }

  function estMasque(k, r, c) {
    switch (k) {
      case 0: return (r + c) % 2 === 0;
      case 1: return r % 2 === 0;
      case 2: return c % 3 === 0;
      case 3: return (r + c) % 3 === 0;
      case 4: return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0;
      case 5: return ((r * c) % 2) + ((r * c) % 3) === 0;
      case 6: return (((r * c) % 2) + ((r * c) % 3)) % 2 === 0;
      default: return (((r + c) % 2) + ((r * c) % 3)) % 2 === 0;
    }
  }

  // ---- information de format : niveau M (00) + masque, BCH(15,5)
  function poseFormat(g, masque) {
    var donneesFmt = (0 << 3) | masque; // 00 = niveau M
    var v = donneesFmt << 10;
    for (var i = 4; i >= 0; i--) if (v & (1 << (i + 10))) v ^= 0x537 << i;
    var fmt = ((donneesFmt << 10) | v) ^ 0x5412;
    // Les modules recoivent les bits du poids fort vers le poids faible : bit 14
    // en premier. L'ordre inverse produit une matrice coherente avec elle-meme
    // mais qu'aucun lecteur standard n'accepte.
    function bitFmt(i) { return (fmt >> (14 - i)) & 1; }
    for (var i = 0; i <= 5; i++) g[8][i] = bitFmt(i);
    g[8][7] = bitFmt(6);
    g[8][8] = bitFmt(7);
    g[7][8] = bitFmt(8);
    for (var i = 9; i <= 14; i++) g[14 - i][8] = bitFmt(i);
    // Deuxieme copie : bits 0 a 6 en colonne 8 (lignes N-1 a N-7), puis bits 7 a 14
    // en ligne 8 (colonnes N-8 a N-1). Le module sombre occupe (N-8, 8) et ne fait
    // pas partie du format : le decalage d'un cran ici rendait le code illisible.
    for (var i = 0; i <= 6; i++) g[N - 1 - i][8] = bitFmt(i);
    for (var i = 7; i <= 14; i++) g[8][N - 15 + i] = bitFmt(i);
    g[N - 8][8] = 1;
    return g;
  }

  // ---- penalites, pour retenir le masque le plus lisible
  function penalite(g) {
    var p = 0, i, j, k;
    for (i = 0; i < N; i++) {
      for (var sens = 0; sens < 2; sens++) {
        var precedent = -1, serie = 0;
        for (j = 0; j < N; j++) {
          var v = sens ? g[j][i] : g[i][j];
          if (v === precedent) { serie++; if (serie === 5) p += 3; else if (serie > 5) p += 1; }
          else { precedent = v; serie = 1; }
        }
      }
    }
    for (i = 0; i < N - 1; i++) for (j = 0; j < N - 1; j++) {
      var s = g[i][j] + g[i][j + 1] + g[i + 1][j] + g[i + 1][j + 1];
      if (s === 0 || s === 4) p += 3;
    }
    var motif = [1, 0, 1, 1, 1, 0, 1];
    for (i = 0; i < N; i++) for (j = 0; j < N - 6; j++) {
      var okL = true, okC = true;
      for (k = 0; k < 7; k++) {
        if (g[i][j + k] !== motif[k]) okL = false;
        if (g[j + k][i] !== motif[k]) okC = false;
      }
      if (okL) p += 40;
      if (okC) p += 40;
    }
    var noirs = 0;
    for (i = 0; i < N; i++) for (j = 0; j < N; j++) noirs += g[i][j];
    var pct = (noirs * 100) / (N * N);
    p += Math.floor(Math.abs(pct - 50) / 5) * 10;
    return p;
  }

  var meilleure = null, meilleurScore = Infinity;
  for (var k = 0; k < 8; k++) {
    var g = poseFormat(place(k), k);
    var s = penalite(g);
    if (s < meilleurScore) { meilleurScore = s; meilleure = g; }
  }
  return meilleure;
}

/* Rendu en tableau HTML : aucune image, donc rien a telecharger et rien a
   bloquer. Tous les clients de messagerie savent afficher un tableau. */
function qrHtml(texte, taille) {
  var m = qrMatrice(texte);
  var px = taille || 6, marge = px * 4;
  var l = ['<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;background:#ffffff;padding:' + marge + 'px;">'];
  for (var r = 0; r < m.length; r++) {
    l.push('<tr>');
    for (var c = 0; c < m.length; c++) {
      l.push('<td style="width:' + px + 'px;height:' + px + 'px;line-height:' + px +
             'px;font-size:0;background:' + (m[r][c] ? '#000000' : '#ffffff') + ';"></td>');
    }
    l.push('</tr>');
  }
  l.push('</table>');
  return l.join('');
}

if (typeof module !== 'undefined') module.exports = { qrMatrice: qrMatrice, qrHtml: qrHtml };
