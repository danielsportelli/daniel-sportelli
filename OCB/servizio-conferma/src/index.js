// Servizio "ocb-conferma": manda a chi compila il modulo di Open Cocktail Bar un'email di conferma breve, via Brevo.
// La notifica a Daniel resta a Web3Forms (la pagina la invia come prima); qui parte SOLO la conferma al cliente.
// Chiamata dalla pagina OCB/ocb.html: POST {email, sito} -> {ok:true}. Il campo "sito" e una trappola per i bot (deve restare vuoto).
// Protezioni: solo dal sito danielsportelli.it, email valida, max 3 invii all'ora per IP e max 60 al giorno in totale.
// Secret: BREVO_API_KEY.  Binding: LIMITI (KV).
const ORIGINI = ['https://danielsportelli.it', 'https://www.danielsportelli.it'];
const MAX_ORA_PER_IP = 3, MAX_GIORNO = 60;

function cors(origin) {
  return { 'Access-Control-Allow-Origin': ORIGINI.includes(origin) ? origin : ORIGINI[0], 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Vary': 'Origin' };
}
const risposta = (corpo, stato, origin) => new Response(JSON.stringify(corpo), { status: stato, headers: { 'Content-Type': 'application/json', ...cors(origin) } });

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

    const html = '<div style="font-family:Arial,sans-serif;font-size:16px;line-height:1.6;color:#1e293b;max-width:520px;">'
      + '<p>Grazie per la richiesta.</p><p>Abbiamo ricevuto i tuoi dati e ti risponderemo nel minor tempo possibile.</p>'
      + '<p style="margin-top:24px;">Daniel Sportelli<br><a href="mailto:info@danielsportelli.it" style="color:#1e293b;">info@danielsportelli.it</a></p></div>';
    const r = await fetch('https://api.brevo.com/v3/smtp/email', { method: 'POST', headers: { 'api-key': env.BREVO_API_KEY, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ sender: { name: 'Open Cocktail Bar', email: 'info@cocktaillegend.app' }, replyTo: { name: 'Open Cocktail Bar', email: 'info@danielsportelli.it' },
        to: [{ email }], subject: 'Conferma ricezione richiesta', htmlContent: html, textContent: 'Grazie per la richiesta.\n\nAbbiamo ricevuto i tuoi dati e ti risponderemo nel minor tempo possibile.\n\nDaniel Sportelli\ninfo@danielsportelli.it' }) });
    if (!r.ok) { console.error('Brevo: HTTP ' + r.status + ' ' + (await r.text()).slice(0, 200)); return risposta({ ok: false }, 502, origin); }
    return risposta({ ok: true }, 200, origin);
  }
};
