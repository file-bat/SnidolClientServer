# Server delle gemme — SnidolClient

Tiene lui il saldo, i prezzi e chi possiede cosa. Il client non decide piu' niente: chiede
e basta.

Gira su Cloudflare Workers con un database D1. Gratis fino a 100.000 richieste al giorno,
che con un battito al minuto per giocatore vuol dire circa **settanta persone sempre
collegate** prima di doverci pensare.

## Metterlo in piedi (dal pannello, senza installare niente)

1. **Account** su [dash.cloudflare.com](https://dash.cloudflare.com) — lo crei tu.

2. **Il database.** Storage & Databases → D1 → *Create database*, chiamalo `snidol`.
   Poi apri la scheda **Console** e incolla tutto `schema.sql`, quindi *Execute*.

3. **Il programma.** Workers & Pages → *Create* → *Worker*, chiamalo `snidol-gemme`, poi
   *Deploy* (parte un esempio vuoto). Ora *Edit code*: cancella quello che c'e' e incolla
   tutto `worker.js`. *Deploy*.

4. **Attaccare il database al programma.** Nel worker: Settings → Bindings → *Add* → D1
   database. Il nome della variabile dev'essere esattamente `DB`, il database `snidol`.

5. **Il segreto delle firme.** Sempre in Settings → Variables and Secrets → *Add* →
   tipo **Secret**, nome `SEGRETO`. Come valore serve una riga a caso lunga: te la fai
   cosi', e la incolli senza fartela vedere da nessuno.

   ```powershell
   -join ((48..57) + (97..122) | Get-Random -Count 64 | % { [char]$_ })
   ```

6. **Provalo.** L'indirizzo e' scritto in cima alla pagina del worker, del tipo
   `https://snidol-gemme.<tuonome>.workers.dev`.

   ```bash
   curl https://snidol-gemme.tuonome.workers.dev/salute
   ```

   Deve rispondere `{"ok":true}`.

## I test

    node --test

Girano sul `worker.js` vero e su un database SQLite vero (quello che Node 22.5+ ha gia'
dentro, quindi non c'e' niente da installare). L'unica cosa finta e' Mojang, e l'orologio,
che i test spostano a mano invece di aspettare.

Le prove che contano di piu' sono quelle sulle richieste che arrivano **insieme**: due
acquisti, due battiti, due regali, due aperture della stessa scatola nello stesso istante.
E' li' che un negozio si buca, ed e' l'unico modo di provarlo davvero. Su GitHub partono
da soli a ogni modifica.

## Come si entra, senza far girare la password

Il gettone di sessione di Minecraft **non passa mai da questo server**. Il giro e' lo
stesso che il gioco fa per entrare in un server qualunque:

1. il client chiede qui un biglietto usa e getta — `POST /accesso/biglietto`
2. il client dice a **Mojang** "sto entrando nel server *biglietto*", firmando col suo
   gettone: quindi il gettone va solo a Mojang
3. il client ci dice "fatto, sono *nome*" — `POST /accesso`
4. questo server chiede a Mojang **chi** e' entrato con quel biglietto

Se Mojang risponde con un UUID, quella persona ha davvero quell'account. Noi riceviamo un
UUID e niente altro: non c'e' nessuna password da custodire, e se un giorno questo
database finisse in mano a qualcuno, non ci troverebbe dentro l'account di nessuno.

In cambio il client riceve un **gettone nostro**, firmato, che dura dodici ore.

## Le richieste

| Richiesta | Serve il gettone | Cosa fa |
|---|---|---|
| `POST /accesso/biglietto` | no | Da' un biglietto usa e getta |
| `POST /accesso` | no | `{nome, biglietto}` → gettone e stato |
| `GET /io` | si | Gemme, posseduti, indossati |
| `POST /gioca` | si | Il battito: guadagna il tempo giocato |
| `POST /compra` | si | `{cosmetico, chiave}` |
| `POST /indossa` | si | `{cosmetico}` — secondo click lo toglie |
| `GET /addosso?uuid=a,b,c` | no | Cosa indossano gli altri, per disegnarli |
| `GET /regole` | no | I moduli che ogni server vieta, per dominio |
| `GET /amici` | si | Amici (con online e server), richieste ricevute e inviate |
| `POST /amici/chiedi` | si | `{nome}` — se l'altro aveva gia' chiesto, si e' subito amici |
| `POST /amici/accetta` | si | `{uuid}` |
| `POST /amici/rifiuta` | si | `{uuid}` — rifiuta una ricevuta o ritira una inviata |
| `POST /amici/togli` | si | `{uuid}` — toglie l'amicizia a tutti e due |

Il battito (`POST /gioca`) ora puo' dire anche dove si sta giocando: `{server}`. Gli amici
lo vedono solo mentre si e' online. Un indirizzo fatto di numeri, `localhost` o IPv6 si
mostra come "server privato", per non dare in giro l'IP di casa di nessuno.

Per attivare gli amici sul database vero: incolla `schema-amici.sql` nella Console di D1,
una volta sola.

### Le regole dei server

Entrando in un server, la mod spegne i moduli che quel server non permette e scrive nel
pannello perche'. La lista sta in due posti: dentro la mod (`RegoleServer.java`), che vale
anche senza rete, e qui in `REGOLE`, che serve ad aggiungere un server o un divieto
**senza pubblicare un client nuovo**: basta rimettere online il worker. Le due liste si
sommano, quindi da qui si puo' vietare di piu' ma mai riaccendere un modulo vietato.

## Le tre cose che tengono in piedi il negozio

**I prezzi stanno qui.** Nel client c'e' la stessa lista, ma serve solo a disegnare il
negozio. Chi modifica il prezzo la' dentro vede un numero diverso nel riquadro e paga
comunque quello vero.

**Il saldo si controlla dentro l'istruzione che lo scala**, non in un `if` prima:

```sql
UPDATE giocatori SET gemme = gemme - :p
 WHERE uuid = :u AND gemme >= :p
   AND NOT EXISTS (SELECT 1 FROM posseduti WHERE uuid = :u AND cosmetico = :c)
```

Fra un controllo e una scrittura separati passa un istante in cui una seconda richiesta
legge lo stesso saldo: e' li' che si compra due volte con i soldi di una. Provato su
SQLite vero, saldo 500 e cosmetico da 400, due acquisti nello stesso istante:

```
ingenuo : comprati 2, saldo finale -300   <-- BUCATO
questo  : comprati 1, saldo finale 100    <-- ok
```

**Le gemme guadagnate non le dice il client.** Manda un battito vuoto; quanto tempo sia
passato lo sa il server, che si e' segnato il battito prima. Sotto i trenta secondi non
matura niente, sopra i due minuti il tempo in piu' non si conta, e c'e' un tetto al
giorno. Il numero delle gemme nella richiesta **non c'e'**, quindi non si puo' gonfiare.

Quello che questo non ferma: chi lascia il gioco aperto senza giocare. A limitarlo e' il
tetto giornaliero, ed e' li' apposta.
