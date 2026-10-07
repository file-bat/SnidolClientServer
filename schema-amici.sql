-- Gli amici. Da eseguire una volta nella Console di D1.

-- Dove si trova, e da quando non si fa sentire.
--
-- "presente" non e' "visto": quello e' il lucchetto delle gemme e si aggiorna solo quando
-- matura qualcosa, mentre questo si scrive a ogni battito. "dove" e' l'indirizzo del
-- server, ripulito; NULL vuol dire in una partita da solo, o nei menu.
ALTER TABLE giocatori ADD COLUMN presente INTEGER NOT NULL DEFAULT 0;
ALTER TABLE giocatori ADD COLUMN dove TEXT;

-- Una richiesta d'amicizia in attesa di risposta.
--
-- La chiave doppia impedisce di mandarne due uguali, anche cliccando due volte. Quella
-- nell'altra direzione e' una cosa diversa, e non si salva: se B ha gia' chiesto ad A e A
-- chiede a B, sono semplicemente amici.
CREATE TABLE IF NOT EXISTS richieste (
  da     TEXT NOT NULL,
  a      TEXT NOT NULL,
  quando INTEGER NOT NULL,
  PRIMARY KEY (da, a)
);

CREATE INDEX IF NOT EXISTS richieste_ricevute ON richieste (a);

-- Un'amicizia, scritta due volte: una riga per ciascuno dei due.
--
-- Costa il doppio delle righe, ma la domanda che si fa piu' spesso - "chi sono i miei
-- amici?" - diventa una lettura sola, senza dover cercare il proprio UUID in due colonne
-- diverse. Le due righe si scrivono e si cancellano sempre insieme.
CREATE TABLE IF NOT EXISTS amici (
  uuid  TEXT NOT NULL,
  amico TEXT NOT NULL,
  dal   INTEGER NOT NULL,
  PRIMARY KEY (uuid, amico)
);
