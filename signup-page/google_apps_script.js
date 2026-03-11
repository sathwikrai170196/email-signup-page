/**
 * Google Apps Script — Signup Form Backend + Pick History
 * Paste this into: script.google.com → your existing project → replace all code
 *
 * SHEET SETUP:
 * - Tab "Sheet1" (or whatever SHEET_TAB is set to) — mailing list
 * - Tab "History" — created automatically on first save
 *
 * After updating this code:
 *   Deploy → Manage deployments → Edit → New version → Deploy
 */

const SHEET_ID  = '1GnfmyK5MokFZptqGzZe3Rr5MvYGPlqq0ic4WNeNuqo4';
const SHEET_TAB = 'Sheet1';   // mailing list tab name
const HIST_TAB  = 'History';  // auto-created for pick tracking

// ── GET handler ──────────────────────────────────────────────────────────────
function doGet(e) {
  const action = (e && e.parameter) ? (e.parameter.action || '') : '';
  if (action === 'getLastPicks') return getLastPicks();
  return jsonResponse({ status: 'ok', message: 'D-Daily-Drop endpoint' });
}

// ── POST handler ─────────────────────────────────────────────────────────────
function doPost(e) {
  try {
    const body = e.postData ? e.postData.contents : '{}';
    const data = JSON.parse(body);

    if (data.action === 'savePicks') return savePicks(data);

    // Default: signup
    const name  = (data.name  || '').trim();
    const email = (data.email || '').trim();
    if (!email || !email.includes('@')) {
      return jsonResponse({ status: 'error', error: 'Invalid email address.' });
    }
    const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_TAB);
    if (!sheet) return jsonResponse({ status: 'error', error: 'Sheet not found.' });

    const existing = sheet.getDataRange().getValues();
    for (let i = 1; i < existing.length; i++) {
      if (String(existing[i][1] || '').trim().toLowerCase() === email.toLowerCase()) {
        return jsonResponse({ status: 'ok', message: 'Already subscribed!' });
      }
    }
    const slNo = sheet.getLastRow();
    sheet.appendRow([slNo, email, name, new Date().toISOString().split('T')[0]]);
    return jsonResponse({ status: 'ok', message: 'Subscribed successfully!' });

  } catch (err) {
    return jsonResponse({ status: 'error', error: err.message });
  }
}

// ── Get last row from History tab ─────────────────────────────────────────────
function getLastPicks() {
  try {
    const ss    = SpreadsheetApp.openById(SHEET_ID);
    const sheet = ss.getSheetByName(HIST_TAB);
    if (!sheet || sheet.getLastRow() < 2) {
      return jsonResponse({ status: 'ok', picks: [], date: '' });
    }
    // Columns: Date | S1Name | S1Ticker | S1Price | S2Name | S2Ticker | S2Price | ...
    const row = sheet.getRange(sheet.getLastRow(), 1, 1, 13).getValues()[0];
    const picks = [];
    for (let i = 0; i < 4; i++) {
      const base = 1 + i * 3;
      if (row[base]) {
        picks.push({ name: String(row[base]), ticker: String(row[base+1]), price: Number(row[base+2]) });
      }
    }
    return jsonResponse({ status: 'ok', date: String(row[0]), picks });
  } catch (err) {
    return jsonResponse({ status: 'error', error: err.message, picks: [] });
  }
}

// ── Append row to History tab ─────────────────────────────────────────────────
function savePicks(data) {
  try {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    let sheet = ss.getSheetByName(HIST_TAB);
    if (!sheet) {
      sheet = ss.insertSheet(HIST_TAB);
      sheet.appendRow(['Date','S1Name','S1Ticker','S1Price','S2Name','S2Ticker','S2Price','S3Name','S3Ticker','S3Price','S4Name','S4Ticker','S4Price']);
    }
    const picks = data.picks || [];
    const row   = [data.date || ''];
    for (let i = 0; i < 4; i++) {
      const p = picks[i] || {};
      row.push(p.name || '', p.ticker || '', p.price || 0);
    }
    sheet.appendRow(row);
    return jsonResponse({ status: 'ok', message: 'Picks saved.' });
  } catch (err) {
    return jsonResponse({ status: 'error', error: err.message });
  }
}

// ── Utility ───────────────────────────────────────────────────────────────────
function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
