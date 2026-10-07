// I test del server delle gemme.
//
// Girano sul worker.js vero e su un database SQLite vero: l'unica cosa finta e' Mojang,
// che qui risponde quello che gli diciamo noi. Si lanciano con:
//
//   node --test
//
// Le prove che contano di piu' sono quelle sulle richieste che arrivano insieme: e' li'
// che un negozio si buca, e a mano non si riesce a provarlo.

import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import worker from '../worker.js';
import { nuovoDatabase } from './d1-finto.mjs';

const BASE = 'https://gemme.prova';
const ALEX = { id: 'a'.repeat(32), nome: 'Alex' };
const STEVE = { id: 'b'.repeat(32), nome: 'Steve' };

let env;
let adesso;
const dateNowVero = Date.now;
const casoVero = Math.random;
const fetchVero = globalThis.fetch;

beforeEach(() => {
  env = {
    DB: nuovoDatabase(),
    SEGRETO: 'segreto-di-prova',
    PONTE: 'https://ponte.prova',
    CHIAVE_PONTE: 'chiave-di-prova',
  };

  // L'orologio lo muoviamo noi: i battiti dipendono dal tempo passato, e aspettare
  // davvero un minuto per ogni prova non e' un'opzione
  adesso = Date.UTC(2026, 9, 7, 12, 0, 0);
  Date.now = () => adesso;

  // Niente scatole trovate per caso mentre si gioca, se una prova non le chiede
  Math.random = () => 0.99;
});

afterEach(() => {
  Date.now = dateNowVero;
  Math.random = casoVero;
  globalThis.fetch = fetchVero;
});

// --- attrezzi ---------------------------------------------------------------

async function chiama(via, { metodo = 'GET', corpo, gettone } = {}) {
  const intestazioni = { 'content-type': 'application/json' };
  if (gettone) intestazioni.Authorization = 'Bearer ' + gettone;

  const risposta = await worker.fetch(new Request(BASE + via, {
    method: metodo,
    headers: intestazioni,
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  }), env);

  return { stato: risposta.status, dati: await risposta.json() };
}

// Mojang, come lo racconta il ponte: chi ha detto di entrare con quale biglietto
function mojangConosce(...giocatori) {
  globalThis.fetch = async (indirizzo) => {
    const url = new URL(indirizzo);
    const chi = giocatori.find((g) => g.nome === url.searchParams.get('nome'));
    const corpo = chi
      ? { stato: 200, id: chi.id, nome: chi.nome }
      : { stato: 204 };
    return new Response(JSON.stringify(corpo), { status: 200 });
  };
}

async function entra(giocatore) {
  mojangConosce(giocatore);
  const { dati: { biglietto } } = await chiama('/accesso/biglietto', { metodo: 'POST' });
  const { stato, dati } = await chiama('/accesso', {
    metodo: 'POST',
    corpo: { nome: giocatore.nome, biglietto },
  });
  assert.equal(stato, 200, JSON.stringify(dati));
  return dati.gettone;
}

function saldo(giocatore) {
  return env.DB.sql.prepare('SELECT gemme FROM giocatori WHERE uuid = ?').get(giocatore.id).gemme;
}

function daiGemme(giocatore, quante) {
  env.DB.sql.prepare('UPDATE giocatori SET gemme = ? WHERE uuid = ?').run(quante, giocatore.id);
}

// --- accesso ----------------------------------------------------------------

test('il server risponde', async () => {
  const { stato, dati } = await chiama('/salute');
  assert.equal(stato, 200);
  assert.deepEqual(dati, { ok: true });
});

test('al primo accesso si ricevono le gemme di benvenuto', async () => {
  const gettone = await entra(ALEX);
  const { dati } = await chiama('/io', { gettone });
  assert.equal(dati.gemme, 500);
  assert.deepEqual(dati.posseduti, []);
});

test('al secondo accesso le gemme di benvenuto non si ripetono', async () => {
  await entra(ALEX);
  daiGemme(ALEX, 10);
  await entra(ALEX);
  assert.equal(saldo(ALEX), 10);
});

test('un biglietto vale una volta sola', async () => {
  mojangConosce(ALEX);
  const { dati: { biglietto } } = await chiama('/accesso/biglietto', { metodo: 'POST' });
  const corpo = { nome: ALEX.nome, biglietto };

  const primo = await chiama('/accesso', { metodo: 'POST', corpo });
  const secondo = await chiama('/accesso', { metodo: 'POST', corpo });

  assert.equal(primo.stato, 200);
  assert.equal(secondo.stato, 401);
});

test('un biglietto scaduto non vale', async () => {
  mojangConosce(ALEX);
  const { dati: { biglietto } } = await chiama('/accesso/biglietto', { metodo: 'POST' });
  adesso += 61 * 1000;
  const { stato } = await chiama('/accesso', { metodo: 'POST', corpo: { nome: ALEX.nome, biglietto } });
  assert.equal(stato, 401);
});

test('se Mojang non conferma, non si entra', async () => {
  mojangConosce(); // nessuno
  const { dati: { biglietto } } = await chiama('/accesso/biglietto', { metodo: 'POST' });
  const { stato } = await chiama('/accesso', { metodo: 'POST', corpo: { nome: 'Impostore', biglietto } });
  assert.equal(stato, 401);
});

test('senza gettone le richieste private sono rifiutate', async () => {
  const { stato } = await chiama('/io');
  assert.equal(stato, 401);
});

test('un gettone con un UUID cambiato non vale', async () => {
  const gettone = await entra(ALEX);
  const [, scadenza, firma] = gettone.split('.');
  const falso = STEVE.id + '.' + scadenza + '.' + firma;
  const { stato } = await chiama('/io', { gettone: falso });
  assert.equal(stato, 401);
});

test('un gettone scade dopo dodici ore', async () => {
  const gettone = await entra(ALEX);
  adesso += 12 * 60 * 60 * 1000 + 1;
  const { stato } = await chiama('/io', { gettone });
  assert.equal(stato, 401);
});

// --- comprare ---------------------------------------------------------------

test('comprare scala il prezzo del server e indossa subito', async () => {
  const gettone = await entra(ALEX);
  const { stato, dati } = await chiama('/compra', {
    metodo: 'POST', gettone, corpo: { cosmetico: 'trail_soul', chiave: 'k1' },
  });
  assert.equal(stato, 200);
  assert.equal(dati.gemme, 200);
  assert.deepEqual(dati.posseduti, ['trail_soul']);
  assert.deepEqual(dati.indossati, ['trail_soul']);
});

test('il client non puo\' decidere il prezzo', async () => {
  const gettone = await entra(ALEX);
  const { dati } = await chiama('/compra', {
    metodo: 'POST', gettone, corpo: { cosmetico: 'trail_soul', chiave: 'k1', prezzo: 0 },
  });
  assert.equal(dati.gemme, 200);
});

test('la stessa richiesta mandata due volte si paga una volta', async () => {
  const gettone = await entra(ALEX);
  const corpo = { cosmetico: 'trail_soul', chiave: 'stessa' };
  await chiama('/compra', { metodo: 'POST', gettone, corpo });
  const { dati } = await chiama('/compra', { metodo: 'POST', gettone, corpo });
  assert.equal(dati.ripetuta, true);
  assert.equal(saldo(ALEX), 200);
});

test('senza gemme abbastanza non si compra, e il registro resta pulito', async () => {
  const gettone = await entra(ALEX);
  const { stato } = await chiama('/compra', {
    metodo: 'POST', gettone, corpo: { cosmetico: 'wings_void', chiave: 'k1' },
  });
  assert.equal(stato, 400);
  assert.equal(saldo(ALEX), 500);
  const righe = env.DB.sql.prepare("SELECT COUNT(*) AS n FROM movimenti WHERE tipo = 'acquisto'").get();
  assert.equal(righe.n, 0);
});

test('due acquisti nello stesso istante: si paga e si riceve una volta sola', async () => {
  const gettone = await entra(ALEX);
  const risposte = await Promise.all([
    chiama('/compra', { metodo: 'POST', gettone, corpo: { cosmetico: 'trail_soul', chiave: 'k1' } }),
    chiama('/compra', { metodo: 'POST', gettone, corpo: { cosmetico: 'trail_soul', chiave: 'k2' } }),
  ]);
  assert.deepEqual(risposte.map((r) => r.stato).sort(), [200, 400]);
  assert.equal(saldo(ALEX), 200);
});

test('con gemme per pagarlo due volte, lo stesso cosmetico si paga comunque una volta', async () => {
  // Qui il saldo non ferma niente: a fermare il secondo e' la consegna, che sbatte contro
  // la chiave di posseduti e restituisce le gemme
  const gettone = await entra(ALEX);
  daiGemme(ALEX, 1000);
  await Promise.all([
    chiama('/compra', { metodo: 'POST', gettone, corpo: { cosmetico: 'trail_soul', chiave: 'k1' } }),
    chiama('/compra', { metodo: 'POST', gettone, corpo: { cosmetico: 'trail_soul', chiave: 'k2' } }),
  ]);
  assert.equal(saldo(ALEX), 700);
  const registro = env.DB.sql.prepare("SELECT COUNT(*) AS n FROM movimenti WHERE tipo = 'acquisto'").get();
  assert.equal(registro.n, 1);
});

test('saldo 500, due cosmetici da 300 insieme: ne passa uno solo', async () => {
  const gettone = await entra(ALEX);
  await Promise.all([
    chiama('/compra', { metodo: 'POST', gettone, corpo: { cosmetico: 'trail_soul', chiave: 'k1' } }),
    chiama('/compra', { metodo: 'POST', gettone, corpo: { cosmetico: 'trail_end', chiave: 'k2' } }),
  ]);
  assert.equal(saldo(ALEX), 200);
  assert.ok(saldo(ALEX) >= 0);
});

test('non si indossa quello che non si possiede', async () => {
  const gettone = await entra(ALEX);
  const { stato } = await chiama('/indossa', { metodo: 'POST', gettone, corpo: { cosmetico: 'hat_gold' } });
  assert.equal(stato, 403);
});

test('il secondo click su indossa lo toglie', async () => {
  const gettone = await entra(ALEX);
  await chiama('/compra', { metodo: 'POST', gettone, corpo: { cosmetico: 'trail_flame', chiave: 'k1' } });
  const { dati } = await chiama('/indossa', { metodo: 'POST', gettone, corpo: { cosmetico: 'trail_flame' } });
  assert.deepEqual(dati.indossati, []);
});

// --- guadagnare giocando ----------------------------------------------------

test('il primo battito non fa guadagnare niente', async () => {
  const gettone = await entra(ALEX);
  const { dati } = await chiama('/gioca', { metodo: 'POST', gettone });
  assert.equal(dati.gemme, 500);
});

test('un minuto di gioco vale due gemme', async () => {
  const gettone = await entra(ALEX);
  await chiama('/gioca', { metodo: 'POST', gettone });
  adesso += 60 * 1000;
  const { dati } = await chiama('/gioca', { metodo: 'POST', gettone });
  assert.equal(dati.gemme, 502);
});

test('i battiti a raffica non fanno guadagnare', async () => {
  const gettone = await entra(ALEX);
  await chiama('/gioca', { metodo: 'POST', gettone });
  for (let i = 0; i < 10; i++) {
    adesso += 1000;
    await chiama('/gioca', { metodo: 'POST', gettone });
  }
  assert.equal(saldo(ALEX), 500);
});

test('un\'ora senza battiti conta come due minuti, non come un\'ora', async () => {
  const gettone = await entra(ALEX);
  await chiama('/gioca', { metodo: 'POST', gettone });
  adesso += 60 * 60 * 1000;
  const { dati } = await chiama('/gioca', { metodo: 'POST', gettone });
  assert.equal(dati.gemme, 504);
});

test('il tetto giornaliero ferma i guadagni, e il giorno dopo riparte', async () => {
  const gettone = await entra(ALEX);
  await chiama('/gioca', { metodo: 'POST', gettone });
  // 200 battiti da due minuti = 800 gemme maturate, ma il tetto e' 300
  for (let i = 0; i < 200; i++) {
    adesso += 2 * 60 * 1000;
    await chiama('/gioca', { metodo: 'POST', gettone });
  }
  assert.equal(saldo(ALEX), 800);

  // Due giorni dopo il gettone e' scaduto: si rientra, come farebbe il client
  adesso = Date.UTC(2026, 9, 9, 12, 0, 0);
  const domani = await entra(ALEX);
  await chiama('/gioca', { metodo: 'POST', gettone: domani });
  assert.equal(saldo(ALEX), 804);
});

test('due battiti nello stesso istante non raddoppiano le gemme', async () => {
  const gettone = await entra(ALEX);
  await chiama('/gioca', { metodo: 'POST', gettone });
  adesso += 60 * 1000;
  await Promise.all([
    chiama('/gioca', { metodo: 'POST', gettone }),
    chiama('/gioca', { metodo: 'POST', gettone }),
  ]);
  assert.equal(saldo(ALEX), 502);
});

// --- codici -----------------------------------------------------------------

function creaCodice(codice, gemme, usiMax, scade = null) {
  env.DB.sql.prepare('INSERT INTO codici (codice, gemme, usi_max, scade) VALUES (?, ?, ?, ?)')
    .run(codice, gemme, usiMax, scade);
}

test('un codice si riscatta, anche scritto male', async () => {
  creaCodice('BENVENUTO', 250, 100);
  const gettone = await entra(ALEX);
  const { stato, dati } = await chiama('/codice', { metodo: 'POST', gettone, corpo: { codice: '  benvenuto ' } });
  assert.equal(stato, 200);
  assert.equal(dati.gemme, 750);
});

test('lo stesso codice non vale due volte per la stessa persona', async () => {
  creaCodice('BENVENUTO', 250, 100);
  const gettone = await entra(ALEX);
  await chiama('/codice', { metodo: 'POST', gettone, corpo: { codice: 'BENVENUTO' } });
  const { stato } = await chiama('/codice', { metodo: 'POST', gettone, corpo: { codice: 'BENVENUTO' } });
  assert.equal(stato, 400);
  assert.equal(saldo(ALEX), 750);
});

test('un codice esaurito non vale piu\', e chi ci prova puo\' riprovare con un altro', async () => {
  creaCodice('UNO', 100, 1);
  const alex = await entra(ALEX);
  const steve = await entra(STEVE);
  await chiama('/codice', { metodo: 'POST', gettone: alex, corpo: { codice: 'UNO' } });
  const { stato } = await chiama('/codice', { metodo: 'POST', gettone: steve, corpo: { codice: 'UNO' } });
  assert.equal(stato, 400);
  assert.equal(saldo(STEVE), 500);
  const rimasti = env.DB.sql.prepare("SELECT COUNT(*) AS n FROM codici_usati WHERE uuid = ?").get(STEVE.id);
  assert.equal(rimasti.n, 0);
});

test('un codice scaduto non vale', async () => {
  creaCodice('VECCHIO', 100, 10, adesso - 1);
  const gettone = await entra(ALEX);
  const { stato } = await chiama('/codice', { metodo: 'POST', gettone, corpo: { codice: 'VECCHIO' } });
  assert.equal(stato, 400);
});

// --- regali -----------------------------------------------------------------

test('un regalo sposta le gemme da uno all\'altro', async () => {
  const alex = await entra(ALEX);
  await entra(STEVE);
  const { stato } = await chiama('/regala', { metodo: 'POST', gettone: alex, corpo: { a: 'steve', quanto: 200, chiave: 'r1' } });
  assert.equal(stato, 200);
  assert.equal(saldo(ALEX), 300);
  assert.equal(saldo(STEVE), 700);
});

test('non si regala piu\' di quello che si ha', async () => {
  const alex = await entra(ALEX);
  await entra(STEVE);
  const { stato } = await chiama('/regala', { metodo: 'POST', gettone: alex, corpo: { a: 'Steve', quanto: 600, chiave: 'r1' } });
  assert.equal(stato, 400);
  assert.equal(saldo(ALEX), 500);
  assert.equal(saldo(STEVE), 500);
});

test('non ci si regalano gemme da soli', async () => {
  const alex = await entra(ALEX);
  const { stato } = await chiama('/regala', { metodo: 'POST', gettone: alex, corpo: { a: 'Alex', quanto: 10, chiave: 'r1' } });
  assert.equal(stato, 400);
});

test('le quantita\' strane vengono rifiutate', async () => {
  const alex = await entra(ALEX);
  await entra(STEVE);
  for (const quanto of [-100, 0, 'tante', 2001]) {
    const { stato } = await chiama('/regala', { metodo: 'POST', gettone: alex, corpo: { a: 'Steve', quanto, chiave: 'r' + quanto } });
    assert.equal(stato, 400, 'quanto = ' + quanto);
  }
  assert.equal(saldo(ALEX), 500);
});

test('due regali insieme non portano il saldo sotto zero', async () => {
  const alex = await entra(ALEX);
  await entra(STEVE);
  await Promise.all([
    chiama('/regala', { metodo: 'POST', gettone: alex, corpo: { a: 'Steve', quanto: 400, chiave: 'r1' } }),
    chiama('/regala', { metodo: 'POST', gettone: alex, corpo: { a: 'Steve', quanto: 400, chiave: 'r2' } }),
  ]);
  assert.equal(saldo(ALEX), 100);
  assert.equal(saldo(STEVE), 900);
});

// --- scatole ----------------------------------------------------------------

test('una scatola si compra e si apre, e da\' un cosmetico della sua cassa', async () => {
  const gettone = await entra(ALEX);
  daiGemme(ALEX, 1000);
  await chiama('/scatola/compra', { metodo: 'POST', gettone, corpo: { chiave: 's1' } });
  assert.equal(saldo(ALEX), 250);

  Math.random = casoVero;
  const { stato, dati } = await chiama('/scatola/apri', { metodo: 'POST', gettone, corpo: { chiave: 'a1', cassa: 'fuoco' } });
  assert.equal(stato, 200);
  assert.ok(['trail_flame', 'hat_red', 'halo_gold', 'wings_fire'].includes(dati.vinto), dati.vinto);
  assert.equal(dati.scatole, 0);
});

test('senza scatole non si apre niente', async () => {
  const gettone = await entra(ALEX);
  const { stato } = await chiama('/scatola/apri', { metodo: 'POST', gettone, corpo: { chiave: 'a1', cassa: 'fuoco' } });
  assert.equal(stato, 400);
});

test('una scatola sola aperta due volte insieme si apre una volta', async () => {
  const gettone = await entra(ALEX);
  daiGemme(ALEX, 750);
  await chiama('/scatola/compra', { metodo: 'POST', gettone, corpo: { chiave: 's1' } });
  const risposte = await Promise.all([
    chiama('/scatola/apri', { metodo: 'POST', gettone, corpo: { chiave: 'a1', cassa: 'vuoto' } }),
    chiama('/scatola/apri', { metodo: 'POST', gettone, corpo: { chiave: 'a2', cassa: 'vuoto' } }),
  ]);
  assert.equal(risposte.filter((r) => r.stato === 200).length, 1);
  const possiede = env.DB.sql.prepare('SELECT COUNT(*) AS n FROM posseduti WHERE uuid = ?').get(ALEX.id);
  assert.equal(possiede.n, 1);
});

test('chi ha gia\' tutta la cassa riceve gemme, meno di quanto vale la fascia', async () => {
  const gettone = await entra(ALEX);
  for (const id of ['hat_top', 'orbit_violet', 'wings_void']) {
    env.DB.sql.prepare('INSERT INTO posseduti (uuid, cosmetico, preso) VALUES (?, ?, 0)').run(ALEX.id, id);
  }
  env.DB.sql.prepare('UPDATE giocatori SET gemme = 0, scatole = 1 WHERE uuid = ?').run(ALEX.id);

  const { dati } = await chiama('/scatola/apri', { metodo: 'POST', gettone, corpo: { chiave: 'a1', cassa: 'vuoto' } });
  // Il Vuoto ha solo epiche ed esotiche: il rimborso e' il 60% di una delle due
  assert.ok([1200, 5400].includes(dati.gemme_vinte), String(dati.gemme_vinte));
});

// --- cosa indossano gli altri -----------------------------------------------

test('addosso risponde solo con quello che si vede, e ignora gli UUID strani', async () => {
  const gettone = await entra(ALEX);
  await chiama('/compra', { metodo: 'POST', gettone, corpo: { cosmetico: 'trail_flame', chiave: 'k1' } });
  const { dati } = await chiama('/addosso?uuid=' + ALEX.id + ",'; DROP TABLE giocatori;--," + STEVE.id);
  assert.deepEqual(dati, { [ALEX.id]: ['trail_flame'] });
});

// --- amici ------------------------------------------------------------------

const NOTCH = { id: 'c'.repeat(32), nome: 'Notch' };

async function chiedi(gettone, nome) {
  return chiama('/amici/chiedi', { metodo: 'POST', gettone, corpo: { nome } });
}

async function amiciDi(gettone) {
  return (await chiama('/amici', { gettone })).dati;
}

async function battito(gettone, server) {
  return chiama('/gioca', { metodo: 'POST', gettone, corpo: server === undefined ? {} : { server } });
}

test('una richiesta arriva, e accettandola si diventa amici tutti e due', async () => {
  const alex = await entra(ALEX);
  const steve = await entra(STEVE);

  const { dati: dopoRichiesta } = await chiedi(alex, 'steve');
  assert.deepEqual(dopoRichiesta.inviate.map((a) => a.nome), ['Steve']);
  assert.deepEqual((await amiciDi(steve)).ricevute.map((a) => a.nome), ['Alex']);

  const { stato } = await chiama('/amici/accetta', { metodo: 'POST', gettone: steve, corpo: { uuid: ALEX.id } });
  assert.equal(stato, 200);

  assert.deepEqual((await amiciDi(alex)).amici.map((a) => a.nome), ['Steve']);
  assert.deepEqual((await amiciDi(steve)).amici.map((a) => a.nome), ['Alex']);
  assert.deepEqual((await amiciDi(alex)).inviate, []);
  assert.deepEqual((await amiciDi(steve)).ricevute, []);
});

test('se tutti e due si chiedono l\'amicizia, sono amici senza dover accettare', async () => {
  const alex = await entra(ALEX);
  const steve = await entra(STEVE);
  await chiedi(alex, 'Steve');
  const { dati } = await chiedi(steve, 'Alex');
  assert.equal(dati.amici_ora, 'Alex');
  assert.deepEqual((await amiciDi(alex)).amici.map((a) => a.nome), ['Steve']);
});

test('non si diventa amici di qualcuno senza che accetti', async () => {
  const alex = await entra(ALEX);
  await entra(STEVE);
  await chiedi(alex, 'Steve');
  assert.deepEqual((await amiciDi(alex)).amici, []);
});

test('non si accetta una richiesta che non esiste', async () => {
  await entra(ALEX);
  const steve = await entra(STEVE);
  const { stato } = await chiama('/amici/accetta', { metodo: 'POST', gettone: steve, corpo: { uuid: ALEX.id } });
  assert.equal(stato, 404);
  assert.deepEqual((await amiciDi(steve)).amici, []);
});

test('chi ha mandato la richiesta non puo\' accettarla da solo', async () => {
  const alex = await entra(ALEX);
  await entra(STEVE);
  await chiedi(alex, 'Steve');
  const { stato } = await chiama('/amici/accetta', { metodo: 'POST', gettone: alex, corpo: { uuid: STEVE.id } });
  assert.equal(stato, 404);
});

test('chiedere due volte non fa due richieste', async () => {
  const alex = await entra(ALEX);
  const steve = await entra(STEVE);
  await Promise.all([chiedi(alex, 'Steve'), chiedi(alex, 'Steve')]);
  assert.equal((await amiciDi(steve)).ricevute.length, 1);
});

test('accettare due volte insieme non rompe niente', async () => {
  const alex = await entra(ALEX);
  const steve = await entra(STEVE);
  await chiedi(alex, 'Steve');
  const risposte = await Promise.all([
    chiama('/amici/accetta', { metodo: 'POST', gettone: steve, corpo: { uuid: ALEX.id } }),
    chiama('/amici/accetta', { metodo: 'POST', gettone: steve, corpo: { uuid: ALEX.id } }),
  ]);
  assert.deepEqual(risposte.map((r) => r.stato).sort(), [200, 404]);
  const righe = env.DB.sql.prepare('SELECT COUNT(*) AS n FROM amici').get();
  assert.equal(righe.n, 2);
});

test('non si aggiunge se stessi ne\' chi non e\' mai entrato', async () => {
  const alex = await entra(ALEX);
  assert.equal((await chiedi(alex, 'Alex')).stato, 400);
  assert.equal((await chiedi(alex, 'Sconosciuto')).stato, 404);
});

test('rifiutare toglie la richiesta, e ritirarla anche', async () => {
  const alex = await entra(ALEX);
  const steve = await entra(STEVE);
  await entra(NOTCH);

  await chiedi(alex, 'Steve');
  await chiama('/amici/rifiuta', { metodo: 'POST', gettone: steve, corpo: { uuid: ALEX.id } });
  assert.deepEqual((await amiciDi(steve)).ricevute, []);
  assert.deepEqual((await amiciDi(alex)).inviate, []);

  await chiedi(alex, 'Notch');
  await chiama('/amici/rifiuta', { metodo: 'POST', gettone: alex, corpo: { uuid: NOTCH.id } });
  assert.deepEqual((await amiciDi(alex)).inviate, []);
});

test('togliere un amico lo toglie a tutti e due', async () => {
  const alex = await entra(ALEX);
  const steve = await entra(STEVE);
  await chiedi(alex, 'Steve');
  await chiedi(steve, 'Alex');
  await chiama('/amici/togli', { metodo: 'POST', gettone: steve, corpo: { uuid: ALEX.id } });
  assert.deepEqual((await amiciDi(alex)).amici, []);
  assert.deepEqual((await amiciDi(steve)).amici, []);
});

test('gli amici vedono chi e\' online e su che server', async () => {
  const alex = await entra(ALEX);
  const steve = await entra(STEVE);
  await chiedi(alex, 'Steve');
  await chiedi(steve, 'Alex');

  assert.equal((await amiciDi(alex)).amici[0].online, false);

  await battito(steve, 'MC.Hypixel.net:25565');
  const [amico] = (await amiciDi(alex)).amici;
  assert.equal(amico.online, true);
  assert.equal(amico.dove, 'mc.hypixel.net');

  // Dopo qualche minuto senza battiti si e' usciti, e il server non si vede piu'
  adesso += 4 * 60 * 1000;
  const [dopo] = (await amiciDi(alex)).amici;
  assert.equal(dopo.online, false);
  assert.equal(dopo.dove, null);
});

test('l\'indirizzo di casa di qualcuno non si mostra', async () => {
  const alex = await entra(ALEX);
  const steve = await entra(STEVE);
  await chiedi(alex, 'Steve');
  await chiedi(steve, 'Alex');

  for (const indirizzo of ['93.41.12.7:25565', 'localhost', '[2001:db8::1]:25565', '2001:db8::1']) {
    await battito(steve, indirizzo);
    assert.equal((await amiciDi(alex)).amici[0].dove, 'server privato', indirizzo);
  }

  await battito(steve, '<script>alert(1)</script>');
  assert.equal((await amiciDi(alex)).amici[0].dove, null);

  await battito(steve);
  assert.equal((await amiciDi(alex)).amici[0].online, true);
});

test('chi non e\' amico non vede dove giochi', async () => {
  const alex = await entra(ALEX);
  const steve = await entra(STEVE);
  await chiedi(alex, 'Steve');
  await battito(steve, 'mc.hypixel.net');
  const elenco = await amiciDi(alex);
  assert.deepEqual(elenco.amici, []);
  assert.equal(JSON.stringify(elenco).includes('hypixel'), false);
});

test('il battito continua a far guadagnare come prima', async () => {
  const gettone = await entra(ALEX);
  await battito(gettone, 'mc.hypixel.net');
  adesso += 60 * 1000;
  const { dati } = await battito(gettone, 'mc.hypixel.net');
  assert.equal(dati.gemme, 502);
});

// --- regole dei server ------------------------------------------------------

test('le regole dei server si leggono senza accesso', async () => {
  const { stato, dati } = await chiama('/regole');
  assert.equal(stato, 200);
  assert.ok(dati['hypixel.net'].freelook);
  assert.ok(dati['hypixel.net'].toggle_sprint);
});

test('le regole hanno solo testi, come se li aspetta il client', async () => {
  const { dati } = await chiama('/regole');
  for (const [dominio, divieti] of Object.entries(dati)) {
    assert.equal(dominio, dominio.toLowerCase(), 'dominio in minuscolo: ' + dominio);
    assert.ok(!dominio.includes(':'), 'niente porta nel dominio: ' + dominio);
    for (const motivo of Object.values(divieti)) assert.equal(typeof motivo, 'string');
  }
});

test('una via che non esiste risponde 404', async () => {
  const gettone = await entra(ALEX);
  const { stato } = await chiama('/niente', { gettone });
  assert.equal(stato, 404);
});
