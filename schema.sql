-- Le tabelle delle gemme e dei cosmetici di SnidolClient.
--
-- Si esegue una volta sola, nella console di D1. Ogni CREATE ha IF NOT EXISTS, quindi
-- rieseguirlo per intero non rompe niente: serve quando si aggiunge una tabella e non ci
-- si ricorda quali c'erano gia'.

-- Un giocatore. La chiave e' l'UUID di Minecraft e non il nome: il nome si cambia, e chi
-- lo cambia si ritroverebbe senza gemme mentre il nome vecchio resterebbe libero per
-- qualcun altro, che si troverebbe le gemme di un altro.
CREATE TABLE IF NOT EXISTS giocatori (
  uuid       TEXT PRIMARY KEY,
  nome       TEXT NOT NULL,
  gemme      INTEGER NOT NULL DEFAULT 0,

  -- Ultimo battito ricevuto, in millisecondi. E' anche il lucchetto: si scrive solo
  -- insieme alle gemme guadagnate, e chi scrive controlla di aver letto l'ultimo valore
  visto      INTEGER NOT NULL DEFAULT 0,

  -- Il tetto giornaliero. Il giorno sta scritto qui e non si deduce da "visto": se uno
  -- non gioca per una settimana, il conto di oggi deve ripartire da zero lo stesso
  giorno     TEXT NOT NULL DEFAULT '',
  guadagnate INTEGER NOT NULL DEFAULT 0,

  -- Chi prende tutto senza pagare. Si accende solo da qui, a mano: nel client non c'e'
  -- niente da modificare per ottenerlo, perche' il client non lo decide. Prima era un
  -- elenco di nomi dentro il mod, e per avere il negozio gratis bastava aggiungerci il
  -- proprio - non serviva nemmeno saper programmare, bastava aprire il file
  padrone    INTEGER NOT NULL DEFAULT 0,

  creato     INTEGER NOT NULL
);

-- Cosa possiede. La chiave doppia impedisce di comprare due volte la stessa cosa anche
-- se due richieste arrivano nello stesso istante: la seconda non entra proprio.
CREATE TABLE IF NOT EXISTS posseduti (
  uuid      TEXT NOT NULL,
  cosmetico TEXT NOT NULL,
  preso     INTEGER NOT NULL,
  PRIMARY KEY (uuid, cosmetico)
);

-- Cosa indossa. La chiave e' (giocatore, forma) invece di (giocatore, cosmetico): cosi'
-- e' il database stesso a far rispettare la regola che un cappello alla volta si porta,
-- ma cappello e ali insieme si'. Senza, la regola starebbe solo nel codice del client,
-- cioe' in un posto dove non conta.
CREATE TABLE IF NOT EXISTS indossati (
  uuid      TEXT NOT NULL,
  forma     TEXT NOT NULL,
  cosmetico TEXT NOT NULL,
  PRIMARY KEY (uuid, forma)
);

-- Il registro di ogni movimento di gemme.
--
-- La chiave e' quella che manda il client, e serve contro il doppio invio: se la stessa
-- richiesta arriva due volte - due click, o una risposta persa e il client che riprova -
-- la seconda sbatte contro la chiave primaria e non scala niente. E' il modo piu' banale
-- di bucare un negozio, e si chiude qui invece che sperando che non capiti.
--
-- Serve anche per un'altra cosa: se un giorno un saldo non torna, qui c'e' scritto
-- perche', movimento per movimento.
CREATE TABLE IF NOT EXISTS movimenti (
  chiave TEXT PRIMARY KEY,
  uuid   TEXT NOT NULL,
  tipo   TEXT NOT NULL,
  quanto INTEGER NOT NULL,
  cosa   TEXT,
  quando INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS movimenti_per_giocatore ON movimenti (uuid, quando);

-- I biglietti dell'accesso, validi pochi secondi.
--
-- Il giro e' quello che Minecraft fa per entrare in un server: il client dice a Mojang
-- "sto entrando nel server con questo codice", e noi chiediamo a Mojang "chi e' entrato
-- con questo codice?". Il codice lo diamo noi e vale una volta sola, se no chi
-- intercettasse una richiesta potrebbe rigiocarla e farsi passare per un altro.
CREATE TABLE IF NOT EXISTS ingressi (
  nonce  TEXT PRIMARY KEY,
  creato INTEGER NOT NULL
);
