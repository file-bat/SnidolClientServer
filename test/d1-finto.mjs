// Un D1 di prova, sopra lo SQLite che Node ha gia' dentro.
//
// D1 e' SQLite: le stesse istruzioni, gli stessi vincoli, gli stessi errori quando una
// chiave primaria e' gia' presa. Qui si ricopia solo la sua forma - prepare, bind, run,
// first, all - cosi' worker.js gira cosi' com'e', senza una riga cambiata per i test.

import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

const SCHEMI = ['schema.sql', 'schema-codici.sql', 'schema-scatole.sql', 'schema-amici.sql'];

export function nuovoDatabase() {
  const db = new DatabaseSync(':memory:');
  for (const file of SCHEMI) {
    db.exec(readFileSync(new URL('../' + file, import.meta.url), 'utf8'));
  }

  return {
    sql: db,
    prepare(testo) {
      return istruzione(db, testo, []);
    },
    // Come in D1: tutte o nessuna. Senza await fra un'istruzione e l'altra, cosi' nessuna
    // altra richiesta puo' infilarsi in mezzo, proprio come nella transazione vera
    async batch(istruzioni) {
      db.exec('BEGIN');
      try {
        const esiti = istruzioni.map((i) => i.esegui());
        db.exec('COMMIT');
        return esiti;
      } catch (rotto) {
        db.exec('ROLLBACK');
        throw rotto;
      }
    },
  };
}

function istruzione(db, testo, valori) {
  const esegui = () => {
    const esito = db.prepare(testo).run(...valori);
    return { success: true, meta: { changes: Number(esito.changes) } };
  };
  return {
    esegui,
    bind(...nuovi) {
      return istruzione(db, testo, nuovi);
    },
    async run() {
      return esegui();
    },
    async first() {
      return db.prepare(testo).get(...valori) ?? null;
    },
    async all() {
      return { success: true, results: db.prepare(testo).all(...valori) };
    },
  };
}
