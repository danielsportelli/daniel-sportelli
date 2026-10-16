// Foglio "CRM Cocktail System": riceve una riga per ogni persona che chiede la guida.
// Come si pubblica:
// 1. Crea un foglio Google nuovo, chiamalo "CRM Cocktail System".
// 2. Nella riga 1 scrivi le intestazioni, una per colonna:
//    Data | Fonte | Email | Cocktail al giorno | Giorni al mese | Prezzo medio | Totale annuo | Consenso altre email | Stato
// 3. Estensioni > Apps Script > incolla questo codice.
// 4. Sostituisci SHEET_ID con l'ID del foglio (la parte dell'indirizzo tra /d/ e /edit) e TOKEN con una parola lunga e casuale che scegli tu.
// 5. Distribuisci > Nuova distribuzione > tipo "App web" > Esegui come: Me > Chi ha accesso: Chiunque. Copia l'indirizzo che finisce con /exec.
// 6. Dalla cartella del servizio:  npx wrangler secret put SHEET_URL   (incolla l'indirizzo /exec)
//                                   npx wrangler secret put SHEET_TOKEN (incolla lo stesso TOKEN)

const SHEET_ID = 'INCOLLA_QUI_L_ID_DEL_FOGLIO';
const TOKEN = 'INCOLLA_QUI_LA_PAROLA_SEGRETA';

// Evita che testi inseriti dagli utenti vengano interpretati come formule.
function clean_(v) {
  v = String(v || '').trim().slice(0, 1000);
  return /^[=+\-@]/.test(v) ? "'" + v : v;
}

function doPost(e) {
  const p = (e && e.parameter) || {};
  if (p.token !== TOKEN) return ContentService.createTextOutput('no');
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sh = SpreadsheetApp.openById(SHEET_ID).getSheets()[0];
    sh.appendRow([
      new Date(),
      clean_(p.fonte),
      clean_(p.email),
      clean_(p.cocktail),
      clean_(p.giorni),
      clean_(p.prezzo),
      clean_(p.totale),
      clean_(p.marketing),
      'Nuovo'
    ]);
  } finally {
    lock.releaseLock();
  }
  return ContentService.createTextOutput('ok');
}
