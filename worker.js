// Il server delle gemme e dei cosmetici di SnidolClient.
//
// Perche' esiste. Fino a ieri il saldo stava in un file sul computer di chi gioca, e
// bastava aprirlo con il blocco note per darsi le gemme che si volevano. Non era un
// difetto da correggere sul client: qualunque cosa gli metti dentro - cifratura, file
// nascosti, controlli - sta comunque su una macchina di qualcun altro, che ha tutto il
// tempo del mondo per guardarci dentro. L'unico modo e' spostare la verita' qui.
//
// La regola che tiene in piedi tutto: il client non manda mai numeri, manda intenzioni.
// Non dice "il mio saldo e' 5000" ne' "toglimi 400 gemme", dice "vorrei comprare
// trail_flame". Il prezzo lo sa solo questo file, il saldo lo sa solo il database.
//
// Tutto sta in un file solo apposta: si incolla nel pannello di Cloudflare senza
// installare niente. Non e' bello, ma un server che sta in piedi batte un server
// ordinato che non e' mai partito.

// ---------------------------------------------------------------------------
// Il catalogo. Prezzi e forme stanno QUI, non nel client.
//
// I prezzi vengono dalle fasce di rarita': 0 gratis, 300 comune, 900 rara, 2000 epica,
// 4500 leggendaria, 9000 esotica. Sono tarati sul tetto giornaliero di 300 gemme, quindi
// un prezzo dice quanti giorni di gioco costa una cosa invece che una cifra a caso.
//
// Nel client c'e' la stessa lista, ma con nome, descrizione e colore: quella serve solo
// a disegnare il negozio. Se qualcuno modifica il prezzo scritto la' dentro, vede una
// cifra diversa nel riquadro e continua a pagare quella vera - perche' a scalare le
// gemme e' questo elenco.
// ---------------------------------------------------------------------------
const CATALOGO = {
  trail_flame:  { prezzo: 0,  forma: 'TRAIL'  , rarita: 'GRATIS' },
  trail_heart:  { prezzo: 0,  forma: 'TRAIL'  , rarita: 'GRATIS' },
  trail_soul:   { prezzo: 300,  forma: 'TRAIL'  , rarita: 'COMUNE' },
  trail_end:    { prezzo: 300,  forma: 'TRAIL'  , rarita: 'COMUNE' },
  halo_gold:    { prezzo: 2000,  forma: 'HALO'   , rarita: 'EPICA' },
  halo_ice:     { prezzo: 900,  forma: 'HALO'   , rarita: 'RARA' },
  orbit_violet: { prezzo: 2000, forma: 'ORBIT'  , rarita: 'EPICA' },
  orbit_green:  { prezzo: 900, forma: 'ORBIT'  , rarita: 'RARA' },
  spiral_green: { prezzo: 900, forma: 'SPIRAL' , rarita: 'RARA' },
  wings_fire:   { prezzo: 4500, forma: 'WINGS'  , rarita: 'LEGGENDARIA' },
  wings_ice:    { prezzo: 4500, forma: 'WINGS'  , rarita: 'LEGGENDARIA' },
  wings_void:   { prezzo: 9000, forma: 'WINGS'  , rarita: 'ESOTICA' },
  hat_top:      { prezzo: 2000, forma: 'HAT'    , rarita: 'EPICA' },
  hat_red:      { prezzo: 2000, forma: 'HAT'    , rarita: 'EPICA' },
  hat_gold:     { prezzo: 4500, forma: 'HAT'    , rarita: 'LEGGENDARIA' },
};

// Quanto si guadagna giocando.
//
// I numeri sono tarati cosi': con il tetto pieno tutti i giorni, il cosmetico piu' caro
// arriva in poco piu' di una settimana. Se le gemme piovono, il negozio si svuota in due
// giorni e non c'e' piu' niente da guardare.
const GEMME_AL_MINUTO = 2;

// Quanto si trova in tasca al primo accesso: una scia comune costa 300, quindi si entra gia'
// potendo comprare qualcosa invece di guardare un negozio tutto spento
const GEMME_DI_BENVENUTO = 500;

// Quanto si puo' regalare in una volta. Non e' avarizia: e' che se un gettone finisce
// nelle mani sbagliate, il danno si ferma qui invece di svuotare il conto in un colpo
const REGALO_MASSIMO = 2000;

// Le scatole.
//
// Quanto costa comprarne una, e con che probabilita' esce ogni fascia. I pesi sono
// numeri interi che si sommano a cento, cosi' si leggono come percentuali senza doverli
// convertire: cinquanta volte su cento esce una comune, una volta su cento un'esotica.
//
// Il valore medio di una scatola e' piu' alto del prezzo - circa mille gemme contro
// settecentocinquanta - ed e' voluto: una scatola che rende meno di quello che costa e'
// una tassa sulla curiosita', e la si apre una volta sola.
const SCATOLA_PREZZO = 750;
// Quanto vale ogni fascia, per il rimborso. Sono gli stessi prezzi del catalogo, scritti
// una volta sola invece di andarli a cercare fra i cosmetici
const PREZZI_FASCIA = {
  COMUNE: 300,
  RARA: 900,
  EPICA: 2000,
  LEGGENDARIA: 4500,
  ESOTICA: 9000,
};

// Le casse, e cosa c'e' dentro ognuna.
//
// Una cassa non e' un oggetto che si possiede: quello che si possiede e' una chiave, e
// una chiave apre la cassa che si vuole. E' il motivo per cui il contatore resta uno solo
// - la colonna "scatole" di sempre - invece di diventarne quattro: aggiungere una cassa
// e' aggiungere una riga qui, senza toccare il database.
//
// Gli elenchi devono contenere id che esistono nel CATALOGO qui sopra. Uno scritto male
// non fa danni - semplicemente non esce mai - ma rende la cassa piu' povera di quello che
// promette, e nessuno se ne accorge finche' qualcuno non si lamenta.
const CASSE = {
  fuoco: ['trail_flame', 'hat_red', 'halo_gold', 'wings_fire'],
  ghiaccio: ['trail_soul', 'trail_end', 'halo_ice', 'wings_ice'],
  vuoto: ['hat_top', 'orbit_violet', 'wings_void'],
  natura: ['trail_heart', 'orbit_green', 'spiral_green', 'hat_gold'],
};

const SCATOLA_PESI = {
  COMUNE: 50,
  RARA: 30,
  EPICA: 14,
  LEGGENDARIA: 5,
  ESOTICA: 1,
};

// Quante se ne possono trovare giocando in un giorno, e con che probabilita' a ogni
// battito. Con un battito al minuto fa circa una scatola ogni mezz'ora di gioco, e il
// tetto impedisce che chi lascia il client aperto tutta la notte si svegli ricco
// Quanto rende una scatola quando non hai piu' niente da trovare: una quota del prezzo
// della fascia uscita, invece del cosmetico.
//
// Sessanta per cento e non cento apposta. Una scatola vale in media 1022 gemme e ne
// costa 750: se il rimborso fosse pieno, comprarne e aprirne all'infinito sarebbe una
// macchina per stampare gemme. A sessanta il valore medio scende a 613, sotto il prezzo,
// e il giro si chiude in perdita - com'e' giusto che sia quando non c'e' piu' niente da
// vincere.
const SCATOLA_RIMBORSO = 0.6;

const SCATOLE_AL_GIORNO = 3;
const SCATOLA_PROBABILITA = 0.03;
const TETTO_GIORNALIERO = 300;

// I moduli che un server non vuole, per dominio.
//
// Il client ne ha gia' una copia scritta dentro, che vale anche senza rete: questa serve
// ad aggiungere in fretta. Se un server cambia idea, o se ne scopre uno nuovo con delle
// regole, si scrive qui e vale per tutti al prossimo avvio del gioco, senza aspettare una
// versione nuova del client. Il client somma le due liste: da qui si puo' vietare di piu',
// mai di meno.
//
// Le chiavi sono gli id dei moduli, quelli che restituisce id() nella mod.
const REGOLE = {
  // https://support.hypixel.net/hc/en-us/articles/6472550754962
  'hypixel.net': {
    freelook: "la visuale libera non e' permessa",
    toggle_sprint: "la corsa automatica non e' permessa",
    target_hud: 'vita e distanza degli altri non sono permesse',
    team_tracker: "la distanza degli altri non e' permessa",
    totem_pops: 'i totem degli altri non sono permessi',
  },
};

// Il battito arriva ogni minuto. Questi due sono il muro contro chi lo manda a raffica:
// sotto i trenta secondi non si guadagna niente, e sopra i due minuti il tempo in piu'
// non si conta - cosi' chi stacca la rete per un'ora non torna con un premio.
const INTERVALLO_MINIMO = 30 * 1000;
const MASSIMO_PER_BATTITO = 120 * 1000;

// Quanto vale un gettone di accesso. Corto apposta: se qualcuno se ne procura uno,
// smette di funzionare da solo entro sera invece di valere per sempre.
const DURATA_GETTONE = 12 * 60 * 60 * 1000;

// I biglietti d'ingresso scadono subito: fra il "sto entrando" detto a Mojang e la
// nostra domanda passano meno di due secondi, un minuto e' gia' larghissimo
const DURATA_INGRESSO = 60 * 1000;

export default {
  async fetch(richiesta, env) {
    try {
      return await instrada(richiesta, env);
    } catch (rotto) {
      // Il messaggio vero resta nei registri di Cloudflare: a chi chiama si dice che e'
      // andata storta e basta. I messaggi di errore dettagliati sono una mappa gratis
      // per chi sta cercando di forzare qualcosa
      console.error(rotto && rotto.stack ? rotto.stack : String(rotto));
      return json({ errore: 'guasto' }, 500);
    }
  },
};

async function instrada(richiesta, env) {
  const url = new URL(richiesta.url);
  const via = url.pathname;

  if (via === '/' || via === '/salute') return json({ ok: true });

  if (via === '/accesso/biglietto' && richiesta.method === 'POST') return biglietto(env);
  if (via === '/accesso' && richiesta.method === 'POST') return accesso(richiesta, env);

  // Pubblica: serve a disegnare i cosmetici degli ALTRI, e chi ti sta davanti non ti da'
  // certo il suo gettone. Non espone niente di privato: solo cosa indossa uno che ti sta
  // gia' camminando accanto
  if (via === '/addosso' && richiesta.method === 'GET') return addosso(url, env);

  // Pubblica anche questa: le regole valgono per tutti, e servono gia' prima dell'accesso.
  // Si possono tenere in cache un'ora, tanto il client le chiede una volta all'avvio
  if (via === '/regole' && richiesta.method === 'GET') {
    const risposta = json(REGOLE);
    risposta.headers.set('cache-control', 'public, max-age=3600');
    return risposta;
  }

  // Da qui in giu' bisogna aver fatto l'accesso
  const chi = await autentica(richiesta, env);
  if (!chi) return json({ errore: 'non autenticato' }, 401);

  if (via === '/io' && richiesta.method === 'GET') return json(await stato(env, chi));
  if (via === '/gioca' && richiesta.method === 'POST') return gioca(env, chi);
  if (via === '/compra' && richiesta.method === 'POST') return compra(richiesta, env, chi);
  if (via === '/indossa' && richiesta.method === 'POST') return indossa(richiesta, env, chi);
  if (via === '/codice' && richiesta.method === 'POST') return codice(richiesta, env, chi);
  if (via === '/regala' && richiesta.method === 'POST') return regala(richiesta, env, chi);
  if (via === '/scatola/compra' && richiesta.method === 'POST') return compraScatola(richiesta, env, chi);
  if (via === '/scatola/apri' && richiesta.method === 'POST') return apriScatola(richiesta, env, chi);

  return json({ errore: 'non esiste' }, 404);
}

// ---------------------------------------------------------------------------
// Accesso: dimostrare di essere chi si dice, senza mandare in giro la password
//
// Il gettone di sessione di Minecraft non passa MAI di qui. Il giro e' questo:
//
//   1. il client chiede a noi un biglietto (un numero a caso, usa e getta)
//   2. il client dice a Mojang "sto entrando nel server <biglietto>", firmando con il
//      suo gettone - che quindi va solo a Mojang, come quando entra in un server vero
//   3. il client ci dice "ho fatto, sono <nome>"
//   4. noi chiediamo a Mojang "chi e' entrato nel server <biglietto>?"
//
// Se Mojang risponde con un UUID, quella persona ha davvero l'account. Noi il suo
// gettone non lo vediamo, non lo salviamo e non possiamo perderlo in un furto di dati.
// ---------------------------------------------------------------------------

async function biglietto(env) {
  // Venti byte, cioe' quaranta caratteri: e' la misura esatta dell'impronta che
  // Minecraft manda quando entra in un server vero, e Mojang non ne accetta di piu'
  // lunghe. Con ventiquattro byte rispondeva "Invalid serverId" e l'accesso non partiva.
  // Di casualita' ce n'e' comunque piu' che a sufficienza: centosessanta bit
  const nonce = casuale(20);
  const adesso = Date.now();

  await env.DB.prepare('INSERT INTO ingressi (nonce, creato) VALUES (?, ?)')
    .bind(nonce, adesso).run();

  // I biglietti scaduti si buttano qui invece che con un lavoro periodico: sono la stessa
  // tabella e la stessa scrittura, e cosi' non c'e' niente in piu' da tenere acceso
  await env.DB.prepare('DELETE FROM ingressi WHERE creato < ?')
    .bind(adesso - DURATA_INGRESSO).run();

  return json({ biglietto: nonce });
}

async function accesso(richiesta, env) {
  const corpo = await leggi(richiesta);
  const nome = String(corpo.nome || '');
  const nonce = String(corpo.biglietto || '');

  if (!nome || !nonce) return json({ errore: 'manca il nome o il biglietto' }, 400);

  // Consumato prima di usarlo, e in un colpo solo: se due richieste arrivano insieme con
  // lo stesso biglietto, solo quella che riesce a cancellarlo va avanti
  const consumato = await env.DB
    .prepare('DELETE FROM ingressi WHERE nonce = ? AND creato > ?')
    .bind(nonce, Date.now() - DURATA_INGRESSO).run();

  if (!consumato.meta || consumato.meta.changes !== 1) {
    return json({ errore: 'biglietto scaduto o gia usato' }, 401);
  }

  // La domanda a Mojang passa dal ponte, non parte da qui: Mojang rifiuta con un 403
  // tutto quello che arriva da un Worker di Cloudflare, a prescindere da cosa chiede.
  // Il ponte gira altrove, fa la telefonata e riporta la risposta.
  if (!env.PONTE || !env.CHIAVE_PONTE) {
    return json({ errore: 'ponte non configurato' }, 500);
  }

  const risposta = await fetch(
    env.PONTE.replace(/\/$/, '') + '/hasjoined'
      + '?nome=' + encodeURIComponent(nome)
      + '&biglietto=' + encodeURIComponent(nonce),
    { headers: { 'x-chiave': env.CHIAVE_PONTE } }
  );

  if (risposta.status !== 200) {
    return json({ errore: 'ponte non raggiungibile', ponte: risposta.status }, 502);
  }

  // Il ponte risponde sempre 200: dentro c'e' il numero che ha detto Mojang. 204 vuol
  // dire che con quel biglietto non e' entrato nessuno - o non ha fatto il passaggio, o
  // non e' chi dice di essere
  const detto = await risposta.json();
  if (!detto || detto.stato !== 200 || !detto.id) {
    return json({ errore: 'accesso rifiutato', mojang: detto ? detto.stato : null }, 401);
  }

  const profilo = { id: detto.id, name: detto.nome };

  const uuid = String(profilo.id).toLowerCase();
  const vero = String(profilo.name || nome);

  // Il regalo di benvenuto va solo a chi entra la prima volta: al secondo accesso la
  // riga esiste gia' e si aggiorna soltanto il nome. Senza, il negozio sarebbe tutto
  // grigio per il primo giorno e nessuno capirebbe cosa ci fa li'
  await env.DB.prepare(
    'INSERT INTO giocatori (uuid, nome, gemme, visto, giorno, guadagnate, creato)'
    + " VALUES (?, ?, ?, 0, '', 0, ?)"
    + ' ON CONFLICT(uuid) DO UPDATE SET nome = excluded.nome'
  ).bind(uuid, vero, GEMME_DI_BENVENUTO, Date.now()).run();

  const gettone = await firmaGettone(env, uuid);
  const suo = await stato(env, { uuid, nome: vero });

  return json(Object.assign({ gettone: gettone, uuid: uuid, nome: vero }, suo));
}

// Il gettone e' <uuid>.<scadenza>.<firma>. Non e' cifrato e non serve che lo sia: non
// contiene segreti, e senza la firma non si puo' fabbricare. Chi si cambia l'UUID dentro
// il gettone ottiene una firma che non torna, e viene rifiutato.
async function firmaGettone(env, uuid) {
  const scadenza = Date.now() + DURATA_GETTONE;
  const testa = uuid + '.' + scadenza;
  return testa + '.' + await firma(env, testa);
}

async function autentica(richiesta, env) {
  const intestazione = richiesta.headers.get('Authorization') || '';
  const gettone = intestazione.startsWith('Bearer ') ? intestazione.slice(7) : '';
  if (!gettone) return null;

  const pezzi = gettone.split('.');
  if (pezzi.length !== 3) return null;

  const testa = pezzi[0] + '.' + pezzi[1];
  const attesa = await firma(env, testa);

  // Confronto a tempo costante: confrontare due stringhe con === si ferma al primo
  // carattere diverso, e da quanto ci mette si puo' indovinare la firma un pezzo alla
  // volta. E' un attacco da laboratorio, ma costa tre righe difendersi
  if (!ugualiATempoCostante(attesa, pezzi[2])) return null;
  if (Number(pezzi[1]) < Date.now()) return null;

  return { uuid: pezzi[0] };
}

async function firma(env, testo) {
  const segreto = env.SEGRETO;
  if (!segreto) throw new Error('manca il segreto SEGRETO');

  const chiave = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(segreto),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const firmato = await crypto.subtle.sign('HMAC', chiave, new TextEncoder().encode(testo));
  return esadecimale(new Uint8Array(firmato));
}

// ---------------------------------------------------------------------------
// Lo stato del giocatore
// ---------------------------------------------------------------------------

async function stato(env, chi) {
  const giocatore = await env.DB
    .prepare('SELECT gemme, guadagnate, giorno, padrone, scatole FROM giocatori WHERE uuid = ?')
    .bind(chi.uuid).first();

  const posseduti = await env.DB
    .prepare('SELECT cosmetico FROM posseduti WHERE uuid = ?')
    .bind(chi.uuid).all();

  const indossati = await env.DB
    .prepare('SELECT cosmetico FROM indossati WHERE uuid = ?')
    .bind(chi.uuid).all();

  const oggi = giornoDi(Date.now());
  const guadagnate = giocatore && giocatore.giorno === oggi ? giocatore.guadagnate : 0;

  return {
    // Chi ha il contrassegno non paga. Sta nel database e non nel client: com'era
    // prima - un elenco di nomi dentro il mod - bastava aggiungerci il proprio per
    // avere il negozio gratis, e non serviva nemmeno saper programmare
    padrone: !!(giocatore && giocatore.padrone),
    gemme: giocatore ? giocatore.gemme : 0,
    scatole: giocatore ? giocatore.scatole : 0,
    posseduti: (posseduti.results || []).map((r) => r.cosmetico),
    indossati: (indossati.results || []).map((r) => r.cosmetico),
    guadagnateOggi: guadagnate,
    tettoGiornaliero: TETTO_GIORNALIERO,
  };
}

// ---------------------------------------------------------------------------
// Guadagnare giocando
//
// Il client manda un battito ogni minuto e non dice quanto ha giocato: lo sa il server,
// perche' si e' segnato quando e' arrivato il battito prima. Un client modificato che
// mandasse "dammi mille gemme" non verrebbe nemmeno letto, il numero non c'e' proprio
// nella richiesta.
//
// Cosa NON ferma: chi lascia il gioco aperto senza giocare. Quello e' il tetto
// giornaliero a limitarlo, e sta li' per questo - non per essere avaro.
// ---------------------------------------------------------------------------

async function gioca(env, chi) {
  const adesso = Date.now();
  const giocatore = await env.DB
    .prepare('SELECT gemme, visto, giorno, guadagnate, scatole_oggi FROM giocatori WHERE uuid = ?')
    .bind(chi.uuid).first();

  if (!giocatore) return json({ errore: 'giocatore sconosciuto' }, 404);

  // Primo battito: si segna l'ora e basta. Senza, il tempo passato dalla creazione
  // dell'account verrebbe contato come tempo di gioco
  if (!giocatore.visto) {
    await env.DB.prepare('UPDATE giocatori SET visto = ? WHERE uuid = ? AND visto = ?')
      .bind(adesso, chi.uuid, giocatore.visto).run();
    return json(await stato(env, chi));
  }

  const passato = Math.min(adesso - giocatore.visto, MASSIMO_PER_BATTITO);
  if (passato < INTERVALLO_MINIMO) {
    // Non si aggiorna "visto": cosi' i secondi continuano a maturare invece di azzerarsi
    // a ogni battito. Se no, mandandone uno ogni ventinove secondi non si guadagnerebbe
    // mai piu' niente
    return json(await stato(env, chi));
  }

  const oggi = giornoDi(adesso);
  const giaOggi = giocatore.giorno === oggi ? giocatore.guadagnate : 0;

  const maturate = Math.floor((passato * GEMME_AL_MINUTO) / 60000);
  const guadagno = Math.max(0, Math.min(maturate, TETTO_GIORNALIERO - giaOggi));

  // La condizione su "visto" e' il lucchetto: due battiti che arrivano insieme leggono
  // lo stesso valore, ma solo il primo a scrivere lo trova ancora com'era. Il secondo
  // non cambia niente. E' li' che nascerebbe il raddoppio delle gemme
  const scritto = await env.DB.prepare(
    'UPDATE giocatori SET gemme = gemme + ?, guadagnate = ?, giorno = ?, visto = ?'
    + ' WHERE uuid = ? AND visto = ?'
  ).bind(guadagno, giaOggi + guadagno, oggi, adesso, chi.uuid, giocatore.visto).run();

  // Una scatola ogni tanto, mentre si gioca. Il tiro lo fa il server: se lo facesse il
  // client, bastherebbe dirgli di aver trovato una scatola a ogni battito
  if (scritto.meta && scritto.meta.changes === 1 && guadagno > 0) {
    const oggiScatole = giocatore.giorno === oggi ? (giocatore.scatole_oggi || 0) : 0;
    if (oggiScatole < SCATOLE_AL_GIORNO && Math.random() < SCATOLA_PROBABILITA) {
      await env.DB.prepare(
        'UPDATE giocatori SET scatole = scatole + 1, scatole_oggi = ? WHERE uuid = ?'
      ).bind(oggiScatole + 1, chi.uuid).run();
    } else if (giocatore.giorno !== oggi) {
      // Giorno nuovo: il conto delle scatole trovate riparte, come quello delle gemme
      await env.DB.prepare('UPDATE giocatori SET scatole_oggi = 0 WHERE uuid = ?')
        .bind(chi.uuid).run();
    }
  }

  if (scritto.meta && scritto.meta.changes === 1 && guadagno > 0) {
    await env.DB.prepare(
      'INSERT INTO movimenti (chiave, uuid, tipo, quanto, cosa, quando) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(chi.uuid + ':' + adesso + ':' + casuale(4), chi.uuid, 'guadagno', guadagno, null, adesso).run();
  }

  return json(await stato(env, chi));
}

// ---------------------------------------------------------------------------
// I codici
//
// Il punto delicato e' uno solo: un codice non deve poter valere due volte. Non basta
// leggere "l'ha gia' usato?" e poi scrivere, perche' fra la lettura e la scrittura ci
// sta comodo un secondo click. Quindi prima si prova a PRENDERE il posto - una riga con
// chiave doppia (codice, giocatore) - e solo se il posto era libero si va avanti.
// ---------------------------------------------------------------------------

async function codice(richiesta, env, chi) {
  const corpo = await leggi(richiesta);

  // Maiuscole e spazi tolti: chi lo copia da un video se lo porta dietro come capita, e
  // un codice che non funziona per uno spazio sembra un codice finto
  const testo = String(corpo.codice || '').trim().toUpperCase();
  if (!testo || testo.length > 40) return json({ errore: 'codice non valido' }, 400);

  const adesso = Date.now();

  // Primo passo: prendersi il posto. Se c'e' gia', questo codice se l'e' gia' preso
  try {
    await env.DB.prepare(
      'INSERT INTO codici_usati (codice, uuid, quando) VALUES (?, ?, ?)'
    ).bind(testo, chi.uuid, adesso).run();
  } catch (giaUsato) {
    return json(Object.assign({ errore: 'codice gia usato' }, await stato(env, chi)), 400);
  }

  // Secondo passo: consumare un uso. Il controllo che ne restino e quello sulla scadenza
  // stanno DENTRO l'istruzione che incrementa: due persone che riscattano insieme
  // l'ultimo uso disponibile non possono passare tutte e due
  const preso = await env.DB.prepare(
    'UPDATE codici SET usi = usi + 1'
    + ' WHERE codice = ?1 AND usi < usi_max AND (scade IS NULL OR scade > ?2)'
  ).bind(testo, adesso).run();

  if (!preso.meta || preso.meta.changes !== 1) {
    await env.DB.prepare('DELETE FROM codici_usati WHERE codice = ? AND uuid = ?')
      .bind(testo, chi.uuid).run();
    return json(Object.assign({ errore: 'codice inesistente o esaurito' },
      await stato(env, chi)), 400);
  }

  const voce = await env.DB.prepare('SELECT gemme FROM codici WHERE codice = ?')
    .bind(testo).first();
  const quante = voce ? voce.gemme : 0;

  await env.DB.prepare('UPDATE giocatori SET gemme = gemme + ? WHERE uuid = ?')
    .bind(quante, chi.uuid).run();

  await env.DB.prepare(
    'INSERT INTO movimenti (chiave, uuid, tipo, quanto, cosa, quando) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind('codice:' + testo + ':' + chi.uuid, chi.uuid, 'codice', quante, testo, adesso).run();

  return json(Object.assign({ riscattate: quante }, await stato(env, chi)));
}

// ---------------------------------------------------------------------------
// I regali
//
// Qui il rischio e' l'opposto: accreditare senza addebitare, o addebitare due volte. Si
// toglie prima e si mette dopo, e se il secondo passo fallisce si rimette a posto il
// primo - perche' fra i due non c'e' modo di tenere ferma la stanza.
// ---------------------------------------------------------------------------

async function regala(richiesta, env, chi) {
  const corpo = await leggi(richiesta);
  const aChi = String(corpo.a || '').trim();
  const quanto = Math.floor(Number(corpo.quanto));
  const chiave = String(corpo.chiave || '');

  if (!aChi) return json({ errore: 'manca il nome' }, 400);
  if (!chiave || chiave.length > 80) return json({ errore: 'manca la chiave' }, 400);
  if (!Number.isFinite(quanto) || quanto <= 0 || quanto > REGALO_MASSIMO) {
    return json({ errore: 'quantita non valida' }, 400);
  }

  // Il destinatario si cerca per nome, e dev'essere gia' entrato almeno una volta: non
  // si regala a qualcuno che non esiste, se no le gemme sparirebbero nel nulla
  const destinatario = await env.DB
    .prepare('SELECT uuid, nome FROM giocatori WHERE nome = ? COLLATE NOCASE')
    .bind(aChi).first();

  if (!destinatario) return json({ errore: 'giocatore mai entrato nel client' }, 404);
  if (destinatario.uuid === chi.uuid) return json({ errore: 'non puoi regalarti gemme' }, 400);

  const mittente = await env.DB.prepare('SELECT padrone FROM giocatori WHERE uuid = ?')
    .bind(chi.uuid).first();
  const padrone = !!(mittente && mittente.padrone);

  const adesso = Date.now();

  // La chiave contro il doppio invio, come per gli acquisti: due click sono una
  // richiesta ripetuta, non due regali
  try {
    await env.DB.prepare(
      'INSERT INTO movimenti (chiave, uuid, tipo, quanto, cosa, quando) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(chiave, chi.uuid, 'regalo', padrone ? 0 : -quanto, destinatario.nome, adesso).run();
  } catch (giaVista) {
    return json(Object.assign({ ripetuta: true }, await stato(env, chi)));
  }

  // Si toglie, col controllo del saldo dentro la stessa istruzione. Al padrone non si
  // toglie niente: le sue gemme non calano mai, ed e' il modo con cui puo' premiare
  // qualcuno senza doverle prima guadagnare
  if (!padrone) {
    const tolto = await env.DB.prepare(
      'UPDATE giocatori SET gemme = gemme - ?1 WHERE uuid = ?2 AND gemme >= ?1'
    ).bind(quanto, chi.uuid).run();

    if (!tolto.meta || tolto.meta.changes !== 1) {
      await env.DB.prepare('DELETE FROM movimenti WHERE chiave = ?').bind(chiave).run();
      return json(Object.assign({ errore: 'gemme insufficienti' }, await stato(env, chi)), 400);
    }
  }

  // Si mette. Se questa fallisse, le gemme sarebbero sparite: si rimettono dov'erano
  try {
    await env.DB.prepare('UPDATE giocatori SET gemme = gemme + ? WHERE uuid = ?')
      .bind(quanto, destinatario.uuid).run();
  } catch (nonRicevuto) {
    if (!padrone) {
      await env.DB.prepare('UPDATE giocatori SET gemme = gemme + ? WHERE uuid = ?')
        .bind(quanto, chi.uuid).run();
    }
    await env.DB.prepare('DELETE FROM movimenti WHERE chiave = ?').bind(chiave).run();
    return json(Object.assign({ errore: 'regalo non riuscito' }, await stato(env, chi)), 500);
  }

  // Anche dalla parte di chi riceve resta scritto, con importo positivo: se un domani un
  // saldo non torna, il registro racconta i due lati della stessa storia
  await env.DB.prepare(
    'INSERT INTO movimenti (chiave, uuid, tipo, quanto, cosa, quando) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(chiave + ':a', destinatario.uuid, 'regalo', quanto, chi.uuid, adesso).run();

  return json(Object.assign({ regalate: quanto, a: destinatario.nome }, await stato(env, chi)));
}

// ---------------------------------------------------------------------------
// Comprare
// ---------------------------------------------------------------------------

async function compra(richiesta, env, chi) {
  const corpo = await leggi(richiesta);
  const id = String(corpo.cosmetico || '');
  const chiave = String(corpo.chiave || '');

  const voce = CATALOGO[id];
  if (!voce) return json({ errore: 'cosmetico inesistente' }, 400);
  if (!chiave || chiave.length > 80) return json({ errore: 'manca la chiave' }, 400);

  const adesso = Date.now();

  const giocatore = await env.DB.prepare('SELECT padrone FROM giocatori WHERE uuid = ?')
    .bind(chi.uuid).first();
  const padrone = !!(giocatore && giocatore.padrone);

  // Primo passo: prendersi la chiave. Se c'e' gia', questa richiesta e' la copia di una
  // gia' arrivata - due click, o il client che riprova perche' la risposta si e' persa -
  // e non deve pagare una seconda volta
  try {
    await env.DB.prepare(
      'INSERT INTO movimenti (chiave, uuid, tipo, quanto, cosa, quando) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(chiave, chi.uuid, 'acquisto', padrone ? 0 : -voce.prezzo, id, adesso).run();
  } catch (giaVista) {
    return json(Object.assign({ ripetuta: true }, await stato(env, chi)));
  }

  // Secondo passo: pagare. Il controllo del saldo e quello del "ce l'ho gia'" stanno
  // DENTRO la stessa istruzione che scala le gemme, e non in un if prima. E' tutta qui la
  // differenza: fra un controllo e una scrittura separati passa un istante in cui una
  // seconda richiesta legge lo stesso saldo, e si compra due volte con i soldi di una.
  // Cosi' invece o la riga cambia o non cambia, e a decidere e' il database
  // Al padrone non si scala niente: il controllo del possesso resta, se no il registro
  // si riempirebbe di acquisti ripetuti della stessa cosa
  const pagato = padrone
    ? { meta: { changes: 1 } }
    : await env.DB.prepare(
        'UPDATE giocatori SET gemme = gemme - ?1'
        + ' WHERE uuid = ?2 AND gemme >= ?1'
        + ' AND NOT EXISTS (SELECT 1 FROM posseduti WHERE uuid = ?2 AND cosmetico = ?3)'
      ).bind(voce.prezzo, chi.uuid, id).run();

  if (!pagato.meta || pagato.meta.changes !== 1) {
    await env.DB.prepare('DELETE FROM movimenti WHERE chiave = ?').bind(chiave).run();
    return json(Object.assign({ errore: 'gemme insufficienti o gia posseduto' },
      await stato(env, chi)), 400);
  }

  // Terzo passo: consegnare. Se due richieste con chiavi diverse fossero passate insieme
  // dal secondo passo, qui la seconda sbatte contro la chiave primaria: si restituiscono
  // le gemme e non resta niente di storto
  try {
    await env.DB.prepare('INSERT INTO posseduti (uuid, cosmetico, preso) VALUES (?, ?, ?)')
      .bind(chi.uuid, id, adesso).run();
  } catch (giaSuo) {
    if (!padrone) {
      await env.DB.prepare('UPDATE giocatori SET gemme = gemme + ? WHERE uuid = ?')
        .bind(voce.prezzo, chi.uuid).run();
    }
    await env.DB.prepare('DELETE FROM movimenti WHERE chiave = ?').bind(chiave).run();
    return json(Object.assign({ errore: 'gia posseduto' }, await stato(env, chi)), 400);
  }

  // Indossato subito: chi compra un cosmetico vuole vederlo, non attivarlo con un
  // secondo click che non ha chiesto. E' quello che faceva gia' il client da solo
  await env.DB.prepare(
    'INSERT INTO indossati (uuid, forma, cosmetico) VALUES (?, ?, ?)'
    + ' ON CONFLICT(uuid, forma) DO UPDATE SET cosmetico = excluded.cosmetico'
  ).bind(chi.uuid, voce.forma, id).run();

  return json(await stato(env, chi));
}

// ---------------------------------------------------------------------------
// Le scatole
// ---------------------------------------------------------------------------

async function compraScatola(richiesta, env, chi) {
  const corpo = await leggi(richiesta);
  const chiave = String(corpo.chiave || '');
  if (!chiave || chiave.length > 80) return json({ errore: 'manca la chiave' }, 400);

  const adesso = Date.now();

  // Il padrone non paga, come per gli acquisti e per i regali. Senza questo controllo
  // vedrebbe infinito sullo schermo e si sentirebbe dire "gemme insufficienti": il
  // saldo mostrato e' infinito, ma il numero sotto e' un numero come gli altri
  const giocatore = await env.DB.prepare('SELECT padrone FROM giocatori WHERE uuid = ?')
    .bind(chi.uuid).first();
  const padrone = !!(giocatore && giocatore.padrone);

  try {
    await env.DB.prepare(
      'INSERT INTO movimenti (chiave, uuid, tipo, quanto, cosa, quando) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(chiave, chi.uuid, 'scatola', padrone ? 0 : -SCATOLA_PREZZO, 'acquisto', adesso).run();
  } catch (giaVista) {
    return json(Object.assign({ ripetuta: true }, await stato(env, chi)));
  }

  // Pagamento e consegna nella stessa istruzione: cosi' non esiste un istante in cui hai
  // pagato senza avere la scatola, ne' il contrario
  const pagato = padrone
    ? await env.DB.prepare('UPDATE giocatori SET scatole = scatole + 1 WHERE uuid = ?')
        .bind(chi.uuid).run()
    : await env.DB.prepare(
        'UPDATE giocatori SET gemme = gemme - ?1, scatole = scatole + 1'
        + ' WHERE uuid = ?2 AND gemme >= ?1'
      ).bind(SCATOLA_PREZZO, chi.uuid).run();

  if (!pagato.meta || pagato.meta.changes !== 1) {
    await env.DB.prepare('DELETE FROM movimenti WHERE chiave = ?').bind(chiave).run();
    return json(Object.assign({ errore: 'gemme insufficienti' }, await stato(env, chi)), 400);
  }

  return json(Object.assign({ comprata: true }, await stato(env, chi)));
}

async function apriScatola(richiesta, env, chi) {
  const corpo = await leggi(richiesta);
  const chiave = String(corpo.chiave || '');
  if (!chiave || chiave.length > 80) return json({ errore: 'manca la chiave' }, 400);

  // Cosa possiede gia': si tira solo fra quello che gli manca. Una scatola che regala un
  // doppione e' una scatola che non si apre piu'
  const possiede = await env.DB
    .prepare('SELECT cosmetico FROM posseduti WHERE uuid = ?').bind(chi.uuid).all();

  const gia = new Set((possiede.results || []).map((r) => r.cosmetico));

  // Quale cassa si sta aprendo. Il nome arriva dal client, quindi non ci si fida: si
  // guarda se e' una di quelle che conosciamo, e se non lo e' si pesca da tutto il
  // catalogo come si e' sempre fatto. Cosi' un client vecchio, che la cassa non la manda
  // affatto, continua a funzionare senza saperne niente
  const nomeCassa = String(corpo.cassa || '');
  const dentro = Object.prototype.hasOwnProperty.call(CASSE, nomeCassa)
    ? CASSE[nomeCassa]
    : Object.keys(CATALOGO);

  const mancanti = dentro.filter((id) => CATALOGO[id] && !gia.has(id));

  const adesso = Date.now();
  const tuttoPreso = mancanti.length === 0;

  try {
    await env.DB.prepare(
      'INSERT INTO movimenti (chiave, uuid, tipo, quanto, cosa, quando) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(chiave, chi.uuid, 'scatola', 0, 'apertura', adesso).run();
  } catch (giaVista) {
    return json(Object.assign({ ripetuta: true }, await stato(env, chi)));
  }

  // Si consuma la scatola PRIMA di tirare, col controllo dentro l'istruzione: due
  // aperture insieme con una scatola sola ne fanno passare una
  const consumata = await env.DB.prepare(
    'UPDATE giocatori SET scatole = scatole - 1 WHERE uuid = ? AND scatole >= 1'
  ).bind(chi.uuid).run();

  if (!consumata.meta || consumata.meta.changes !== 1) {
    await env.DB.prepare('DELETE FROM movimenti WHERE chiave = ?').bind(chiave).run();
    return json(Object.assign({ errore: 'non hai scatole' }, await stato(env, chi)), 400);
  }

  // Chi ha gia' tutto riceve gemme invece di un cosmetico: la scatola si apre lo stesso,
  // e non resta in mano una cosa che non si puo' usare
  if (tuttoPreso) {
    // Il rimborso si tira fra le fasce che quella cassa contiene davvero, non fra tutte.
    // Con le casse a tema le fasce non sono le stesse dappertutto: chi ha finito il Vuoto,
    // che arriva all'esotica, non deve ricevere il rimborso di una comune che li' dentro
    // non c'e' mai stata
    const fasceDentro = [...new Set(
      dentro.filter((id) => CATALOGO[id]).map((id) => CATALOGO[id].rarita)
    )].filter((f) => SCATOLA_PESI[f]);

    const fascia = tiraFascia(fasceDentro.length ? fasceDentro : Object.keys(SCATOLA_PESI));
    const quante = Math.round(PREZZI_FASCIA[fascia] * SCATOLA_RIMBORSO);

    await env.DB.prepare('UPDATE giocatori SET gemme = gemme + ? WHERE uuid = ?')
      .bind(quante, chi.uuid).run();

    return json(Object.assign({ gemme_vinte: quante, rarita: fascia }, await stato(env, chi)));
  }

  const vinto = tira(mancanti);

  try {
    await env.DB.prepare('INSERT INTO posseduti (uuid, cosmetico, preso) VALUES (?, ?, ?)')
      .bind(chi.uuid, vinto, adesso).run();
  } catch (giaSuo) {
    // Due aperture nello stesso istante possono aver tirato la stessa cosa: la scatola
    // si restituisce, cosi' non si perde per un caso
    await env.DB.prepare('UPDATE giocatori SET scatole = scatole + 1 WHERE uuid = ?')
      .bind(chi.uuid).run();
    await env.DB.prepare('DELETE FROM movimenti WHERE chiave = ?').bind(chiave).run();
    return json(Object.assign({ errore: 'riprova' }, await stato(env, chi)), 409);
  }

  await env.DB.prepare(
    'INSERT INTO indossati (uuid, forma, cosmetico) VALUES (?, ?, ?)'
    + ' ON CONFLICT(uuid, forma) DO UPDATE SET cosmetico = excluded.cosmetico'
  ).bind(chi.uuid, CATALOGO[vinto].forma, vinto).run();

  return json(Object.assign({
    vinto: vinto,
    rarita: CATALOGO[vinto].rarita,
  }, await stato(env, chi)));
}

// Il tiro: prima la fascia, poi uno a caso dentro la fascia.
//
// In due passaggi e non uno solo, perche' altrimenti le probabilita' dipenderebbero da
// quante cose ci sono in ogni fascia: con quattro epiche e una esotica, tirando fra
// tutte uscirebbero quattro epiche per ogni esotica a prescindere dai pesi.
//
// Le fasce in cui non manca piu' niente si tolgono e il loro peso si redistribuisce da
// se': chi ha gia' tutte le comuni non pesca il vuoto, pesca piu' spesso il resto.
function tira(mancanti) {
  const perFascia = {};
  for (const id of mancanti) {
    const fascia = CATALOGO[id].rarita;
    if (!SCATOLA_PESI[fascia]) continue;
    (perFascia[fascia] = perFascia[fascia] || []).push(id);
  }

  const disponibili = Object.keys(perFascia);
  if (disponibili.length === 0) return mancanti[Math.floor(Math.random() * mancanti.length)];

  const dentro = perFascia[tiraFascia(disponibili)];
  return dentro[Math.floor(Math.random() * dentro.length)];
}

// Il tiro della fascia, a peso. Sta a parte perche' lo usano in due: chi apre una
// scatola normale e chi ha gia' tutto e riceve gemme
function tiraFascia(disponibili) {
  let somma = 0;
  for (const fascia of disponibili) somma += SCATOLA_PESI[fascia];

  let tiro = Math.random() * somma;
  for (const fascia of disponibili) {
    tiro -= SCATOLA_PESI[fascia];
    if (tiro <= 0) return fascia;
  }
  return disponibili[disponibili.length - 1];
}

// ---------------------------------------------------------------------------
// Indossare e togliere
// ---------------------------------------------------------------------------

async function indossa(richiesta, env, chi) {
  const corpo = await leggi(richiesta);
  const id = String(corpo.cosmetico || '');

  const voce = CATALOGO[id];
  if (!voce) return json({ errore: 'cosmetico inesistente' }, 400);

  // Si controlla il possesso qui e non ci si fida della lista che il client ha in
  // memoria: quella e' una copia, e le copie si modificano
  const suo = await env.DB
    .prepare('SELECT 1 AS c FROM posseduti WHERE uuid = ? AND cosmetico = ?')
    .bind(chi.uuid, id).first();

  if (!suo) return json({ errore: 'non lo possiedi' }, 403);

  const addosso = await env.DB
    .prepare('SELECT cosmetico FROM indossati WHERE uuid = ? AND forma = ?')
    .bind(chi.uuid, voce.forma).first();

  if (addosso && addosso.cosmetico === id) {
    // Gia' addosso: il secondo click lo toglie, com'e' sempre stato nel negozio
    await env.DB.prepare('DELETE FROM indossati WHERE uuid = ? AND forma = ?')
      .bind(chi.uuid, voce.forma).run();
  } else {
    await env.DB.prepare(
      'INSERT INTO indossati (uuid, forma, cosmetico) VALUES (?, ?, ?)'
      + ' ON CONFLICT(uuid, forma) DO UPDATE SET cosmetico = excluded.cosmetico'
    ).bind(chi.uuid, voce.forma, id).run();
  }

  return json(await stato(env, chi));
}

// ---------------------------------------------------------------------------
// Cosa indossano gli altri
//
// Senza gettone: il client la chiama per la gente che ha davanti, e i gettoni degli
// altri non ce li ha. Non si risponde con i saldi ne' con quello che possiedono: solo
// con quello che gia' si vedrebbe guardandoli.
// ---------------------------------------------------------------------------

async function addosso(url, env) {
  const elenco = (url.searchParams.get('uuid') || '')
    .split(',')
    .map((u) => u.trim().toLowerCase())
    .filter((u) => /^[0-9a-f]{32}$/.test(u));

  // Un tetto al numero: senza, una richiesta con diecimila UUID diventa un modo gratis
  // per tenere occupato il server
  const chiesti = elenco.slice(0, 60);
  if (chiesti.length === 0) return json({});

  const segnaposto = chiesti.map(() => '?').join(',');
  const righe = await env.DB
    .prepare('SELECT uuid, cosmetico FROM indossati WHERE uuid IN (' + segnaposto + ')')
    .bind(...chiesti).all();

  const risposta = {};
  for (const riga of righe.results || []) {
    (risposta[riga.uuid] = risposta[riga.uuid] || []).push(riga.cosmetico);
  }
  return json(risposta);
}

// ---------------------------------------------------------------------------
// Attrezzi
// ---------------------------------------------------------------------------

function json(dati, stato) {
  return new Response(JSON.stringify(dati), {
    status: stato || 200,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

async function leggi(richiesta) {
  try {
    return (await richiesta.json()) || {};
  } catch (nonEJson) {
    return {};
  }
}

function casuale(byte) {
  return esadecimale(crypto.getRandomValues(new Uint8Array(byte)));
}

function esadecimale(byte) {
  return Array.from(byte).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Il giorno in UTC: il tetto deve azzerarsi alla stessa ora per tutti, se no chi cambia
// fuso orario si azzera il conto quando gli pare
function giornoDi(quando) {
  return new Date(quando).toISOString().slice(0, 10);
}

function ugualiATempoCostante(a, b) {
  if (a.length !== b.length) return false;
  let differenza = 0;
  for (let i = 0; i < a.length; i++) differenza |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return differenza === 0;
}
