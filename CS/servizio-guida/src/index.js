// Servizio "cs-guida": a chi lascia l'email sulla landing Cocktail System manda via Brevo lo scontrino personalizzato e la mini guida (PDF).
// In più: avvisa Daniel, scrive una riga nel foglio Google (CRM) e, solo con il consenso facoltativo, aggiunge il contatto alla lista Brevo.
// Chiamato da CS/index.html: POST /richiesta  {email, cocktail, giorni, prezzo, marketing, sito}  ->  {ok:true}
// Il campo "sito" e una trappola per i bot (deve restare vuoto).
// Protezioni: solo dal sito danielsportelli.it, email valida, numeri limitati, max 3 invii all'ora per IP e max 60 al giorno in totale.
// Secret (wrangler secret put): BREVO_API_KEY, SHEET_URL (indirizzo /exec dello script Google), SHEET_TOKEN.
// Variabile (wrangler.toml): BREVO_LIST_ID (numero della lista Brevo per chi dà il consenso a ricevere altre email).
// Binding: LIMITI (KV, lo stesso di ocb-conferma: le chiavi qui hanno il prefisso "cs:").
const ORIGINI = ['https://danielsportelli.it', 'https://www.danielsportelli.it'];
const MAX_ORA_PER_IP = 3, MAX_GIORNO = 60;
// Mittente: Daniel Sportelli <info@danielsportelli.it> (dominio autenticato su Brevo). Non usare mai indirizzi di Cocktail Legend: sono progetti separati.
const MITTENTE = { name: 'Daniel Sportelli', email: 'info@danielsportelli.it' };
const NOTIFICA_A = 'info@danielsportelli.it';
const PDF_URL = 'https://danielsportelli.it/CS/guida-cocktail-system-q7k3m9x2.pdf';
const CALL_URL = 'https://calendly.com/danielsportelli/pre-attivazione-cocktail-system?utm_source=email-guida';
const INVIO_ATTIVO = true;

function cors(origin) {
  return { 'Access-Control-Allow-Origin': ORIGINI.includes(origin) ? origin : ORIGINI[0], 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Vary': 'Origin' };
}
const risposta = (corpo, stato, origin) => new Response(JSON.stringify(corpo), { status: stato, headers: { 'Content-Type': 'application/json', ...cors(origin) } });
const num = (v, min, max, def) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def; };
const euro = (n) => new Intl.NumberFormat('it-IT', { useGrouping: 'always' }).format(n) + ' €';
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function emailHtml(d) {
  const riga = (a, b) => '<tr><td style="padding:9px 0;border-bottom:1px dashed #cfc9bb;font-size:15px;">' + a + '</td><td style="padding:9px 0;border-bottom:1px dashed #cfc9bb;font-size:15px;text-align:right;font-weight:600;">' + b + '</td></tr>';
  return '<div style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;color:#1F1F1F;max-width:520px;margin:0 auto;padding:8px;">'
    + '<p>Grazie per l\'interesse. Ecco la mini guida e, qui sotto, lo scontrino con i numeri che avete inserito.</p>'
    + '<table role="presentation" style="width:100%;border-collapse:collapse;background:#FBF8F1;padding:18px;margin:18px 0;"><tr><td style="padding:18px;">'
    + '<div style="text-align:center;font-weight:800;font-size:18px;padding-bottom:10px;border-bottom:2px dashed #cfc9bb;">Cocktail System</div>'
    + '<table role="presentation" style="width:100%;border-collapse:collapse;">'
    + riga('Cocktail al giorno', d.cocktail) + riga('Giorni al mese', d.giorni) + riga('Prezzo medio', euro(d.prezzo)) + riga('Al mese', euro(d.mese))
    + '</table>'
    + '<table role="presentation" style="width:100%;border-collapse:collapse;margin-top:12px;"><tr><td style="font-weight:600;font-size:14px;">Totale in 12 mesi</td><td style="text-align:right;font-weight:800;font-size:28px;">' + euro(d.anno) + '</td></tr></table>'
    + '<div style="font-size:12px;color:#55524A;text-align:center;margin-top:14px;">Stima sul fatturato, non sul margine.<br>È uno scenario, non una promessa di risultato.</div>'
    + '</td></tr></table>'
    + '<p>Nella guida, che trovate in allegato, spiego come calcolare il potenziale della vostra struttura, perché assumere un bartender non è la strada giusta con questi volumi e cosa serve per partire.</p>'
    + '<p><a href="' + PDF_URL + '" style="color:#8F6016;">Se non vedete l\'allegato, scaricate la guida da qui.</a></p>'
    + '<p>Se la vostra struttura è nel profilo giusto, il passo successivo è una call conoscitiva di 30 minuti, senza impegno: <a href="' + CALL_URL + '" style="color:#8F6016;">prenotate qui</a>.</p>'
    + '<p style="margin-top:24px;">Daniel Sportelli<br><a href="mailto:info@danielsportelli.it" style="color:#1F1F1F;">info@danielsportelli.it</a></p>'
    + '</div>';
}
function emailTesto(d) {
  return 'Grazie per l\'interesse. Ecco la mini guida e, qui sotto, lo scontrino con i numeri che avete inserito.\n\nCocktail al giorno: ' + d.cocktail + '\nGiorni al mese: ' + d.giorni + '\nPrezzo medio: ' + euro(d.prezzo) + '\nAl mese: ' + euro(d.mese) + '\nTotale in 12 mesi: ' + euro(d.anno)
    + '\n\nStima sul fatturato, non sul margine. È uno scenario, non una promessa di risultato.\n\nLa guida è in allegato. Se non la vedete, scaricatela qui: ' + PDF_URL
    + '\n\nPer prenotare la call conoscitiva di 30 minuti: ' + CALL_URL + '\n\nDaniel Sportelli\ninfo@danielsportelli.it';
}

async function brevoMail(env, corpo) {
  const r = await fetch('https://api.brevo.com/v3/smtp/email', { method: 'POST', headers: { 'api-key': env.BREVO_API_KEY, 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(corpo) });
  if (!r.ok) throw new Error('Brevo email: HTTP ' + r.status + ' ' + (await r.text()).slice(0, 200));
}

export default {
  async fetch(req, env, ctx) {
    const origin = req.headers.get('Origin') || '';
    const u = new URL(req.url);
    if (u.pathname === '/health') return new Response('ok');
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) });
    if (u.pathname !== '/richiesta' || req.method !== 'POST') return new Response('non trovato', { status: 404 });
    if (!ORIGINI.includes(origin)) return risposta({ ok: false }, 403, origin);

    let dati; try { dati = await req.json(); } catch (e) { return risposta({ ok: false }, 400, origin); }
    dati = dati || {};
    if (dati.sito) return risposta({ ok: true }, 200, origin);                                // trappola per bot: finge di aver inviato
    const email = String(dati.email || '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 120) return risposta({ ok: false, errore: 'email non valida' }, 400, origin);

    const d = { email, cocktail: num(dati.cocktail, 1, 200, 10), giorni: num(dati.giorni, 1, 31, 15), prezzo: num(dati.prezzo, 1, 100, 10), marketing: dati.marketing === true };
    d.mese = d.cocktail * d.giorni * d.prezzo; d.anno = d.mese * 12;

    // limiti
    const ip = req.headers.get('CF-Connecting-IP') || 'sconosciuto', ora = new Date().toISOString().slice(0, 13), giorno = ora.slice(0, 10);
    const kIp = 'cs:ip:' + ip + ':' + ora, kGiorno = 'cs:tot:' + giorno;
    const nIp = Number((await env.LIMITI.get(kIp)) || 0), nTot = Number((await env.LIMITI.get(kGiorno)) || 0);
    if (nIp >= MAX_ORA_PER_IP || nTot >= MAX_GIORNO) return risposta({ ok: false, errore: 'troppe richieste' }, 429, origin);
    await env.LIMITI.put(kIp, String(nIp + 1), { expirationTtl: 7200 });
    await env.LIMITI.put(kGiorno, String(nTot + 1), { expirationTtl: 172800 });

    if (!INVIO_ATTIVO) return risposta({ ok: true, inviata: false }, 200, origin);

    // 1) email al visitatore: se fallisce, la pagina lo deve sapere
    try {
      await brevoMail(env, { sender: MITTENTE, replyTo: MITTENTE, to: [{ email }], subject: 'La vostra mini guida: il fatturato che manca',
        htmlContent: emailHtml(d), textContent: emailTesto(d), attachment: [{ url: PDF_URL, name: 'Il-fatturato-che-manca.pdf' }] });
    } catch (e) { console.error(String(e)); return risposta({ ok: false }, 502, origin); }

    // 2) il resto non blocca mai la risposta: avviso a Daniel, riga nel foglio, lista Brevo (solo con consenso)
    ctx.waitUntil((async () => {
      try {
        await brevoMail(env, { sender: MITTENTE, to: [{ email: NOTIFICA_A }], subject: 'Nuovo contatto dalla guida Cocktail System',
          htmlContent: '<p>' + esc(email) + '</p><p>Scenario: ' + d.cocktail + ' cocktail al giorno, ' + d.giorni + ' giorni al mese, ' + d.prezzo + ' € = ' + esc(euro(d.anno)) + ' l\'anno.</p><p>Consenso a ricevere altre email: ' + (d.marketing ? 'sì' : 'no') + '.</p>' });
      } catch (e) { console.error('notifica: ' + String(e)); }
      try {
        if (env.SHEET_URL) {
          const r = await fetch(env.SHEET_URL, { method: 'POST', body: new URLSearchParams({ token: env.SHEET_TOKEN || '', fonte: 'guida-cs', email, cocktail: d.cocktail, giorni: d.giorni, prezzo: d.prezzo, totale: d.anno, marketing: d.marketing ? 'Sì' : 'No' }) });
          if (!r.ok) console.error('foglio: HTTP ' + r.status);
        }
      } catch (e) { console.error('foglio: ' + String(e)); }
      try {
        const lista = Number(env.BREVO_LIST_ID);
        if (d.marketing && lista) {
          const r = await fetch('https://api.brevo.com/v3/contacts', { method: 'POST', headers: { 'api-key': env.BREVO_API_KEY, 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ email, listIds: [lista], updateEnabled: true }) });
          if (!r.ok && r.status !== 204) console.error('lista Brevo: HTTP ' + r.status + ' ' + (await r.text()).slice(0, 200));
        }
      } catch (e) { console.error('lista Brevo: ' + String(e)); }
    })());

    return risposta({ ok: true }, 200, origin);
  }
};
