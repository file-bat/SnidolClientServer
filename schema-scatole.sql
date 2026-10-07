-- Le scatole. Da eseguire una volta nella Console di D1.

-- Quante scatole chiuse ha in mano, e quante ne ha trovate oggi giocando.
--
-- Il conto di oggi serve al tetto giornaliero: senza, chi lascia il client aperto tutta
-- la notte si sveglia con trenta scatole, e il negozio non ha piu' senso.
ALTER TABLE giocatori ADD COLUMN scatole INTEGER NOT NULL DEFAULT 0;
ALTER TABLE giocatori ADD COLUMN scatole_oggi INTEGER NOT NULL DEFAULT 0;
