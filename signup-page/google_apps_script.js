/**
 * Google Apps Script — Signup Form Backend
 * Paste this into: script.google.com → New Project
 *
 * SETUP (5 minutes):
 * 1. Go to https://script.google.com → New project
 * 2. Paste this entire file, replacing the code
 * 3. Replace SHEET_ID below with your Google Sheet ID
 *    (from the URL: docs.google.com/spreadsheets/d/YOUR_SHEET_ID/edit)
 * 4. Click Deploy → New deployment → Web app
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 5. Copy the Web App URL
 * 6. Paste it into index.html where it says PASTE_YOUR_GOOGLE_APPS_SCRIPT_URL_HERE
 * 7. Deploy your index.html to Netlify or GitHub Pages (free)
 */

const SHEET_ID  = 'YOUR_GOOGLE_SHEET_ID_HERE';  // ← replace this
const SHEET_TAB = 'Sheet1';                       // tab name in your sheet

function doPost(e) {
  try {
    const data  = JSON.parse(e.postData.contents);
    const name  = (data.name  || '').trim();
    const email = (data.email || '').trim();

    if (!email || !email.includes('@')) {
      return jsonResponse({ status: 'error', error: 'Invalid email address.' });
    }

    const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_TAB);
    if (!sheet) {
      return jsonResponse({ status: 'error', error: 'Sheet not found.' });
    }

    // Check for duplicates
    const existing = sheet.getDataRange().getValues();
    for (let i = 1; i < existing.length; i++) {
      const existingEmail = String(existing[i][1] || '').trim().toLowerCase();
      if (existingEmail === email.toLowerCase()) {
        return jsonResponse({ status: 'ok', message: 'Already subscribed!' });
      }
    }

    // Append: Sl No., Email id, Name, Signup Date
    const lastRow = sheet.getLastRow();
    const slNo    = lastRow; // row count minus header = sequence number
    sheet.appendRow([slNo, email, name, new Date().toISOString().split('T')[0]]);

    return jsonResponse({ status: 'ok', message: 'Subscribed successfully!' });
  } catch (err) {
    return jsonResponse({ status: 'error', error: err.message });
  }
}

// Handle CORS preflight
function doGet(e) {
  return jsonResponse({ status: 'ok', message: 'D-Daily-Drop signup endpoint' });
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
