/**
 * Google Apps Script — Signup Form Backend + Pick History + Performance Tracking
 * Paste this into: script.google.com → your existing project → replace all code
 *
 * SHEET SETUP (all auto-created except Sheet1):
 * - Tab "Sheet1"      — mailing list
 * - Tab "History"     — today's picks (entry price)
 * - Tab "Performance" — next-day outcomes (exit price + % change)
 * - Tab "Opens"       — email open events from tracking pixel
 *
 * After updating: Deploy → Manage deployments → Edit → New version → Deploy
 */

const SHEET_ID  = '1GnfmyK5MokFZptqGzZe3Rr5MvYGPlqq0ic4WNeNuqo4';
const SHEET_TAB = 'Sheet1';
const HIST_TAB  = 'History';
const PERF_TAB  = 'Performance';
const OPEN_TAB  = 'Opens';

// ── GET handler ───────────────────────────────────────────────────────────────
function doGet(e) {
  const action = (e && e.parameter) ? (e.parameter.action || '') : '';
  if (action === 'getLastPicks') return getLastPicks();
  if (action === 'getLast5Days') return getLast5Days();
  if (action === 'getOpenStats') return getOpenStats();
  return jsonResponse({ status: 'ok', message: 'D-Daily-Drop endpoint' });
}

// ── POST handler ──────────────────────────────────────────────────────────────
function doPost(e) {
  try {
    const body = e.postData ? e.postData.contents : '{}';
    const data = JSON.parse(body);

    if (data.action === 'savePicks')       return savePicks(data);
    if (data.action === 'savePerformance') return savePerformance(data);
    if (data.action === 'logOpen')         return logOpen(data);

    // Default: email signup
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
      sheet.appendRow(['Date','S1Name','S1Ticker','S1Price','S2Name','S2Ticker','S2Price',
                       'S3Name','S3Ticker','S3Price','S4Name','S4Ticker','S4Price']);
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

// ── Save yesterday's pick performance (called by n8n Track Performance node) ─
function savePerformance(data) {
  try {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    let sheet = ss.getSheetByName(PERF_TAB);
    if (!sheet) {
      sheet = ss.insertSheet(PERF_TAB);
      sheet.appendRow(['Date','Ticker','Name','EntryPrice','ExitPrice','ChangePct','Positive']);
    }

    const date  = data.date  || '';
    const picks = data.picks || [];
    if (!date || picks.length === 0) {
      return jsonResponse({ status: 'ok', message: 'Nothing to save.' });
    }

    // Prevent duplicate entries for the same date
    if (sheet.getLastRow() > 1) {
      const existingDates = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues().flat();
      if (existingDates.indexOf(date) !== -1) {
        return jsonResponse({ status: 'ok', message: 'Already saved for ' + date });
      }
    }

    picks.forEach(function(p) {
      sheet.appendRow([
        date,
        p.ticker    || '',
        p.name      || '',
        p.prevPrice || '',
        p.noData    ? '' : (p.curPrice || ''),
        p.noData    ? '' : (p.chg      || ''),
        p.noData    ? '' : (p.chg > 0  ? 'TRUE' : 'FALSE')
      ]);
    });

    return jsonResponse({ status: 'ok', message: 'Performance saved for ' + date });
  } catch (err) {
    return jsonResponse({ status: 'error', error: err.message });
  }
}

// ── Get last 5 days performance for AI self-learning ─────────────────────────
function getLast5Days() {
  try {
    const ss    = SpreadsheetApp.openById(SHEET_ID);
    const sheet = ss.getSheetByName(PERF_TAB);
    if (!sheet || sheet.getLastRow() < 2) {
      return jsonResponse({ status: 'ok', days: [] });
    }

    const rows = sheet.getDataRange().getValues().slice(1); // skip header
    const byDate = {};
    const dateOrder = [];
    rows.forEach(function(r) {
      const d = String(r[0]);
      if (!byDate[d]) { byDate[d] = []; dateOrder.push(d); }
      const chg = r[5] === '' ? null : Number(r[5]);
      byDate[d].push({
        ticker:   String(r[1]),
        name:     String(r[2]),
        chg:      chg,
        positive: r[6] === 'TRUE'
      });
    });

    const last5 = dateOrder.slice(-5);
    const days  = last5.map(function(d) {
      const picks    = byDate[d];
      const withData = picks.filter(function(p) { return p.chg !== null; });
      const wins     = withData.filter(function(p) { return p.positive; }).length;
      return {
        date:     d,
        picks:    picks,
        accuracy: wins + '/' + withData.length
      };
    });

    return jsonResponse({ status: 'ok', days: days });
  } catch (err) {
    return jsonResponse({ status: 'error', error: err.message, days: [] });
  }
}

// ── Log email open event (called by tracking pixel) ──────────────────────────
function logOpen(data) {
  try {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    let sheet = ss.getSheetByName(OPEN_TAB);
    if (!sheet) {
      sheet = ss.insertSheet(OPEN_TAB);
      sheet.appendRow(['Timestamp','Date','Email']);
    }
    sheet.appendRow([
      new Date().toISOString(),
      data.date  || '',
      data.email || 'unknown'
    ]);
    return jsonResponse({ status: 'ok' });
  } catch (err) {
    return jsonResponse({ status: 'error', error: err.message });
  }
}

// ── Open stats aggregated by date (for dashboard) ────────────────────────────
function getOpenStats() {
  try {
    const ss    = SpreadsheetApp.openById(SHEET_ID);
    const sheet = ss.getSheetByName(OPEN_TAB);
    if (!sheet || sheet.getLastRow() < 2) {
      return jsonResponse({ status: 'ok', byDate: {}, total: 0 });
    }
    const rows = sheet.getDataRange().getValues().slice(1);
    const byDate = {};
    rows.forEach(function(r) {
      const d = String(r[1]);
      byDate[d] = (byDate[d] || 0) + 1;
    });
    return jsonResponse({ status: 'ok', byDate: byDate, total: rows.length });
  } catch (err) {
    return jsonResponse({ status: 'error', error: err.message, byDate: {}, total: 0 });
  }
}

// ── Utility ───────────────────────────────────────────────────────────────────
function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
