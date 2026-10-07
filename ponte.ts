// Il ponte verso Mojang.
//
// Esiste per un motivo solo: Mojang non risponde alle richieste che partono da un Worker
// di Cloudflare. Le rifiuta tutte con un 403 prima ancora di guardarle - lo abbiamo
// provato su quattro dei loro indirizzi, con e senza intestazioni, sempre 403 - perche'
// Cloudflare marchia le richieste in uscita dai Worker e chi sta davanti a Mojang quel
// marchio lo blocca. Da qualunque altra macchina, invece, rispondono normalmente.
//
// Quindi il server delle gemme resta dov'e', con il suo database, e quando deve chiedere
// "e' davvero lui?" lo chiede a questo pezzetto, che gira altrove e la domanda la puo'
// fare. Sta su Deno Deploy: gratis, senza carta, si incolla in una pagina web.
//
// Non decide niente e non tiene niente: riceve un nome e un biglietto, li gira a Mojang,
// e riporta la risposta. Se domani Mojang sbloccasse i Worker, questo file si cancella e
// non cambia nient'altro.

const MOJANG = "https://sessionserver.mojang.com/session/minecraft/hasJoined";

Deno.serve(async (richiesta: Request) => {
  const url = new URL(richiesta.url);

  if (url.pathname === "/" || url.pathname === "/salute") {
    return json({ ok: true });
  }

  // Serve a sapere se da qui Mojang risponde: chiede di un giocatore finto con un
  // biglietto finto, e riporta solo il numero. Non ha bisogno di chiave perche' non
  // rivela niente - 204 vuol dire "nessuno e' entrato", ed e' la risposta giusta a una
  // domanda inventata. Se rispondesse 403 vorrebbe dire che anche di qui siamo bloccati
  if (url.pathname === "/prova") {
    const finta = await fetch(
      `${MOJANG}?username=Notch&serverId=0000000000000000000000000000000000000000`,
    );
    return json({ mojang: finta.status, raggiungibile: finta.status === 204 });
  }

  if (url.pathname !== "/hasjoined") {
    return json({ errore: "non esiste" }, 404);
  }

  // La chiave la conoscono solo questo ponte e il server delle gemme. Non protegge un
  // segreto - quello che c'e' dietro e' un'interrogazione pubblica di Mojang - ma
  // impedisce che il ponte diventi il passaggio gratuito di chiunque lo trovi, e che la
  // quota gratuita finisca per colpa di un estraneo
  const attesa = Deno.env.get("CHIAVE");
  if (!attesa || richiesta.headers.get("x-chiave") !== attesa) {
    return json({ errore: "non autorizzato" }, 401);
  }

  const nome = url.searchParams.get("nome") ?? "";
  const biglietto = url.searchParams.get("biglietto") ?? "";
  if (!nome || !biglietto) return json({ errore: "manca nome o biglietto" }, 400);

  const risposta = await fetch(
    `${MOJANG}?username=${encodeURIComponent(nome)}&serverId=${encodeURIComponent(biglietto)}`,
  );

  // 204 vuol dire che con quel biglietto non e' entrato nessuno. Non e' un errore del
  // ponte: si riporta il numero e decide il server delle gemme
  if (risposta.status !== 200) {
    return json({ stato: risposta.status });
  }

  const profilo = await risposta.json();
  return json({ stato: 200, id: profilo?.id ?? null, nome: profilo?.name ?? null });
});

function json(dati: unknown, stato = 200): Response {
  return new Response(JSON.stringify(dati), {
    status: stato,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
