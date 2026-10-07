-- Codici e regali. Da eseguire una volta nella Console di D1.

-- Un codice riscattabile. Lo crei tu a mano, da qui:
--
--   INSERT INTO codici (codice, gemme, usi_max, scade)
--   VALUES ('BENVENUTO', 250, 100, NULL);
--
-- usi_max e' quante persone in tutto possono usarlo: 1 per un codice personale, 100 per
-- uno da mettere in descrizione a un video. scade e' in millisecondi, oppure NULL per
-- non farlo scadere mai.
CREATE TABLE IF NOT EXISTS codici (
  codice  TEXT PRIMARY KEY,
  gemme   INTEGER NOT NULL,
  usi_max INTEGER NOT NULL DEFAULT 1,
  usi     INTEGER NOT NULL DEFAULT 0,
  scade   INTEGER
);

-- Chi ha usato cosa.
--
-- La chiave doppia e' quella che impedisce di riscattare due volte lo stesso codice: la
-- seconda volta la riga non entra, e non entra nemmeno se le due richieste arrivano
-- nello stesso millesimo di secondo. Senza questa tabella basterebbe premere due volte.
CREATE TABLE IF NOT EXISTS codici_usati (
  codice TEXT NOT NULL,
  uuid   TEXT NOT NULL,
  quando INTEGER NOT NULL,
  PRIMARY KEY (codice, uuid)
);

-- Per ritrovare chi si chiama in un certo modo quando si fa un regalo. Il nome non e'
-- la chiave dei giocatori - quella e' l'UUID, perche' i nomi si cambiano - ma per
-- regalare le gemme si scrive un nome, non un UUID
CREATE INDEX IF NOT EXISTS giocatori_per_nome ON giocatori (nome);
