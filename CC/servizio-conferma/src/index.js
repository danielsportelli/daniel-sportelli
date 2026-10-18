// Servizio "ocb-conferma" (nome interno, il servizio ora si chiama Cocktail Catering): manda a chi compila il modulo di Cocktail Catering un'email di conferma breve, via Brevo.
// La notifica a Daniel resta a Web3Forms (la pagina la invia come prima); qui parte SOLO la conferma al cliente.
// Chiamata dalla pagina CC/index.html: POST {email, sito, nome, data, ospiti, nazione, preventivo, extra, note} -> {ok:true}. Solo "email" e obbligatoria:
// gli altri campi servono al riepilogo nell'email e, se mancano, l'email resta valida. Il campo "sito" e una trappola per i bot (deve restare vuoto).
// Protezioni: solo dal sito danielsportelli.it, email valida, max 3 invii all'ora per IP e max 60 al giorno in totale.
// Secret: BREVO_API_KEY.  Binding: LIMITI (KV).
const ORIGINI = ['https://danielsportelli.it', 'https://www.danielsportelli.it'];
const MAX_ORA_PER_IP = 3, MAX_GIORNO = 60;
// Mittente: Daniel Sportelli <info@danielsportelli.it> (dominio autenticato su Brevo il 15/10/2026). Non usare mai indirizzi di Cocktail Legend: sono progetti separati.
const MITTENTE = { name: 'Daniel Sportelli', email: 'info@danielsportelli.it' };
const INVIO_ATTIVO = true;

function cors(origin) {
  return { 'Access-Control-Allow-Origin': ORIGINI.includes(origin) ? origin : ORIGINI[0], 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Vary': 'Origin' };
}
const risposta = (corpo, stato, origin) => new Response(JSON.stringify(corpo), { status: stato, headers: { 'Content-Type': 'application/json', ...cors(origin) } });

// Testo ricevuto dalla pagina: ripulito e accorciato; tutto cio che finisce nell'email viene "escapato".
const pulisci = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u001f]+/g, ' ').trim().slice(0, max);
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const PAGINA = 'https://danielsportelli.it/CC/';

// Email di conferma: dice chi scrive, di quale servizio si tratta e riepiloga la richiesta (le righe vuote non compaiono).
function emailConferma(d) {
  const righe = [['Data dell\'evento', d.data], ['Ospiti', d.ospiti], ['Luogo', d.nazione], ['Formula scelta', d.preventivo], ['Extra', d.extra], ['Note', d.note]].filter((r) => r[1]);
  const saluto = d.nome ? 'Ciao ' + esc(d.nome) + ',' : 'Ciao,';
  const tabella = righe.length
    ? '<table role="presentation" style="width:100%;border-collapse:collapse;margin:8px 0 18px;">' + righe.map((r) => '<tr><td style="padding:8px 12px 8px 0;border-bottom:1px solid #e2e8f0;font-size:14px;color:#64748b;vertical-align:top;white-space:nowrap;">' + r[0] + '</td><td style="padding:8px 0;border-bottom:1px solid #e2e8f0;font-size:15px;color:#1e293b;">' + esc(r[1]) + '</td></tr>').join('') + '</table>'
    : '';
  const html = '<div style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;color:#1e293b;max-width:540px;">'
    + '<p>' + saluto + '</p>'
    + '<p>grazie per la tua richiesta a <b>Cocktail Catering</b>, il servizio di open bar professionale per eventi aziendali.</p>'
    + (righe.length ? '<p>Ecco il riepilogo di quello che ci hai inviato:</p>' + tabella : '')
    + '<p>Ti rispondiamo <b>il prima possibile</b> a questo indirizzo email, con il preventivo e i prossimi passi.</p>'
    + '<p style="margin-top:24px;">A presto,<br>Daniel Sportelli<br>Cocktail Catering<br><a href="mailto:info@danielsportelli.it" style="color:#1e293b;">info@danielsportelli.it</a></p>'
    + '<p style="margin-top:28px;font-size:12px;color:#94a3b8;line-height:1.5;">Hai ricevuto questa email perché hai compilato il modulo su <a href="' + PAGINA + '" style="color:#94a3b8;">danielsportelli.it/CC</a>. Se non sei stato tu, puoi ignorarla.</p></div>';
  const testo = saluto + '\n\ngrazie per la tua richiesta a Cocktail Catering, il servizio di open bar professionale per eventi aziendali.\n\n'
    + (righe.length ? 'Ecco il riepilogo di quello che ci hai inviato:\n' + righe.map((r) => '- ' + r[0] + ': ' + r[1]).join('\n') + '\n\n' : '')
    + 'Ti rispondiamo il prima possibile a questo indirizzo email, con il preventivo e i prossimi passi.\n\nA presto,\nDaniel Sportelli\nCocktail Catering\ninfo@danielsportelli.it\n\n'
    + 'Hai ricevuto questa email perché hai compilato il modulo su ' + PAGINA + '. Se non sei stato tu, puoi ignorarla.';
  return { html, testo };
}

export default {
  async fetch(req, env) {
    const origin = req.headers.get('Origin') || '';
    const u = new URL(req.url);
    if (u.pathname === '/health') return new Response('ok');
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) });
    if (u.pathname !== '/conferma' || req.method !== 'POST') return new Response('non trovato', { status: 404 });
    if (!ORIGINI.includes(origin)) return risposta({ ok: false }, 403, origin);

    let dati; try { dati = await req.json(); } catch (e) { return risposta({ ok: false }, 400, origin); }
    const email = String((dati && dati.email) || '').trim();
    if (dati && dati.sito) return risposta({ ok: true }, 200, origin);                       // trappola per bot: finge di aver inviato
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 120) return risposta({ ok: false, errore: 'email non valida' }, 400, origin);

    // limiti
    const ip = req.headers.get('CF-Connecting-IP') || 'sconosciuto', ora = new Date().toISOString().slice(0, 13), giorno = ora.slice(0, 10);
    const kIp = 'ip:' + ip + ':' + ora, kGiorno = 'tot:' + giorno;
    const nIp = Number((await env.LIMITI.get(kIp)) || 0), nTot = Number((await env.LIMITI.get(kGiorno)) || 0);
    if (nIp >= MAX_ORA_PER_IP || nTot >= MAX_GIORNO) return risposta({ ok: false, errore: 'troppe richieste' }, 429, origin);
    await env.LIMITI.put(kIp, String(nIp + 1), { expirationTtl: 7200 });
    await env.LIMITI.put(kGiorno, String(nTot + 1), { expirationTtl: 172800 });

    if (!INVIO_ATTIVO) return risposta({ ok: true, inviata: false }, 200, origin);
    const d = { nome: pulisci(dati.nome, 60), data: pulisci(dati.data, 20), ospiti: pulisci(dati.ospiti, 10), nazione: pulisci(dati.nazione, 40), preventivo: pulisci(dati.preventivo, 160), extra: pulisci(dati.extra, 160), note: pulisci(dati.note, 400) };
    const mail = emailConferma(d);
    const r = await fetch('https://api.brevo.com/v3/smtp/email', { method: 'POST', headers: { 'api-key': env.BREVO_API_KEY, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ sender: MITTENTE, replyTo: { name: 'Daniel Sportelli', email: 'info@danielsportelli.it' },
        to: [{ email }], subject: 'Cocktail Catering: abbiamo ricevuto la tua richiesta', htmlContent: mail.html, textContent: mail.testo }) });
    if (!r.ok) { console.error('Brevo: HTTP ' + r.status + ' ' + (await r.text()).slice(0, 200)); return risposta({ ok: false }, 502, origin); }
    return risposta({ ok: true }, 200, origin);
  }
};
