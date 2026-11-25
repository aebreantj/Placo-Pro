/* ============================================================================
 * PLACO PRO — Onglet 4 : Liste de Commande, Exports (JSON/CSV/PDF) & Sync Drive
 * ============================================================================ */
(function (global) {
  'use strict';

  const Store = global.PlacoStore;

  const ui = {
    driveFiles: [],
    driveLoading: false,
    driveStatus: ''
  };

  function esc(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function sanitizeFilename(name) {
    return String(name || 'chantier-placo-pro')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9_-]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 70) || 'chantier-placo-pro';
  }

  /**
   * Génère le texte tabulé / CSV prêt à coller dans Costructor ou Excel.
   */
  function buildOrderTextTable(proj, calc, separator) {
    const sep = separator || '\t';
    const lines = [];
    lines.push(['Famille', 'Désignation matériau', 'Quantité', 'Unité', 'Détail / Base calcul'].join(sep));
    (calc.orderGroups || []).forEach((grp) => {
      (grp.items || []).forEach((it) => {
        if (it.qty <= 0) return;
        const clean = (s) => String(s || '').replace(/[\r\n\t;]+/g, ' ').trim();
        lines.push([
          clean(grp.title),
          clean(it.designation),
          String(it.qty),
          clean(it.unit),
          clean(it.rawInfo ? `${it.rawInfo} — ${it.detail}` : it.detail)
        ].join(sep));
      });
    });
    return lines.join('\n');
  }

  /**
   * Exporte le projet actif au format .json téléchargeable.
   */
  function exportProjectJson(appApi) {
    const proj = Store.getActiveProject();
    const payload = JSON.stringify(proj, null, 2);
    const blob = new Blob([payload], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${sanitizeFilename(proj.clientName)}_${proj.date || 'projet'}.placo.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    appApi.toast('Projet exporté (.placo.json)');
  }

  /**
   * Télécharge la liste de commande en .csv (UTF-8 avec BOM pour Excel).
   */
  function downloadOrderCsv(proj, calc, appApi) {
    const csv = '\uFEFF' + buildOrderTextTable(proj, calc, ';');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Commande_${sanitizeFilename(proj.clientName)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    appApi.toast('Fichier CSV téléchargé');
  }

  /**
   * Copie la liste dans le presse-papiers (format tableau TSV direct Costructor / Excel).
   */
  async function copyOrderTable(proj, calc, appApi) {
    const text = buildOrderTextTable(proj, calc, '\t');
    try {
      await navigator.clipboard.writeText(text);
      appApi.toast('Liste de commande copiée ! Collez directement dans Costructor ou Excel.');
    } catch (e) {
      // Fallback textarea
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      appApi.toast('Liste de commande copiée dans le presse-papiers !');
    }
  }

  /**
   * Construit la feuille d'impression / PDF propre (croquis coté + liste de commande complète) et lance window.print().
   */
  function printCleanPdf(proj, calc, appApi) {
    const sheet = document.getElementById('print-sheet');
    if (!sheet) return;

    // Calcul viewBox propre pour le croquis plan
    const planWalls = (proj.walls || []).filter((w) => w.mode !== 'elevation');
    let planSvgHtml = '';
    if (planWalls.length && global.PlacoSketch) {
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      planWalls.forEach((w) => {
        minX = Math.min(minX, w.x1, w.x2);
        maxX = Math.max(maxX, w.x1, w.x2);
        minY = Math.min(minY, w.y1, w.y2);
        maxY = Math.max(maxY, w.y1, w.y2);
      });
      const pad = 65;
      const vb = `${Math.round(minX - pad)} ${Math.round(minY - pad)} ${Math.max(300, Math.round(maxX - minX + pad * 2))} ${Math.max(220, Math.round(maxY - minY + pad * 2))}`;
      planSvgHtml = `
        <div class="print-section-title">Croquis coté du chantier</div>
        <div class="print-sketch-box">
          <svg viewBox="${vb}" style="width:100%;max-height:260px;background:#0F172A;border-radius:4px;" preserveAspectRatio="xMidYMid meet">
            ${global.PlacoSketch.buildPlanSvgContent(proj, calc, null, false)}
          </svg>
        </div>
      `;
    }

    const marginPct = Number(proj.consumablePrefs?.safetyMarginPct || 0);
    const s = calc.summary;

    sheet.innerHTML = `
      <div class="print-header">
        <div>
          <div style="font-size:20px;font-weight:900;letter-spacing:0.4px;">PLACO PRO — FICHE CHANTIER &amp; LISTE DE COMMANDE</div>
          <div style="font-size:13px;font-weight:700;margin-top:3px;">${esc(proj.clientName)}</div>
          <div style="font-size:11px;color:#475569;">${esc(proj.address || 'Adresse non renseignée')}</div>
        </div>
        <div style="text-align:right;font-size:11px;color:#334155;">
          <div><strong>Référentiel :</strong> DTU 25.41</div>
          <div><strong>Date :</strong> ${esc(proj.date || '')}</div>
          <div><strong>HSP défaut :</strong> ${proj.defaultHeightCm || 250} cm</div>
          <div><strong>Marge globale :</strong> +${marginPct} %</div>
        </div>
      </div>

      <table class="print-table">
        <tr>
          <th>Murs / Ouvrages</th>
          <th>Ouvertures</th>
          <th>Surface nette posée</th>
          <th>Total plaques commandées</th>
          <th>Taux de chute réel</th>
          <th>Enduit 3 passes</th>
        </tr>
        <tr>
          <td><strong>${s.wallsCount} mur(s)${calc.ceilingResult ? ' + Plafond' : ''}</strong></td>
          <td>${s.openingsCount}</td>
          <td>${s.totalNetSurfaceM2} m²</td>
          <td><strong>${s.totalPlatesCount} plaques</strong></td>
          <td>${s.globalWastePct} % (${s.totalReusedOffcuts} chutes réut.)</td>
          <td>${s.enduitKg} kg</td>
        </tr>
      </table>

      ${planSvgHtml}

      <div class="print-section-title">Liste de commande matériaux par famille</div>
      ${(calc.orderGroups || []).map((grp) => {
        const visible = grp.items.filter((i) => i.qty > 0);
        if (!visible.length) return '';
        return `
          <div style="font-size:12px;font-weight:800;margin:10px 0 4px;color:#1E293B;">${esc(grp.title)}</div>
          <table class="print-table">
            <thead>
              <tr>
                <th style="width:45%;">Désignation</th>
                <th style="width:12%;">Qté</th>
                <th style="width:16%;">Unité</th>
                <th style="width:27%;">Détails calcul</th>
              </tr>
            </thead>
            <tbody>
              ${visible.map((it) => `
                <tr>
                  <td><strong>${esc(it.designation)}</strong></td>
                  <td style="font-weight:800;font-size:12px;">${it.qty}</td>
                  <td>${esc(it.unit)}</td>
                  <td style="font-size:10px;color:#475569;">${esc(it.rawInfo ? `${it.rawInfo} — ` : '')}${esc(it.detail)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        `;
      }).join('')}

      <div style="margin-top:14px;font-size:10px;color:#64748B;text-align:center;">
        Généré par Placo Pro (DTU 25.41) — Calepinage réel plaque par plaque 120 cm avec renforts d'ouvertures et consommables complets.
      </div>
    `;

    setTimeout(() => {
      window.print();
    }, 80);
    if (appApi) appApi.toast('Aperçu PDF / Impression ouvert');
  }

  /* ==================== SYNCHRONISATION GOOGLE DRIVE (WEBHOOK APPS SCRIPT) ==================== */
  async function callDriveWebhook(method, action, bodyPayload) {
    const sync = Store.getState().syncSettings || {};
    const urlStr = (sync.webhookUrl || '').trim();
    if (!urlStr) {
      throw new Error('Configurez d’abord l’URL du Webhook Google Apps Script.');
    }

    if (method === 'GET') {
      const u = new URL(urlStr);
      u.searchParams.set('action', action);
      if (sync.token) u.searchParams.set('token', sync.token);
      if (sync.folderPath) u.searchParams.set('folderPath', sync.folderPath);
      if (bodyPayload && bodyPayload.fileId) u.searchParams.set('fileId', bodyPayload.fileId);
      const res = await fetch(u.toString(), { method: 'GET' });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Erreur Google Apps Script');
      return data;
    } else {
      const payload = Object.assign({
        action,
        token: sync.token || '',
        folderPath: sync.folderPath || 'GESTION APPLI / PLACO PRO'
      }, bodyPayload || {});
      // text/plain évite le preflight OPTIONS CORS bloqué par Apps Script
      const res = await fetch(urlStr, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Erreur Google Apps Script');
      return data;
    }
  }

  async function testDriveWebhook(appApi) {
    try {
      appApi.toast('Test de connexion Google Drive en cours...');
      const data = await callDriveWebhook('GET', 'ping');
      ui.driveStatus = `Connecté : ${data.folderName || 'PLACO PRO'} (v${data.version || '1.0'})`;
      appApi.toast(`Connexion réussie ! Dossier prêt : ${data.folderName || 'PLACO PRO'}`);
      appApi.rerender();
    } catch (err) {
      ui.driveStatus = `Erreur : ${err.message}`;
      appApi.toast(`Échec connexion Drive : ${err.message}`);
      appApi.rerender();
    }
  }

  async function pushProjectToDrive(proj, calc, appApi) {
    try {
      ui.driveLoading = true;
      appApi.rerender();
      const reportText = buildOrderTextTable(proj, calc, ';');
      const data = await callDriveWebhook('POST', 'saveProject', { project: proj, reportText });
      ui.driveStatus = `Envoyé sur Drive : ${data.fileName} (${new Date().toLocaleTimeString('fr-FR')})`;
      appApi.toast(`Projet + rapport CSV envoyés dans ${Store.getState().syncSettings.folderPath} !`);
    } catch (err) {
      ui.driveStatus = `Erreur envoi : ${err.message}`;
      appApi.toast(`Erreur envoi Drive : ${err.message}`);
    } finally {
      ui.driveLoading = false;
      appApi.rerender();
    }
  }

  async function listDriveProjects(appApi) {
    try {
      ui.driveLoading = true;
      appApi.rerender();
      const data = await callDriveWebhook('GET', 'list');
      ui.driveFiles = data.files || [];
      ui.driveStatus = `${ui.driveFiles.length} projet(s) trouvé(s) dans ${Store.getState().syncSettings.folderPath}`;
      appApi.toast(ui.driveStatus);
    } catch (err) {
      ui.driveStatus = `Erreur lecture : ${err.message}`;
      appApi.toast(`Erreur lecture Drive : ${err.message}`);
    } finally {
      ui.driveLoading = false;
      appApi.rerender();
    }
  }

  async function loadDriveProject(fileId, appApi) {
    try {
      ui.driveLoading = true;
      appApi.rerender();
      const data = await callDriveWebhook('GET', 'get', { fileId });
      if (!data.project) throw new Error('Contenu projet introuvable.');
      Store.importProjectObject(data.project);
      ui.driveStatus = `Projet importé depuis Drive : ${data.fileName}`;
      appApi.toast(`Chantier "${data.project.clientName}" chargé depuis Google Drive !`);
    } catch (err) {
      appApi.toast(`Erreur import Drive : ${err.message}`);
    } finally {
      ui.driveLoading = false;
      appApi.rerender();
    }
  }

  function openGasModal(appApi) {
    const root = document.getElementById('modal-root');
    const codeSnippet = `// Déployer sur https://script.google.com > Application Web (Moi / Tout le monde)
// Dossier Drive par défaut : GESTION APPLI / PLACO PRO
// Le fichier complet se trouve aussi dans : apps-script/Code.gs

var CONFIG = { VERSION: '1.0.0', ROOT_PARENT_FOLDER: 'GESTION APPLI', APP_FOLDER: 'PLACO PRO' };

function doGet(e) {
  var p = (e && e.parameter) || {};
  try {
    checkToken_(p.token);
    if ((p.action || 'ping') === 'ping') {
      var f = getOrCreateAppFolder_(p.folderPath);
      return json_({ ok: true, service: 'PLACO PRO', version: CONFIG.VERSION, folderName: f.getName(), folderUrl: f.getUrl() });
    }
    if (p.action === 'list') return json_(listProjects_(p.folderPath));
    if (p.action === 'get') return json_(getProjectFile_(p.fileId));
    return json_({ ok: false, error: 'Action inconnue' });
  } catch (err) { return json_({ ok: false, error: String(err.message || err) }); }
}

function doPost(e) {
  try {
    var payload = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    checkToken_(payload.token);
    if (payload.action === 'saveProject') return json_(saveProject_(payload));
    return json_({ ok: false, error: 'Action POST inconnue' });
  } catch (err) { return json_({ ok: false, error: String(err.message || err) }); }
}

function checkToken_(provided) {
  var expected = PropertiesService.getScriptProperties().getProperty('APP_TOKEN');
  if (expected && String(provided || '') !== String(expected)) throw new Error('Jeton APP_TOKEN invalide');
}

function getOrCreateAppFolder_(customPath) {
  var parts = String(customPath || 'GESTION APPLI / PLACO PRO').split('/').map(function(s){return s.trim();}).filter(Boolean);
  var cur = DriveApp.getRootFolder();
  for (var i = 0; i < parts.length; i++) {
    var it = cur.getFoldersByName(parts[i]);
    cur = it.hasNext() ? it.next() : cur.createFolder(parts[i]);
  }
  return cur;
}

function upsertFile_(folder, name, content, mime) {
  var it = folder.getFilesByName(name);
  if (it.hasNext()) { var f = it.next(); f.setContent(content); return f; }
  return folder.createFile(name, content, mime);
}

function saveProject_(payload) {
  var folder = getOrCreateAppFolder_(payload.folderPath);
  var p = payload.project || {};
  var base = String((p.clientName || 'Chantier') + '_' + (p.date || '')).replace(/[\\\\/:*?"<>|\\s]+/g, '_').slice(0, 80);
  var jf = upsertFile_(folder, base + '.placo.json', JSON.stringify(p, null, 2), 'application/json');
  if (payload.reportText) upsertFile_(folder, base + '_commande.csv', String(payload.reportText), 'text/csv');
  return { ok: true, fileId: jf.getId(), fileName: jf.getName(), folderUrl: folder.getUrl() };
}

function listProjects_(folderPath) {
  var folder = getOrCreateAppFolder_(folderPath), it = folder.getFiles(), files = [];
  while (it.hasNext()) {
    var f = it.next();
    if (f.getName().toLowerCase().indexOf('.json') !== -1) {
      files.push({ id: f.getId(), name: f.getName(), updatedAt: f.getLastUpdated().toISOString() });
    }
  }
  files.sort(function(a, b) { return b.updatedAt.localeCompare(a.updatedAt); });
  return { ok: true, files: files };
}

function getProjectFile_(id) {
  var f = DriveApp.getFileById(id);
  return { ok: true, fileId: f.getId(), fileName: f.getName(), project: JSON.parse(f.getBlob().getDataAsString('UTF-8')) };
}

function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }`;

    root.innerHTML = `
      <div class="modal-backdrop" id="gas-bg">
        <div class="modal-box">
          <div class="card-header">
            <h3 class="card-title">☁️ Script Webhook Google Apps Script (GESTION APPLI / PLACO PRO)</h3>
            <button type="button" class="btn btn-sm btn-ghost" id="gas-close">✕</button>
          </div>
          <div class="card-body stack">
            <div class="tip-box">
              <span>ℹ️</span>
              <div>
                1. Ouvrez <strong>script.google.com</strong> → Nouveau projet.<br/>
                2. Collez le code ci-dessous dans <code>Code.gs</code>.<br/>
                3. Cliquez sur <strong>Déployer → Nouveau déploiement → Application Web</strong> (Exécuter en tant que : <em>Moi</em>, Accès : <em>Tout le monde</em>).<br/>
                4. Collez l'URL <code>.../exec</code> dans Placo Pro.
              </div>
            </div>
            <textarea id="gas-code-ta" class="textarea mono" rows="15" readonly style="font-size:11.5px;line-height:1.4;">${esc(codeSnippet)}</textarea>
            <div class="row-between">
              <button type="button" class="btn" id="gas-close-2">Fermer</button>
              <button type="button" class="btn btn-primary" id="gas-copy">📋 Copier le code Apps Script</button>
            </div>
          </div>
        </div>
      </div>
    `;

    const close = () => { root.innerHTML = ''; };
    root.querySelector('#gas-close').addEventListener('click', close);
    root.querySelector('#gas-close-2').addEventListener('click', close);
    root.querySelector('#gas-bg').addEventListener('click', (e) => { if (e.target.id === 'gas-bg') close(); });
    root.querySelector('#gas-copy').addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(codeSnippet);
      } catch (e) {
        root.querySelector('#gas-code-ta').select();
        document.execCommand('copy');
      }
      appApi.toast('Code Google Apps Script copié !');
    });
  }

  /**
   * Rendu principal de l'Onglet 4.
   */
  function render(container, state, calc, appApi) {
    const proj = Store.getActiveProject();
    const prefs = proj.consumablePrefs || {};
    const marginPct = Number(prefs.safetyMarginPct || 0);
    const overridesCount = Object.keys(proj.manualOverrides || {}).length;
    const sync = state.syncSettings || {};

    const totalLines = (calc.orderGroups || []).reduce((acc, g) => acc + g.items.length, 0);

    container.innerHTML = `
      <div class="stack">
        <!-- BARRE D'ACTIONS EXPORT & MARGE -->
        <section class="card">
          <div class="card-header">
            <h2 class="card-title">📦 Liste de Commande Matériaux (${totalLines} références)</h2>
            <div class="row">
              <button type="button" class="btn btn-sm btn-blue" id="btn-copy-table">📋 Copier (Devis / Costructor)</button>
              <button type="button" class="btn btn-sm" id="btn-dl-csv">📄 CSV</button>
              <button type="button" class="btn btn-sm" id="btn-dl-json">💾 Exporter .json</button>
              <button type="button" class="btn btn-sm" id="btn-ul-json">📂 Importer .json</button>
              <button type="button" class="btn btn-sm btn-primary" id="btn-print-pdf">🖨️ Export PDF Propre</button>
            </div>
          </div>
          <div class="card-body row-between">
            <div class="row">
              <span style="font-size:12.5px;font-weight:700;color:var(--text-sub);">Marge de sécurité globale :</span>
              <div class="segmented" id="ord-margin-seg">
                <button type="button" data-m="0" class="${marginPct === 0 ? 'active' : ''}">0 % (Exact)</button>
                <button type="button" data-m="5" class="${marginPct === 5 ? 'active' : ''}">+ 5 %</button>
                <button type="button" data-m="10" class="${marginPct === 10 ? 'active' : ''}">+ 10 %</button>
              </div>
            </div>
            <div class="row">
              ${overridesCount > 0 ? `<button type="button" class="btn btn-sm btn-danger" id="btn-reset-overrides">↺ Réinitialiser ${overridesCount} ajustement(s)</button>` : ''}
              ${proj.savedId
                ? '<span class="badge badge-green">● Chantier sauvegardé</span>'
                : '<span class="badge badge-yellow">● Brouillon non enregistré</span>'}
            </div>
          </div>
        </section>

        ${totalLines === 0 ? `
          <div class="tip-box">
            <span>📋</span>
            <div>
              <strong>Liste de commande à zéro (chantier vierge).</strong>
              Tracez vos murs dans l'onglet <strong>2. Croquis &amp; Ouvertures</strong>, ou ouvrez un chantier depuis <strong>Mes chantiers sauvegardés</strong> / <strong>Importer .json</strong>.
            </div>
          </div>
        ` : ''}

        <!-- TABLEAUX PAR FAMILLE DE MATÉRIAUX -->
        ${(calc.orderGroups || []).map((grp) => `
          <section class="card">
            <div class="card-header">
              <h3 class="card-title">${esc(grp.title)}</h3>
              <span class="badge badge-slate">${grp.items.length} ligne(s)</span>
            </div>
            ${grp.items.length ? `
              <div class="table-wrap">
                <table class="data-table">
                  <thead>
                    <tr>
                      <th style="width:40%;">Matériau / Désignation</th>
                      <th style="width:12%;">Base calcul</th>
                      <th style="width:20%;">Quantité à commander</th>
                      <th style="width:14%;">Unité</th>
                      <th style="width:14%;">Info technique</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${grp.items.map((it) => `
                      <tr>
                        <td>
                          <div style="font-weight:700;color:var(--text-main);">${esc(it.designation)}</div>
                          <div style="font-size:11.5px;color:var(--text-sub);margin-top:2px;">${esc(it.detail)}</div>
                        </td>
                        <td style="font-family:var(--font-mono);color:var(--text-sub);">
                          ${it.autoQty}${marginPct > 0 ? ` <span style="font-size:10px;color:var(--yellow);">(+${marginPct}%)</span>` : ''}
                        </td>
                        <td>
                          <div class="qty-stepper">
                            <button type="button" class="qty-dec" data-item="${esc(it.id)}" data-cur="${it.qty}">−</button>
                            <input type="number" min="0" max="99999" class="qty-input ${it.isOverridden ? 'overridden' : ''}" data-item="${esc(it.id)}" value="${it.qty}" aria-label="Quantité ${esc(it.designation)}" />
                            <button type="button" class="qty-inc" data-item="${esc(it.id)}" data-cur="${it.qty}">+</button>
                            ${it.isOverridden ? `<button type="button" class="qty-reset" data-item="${esc(it.id)}" title="Rétablir le calcul automatique (${it.autoQty})">↺</button>` : ''}
                          </div>
                        </td>
                        <td style="font-weight:600;color:var(--text-sub);">${esc(it.unit)}</td>
                        <td style="font-family:var(--font-mono);font-size:12px;color:var(--blue);">${esc(it.rawInfo || '—')}</td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            ` : '<div class="card-body" style="color:var(--text-muted);font-size:12.5px;">Aucun matériau requis dans cette famille pour la configuration actuelle.</div>'}
          </section>
        `).join('')}

        <!-- SYNCHRONISATION MOBILE <-> PC VIA GOOGLE DRIVE -->
        <section class="card">
          <div class="card-header">
            <h3 class="card-title">☁️ Synchronisation Mobile ↔ PC — Google Drive (${esc(sync.folderPath || 'GESTION APPLI / PLACO PRO')})</h3>
            <button type="button" class="btn btn-sm btn-blue" id="btn-ord-gas-code">📜 Script Code.gs</button>
          </div>
          <div class="card-body stack">
            <div class="grid-3">
              <div class="field">
                <label>URL Webhook Google Apps Script</label>
                <input id="ord-gas-url" class="input mono" type="url" value="${esc(sync.webhookUrl || '')}" placeholder="https://script.google.com/macros/s/.../exec" />
              </div>
              <div class="field">
                <label>Dossier Drive cible</label>
                <input id="ord-gas-folder" class="input mono" type="text" value="${esc(sync.folderPath || 'GESTION APPLI / PLACO PRO')}" />
              </div>
              <div class="field">
                <label>Jeton APP_TOKEN (optionnel)</label>
                <input id="ord-gas-token" class="input mono" type="password" value="${esc(sync.token || '')}" placeholder="Optionnel" />
              </div>
            </div>

            <div class="row">
              <button type="button" class="btn btn-sm" id="btn-drive-test" ${ui.driveLoading ? 'disabled' : ''}>🔌 Tester</button>
              <button type="button" class="btn btn-sm btn-primary" id="btn-drive-push" ${ui.driveLoading ? 'disabled' : ''}>⬆ Envoyer sur Drive (.json + rapport)</button>
              <button type="button" class="btn btn-sm btn-blue" id="btn-drive-pull" ${ui.driveLoading ? 'disabled' : ''}>⬇ Lister / Récupérer depuis Drive</button>
              ${ui.driveStatus ? `<span class="badge badge-slate">${esc(ui.driveStatus)}</span>` : ''}
            </div>

            ${ui.driveFiles.length ? `
              <div style="border-top:1px solid var(--border);padding-top:10px;">
                <div style="font-size:12px;font-weight:700;color:var(--text-sub);margin-bottom:6px;">Projets disponibles sur Google Drive :</div>
                <div class="stack" style="gap:6px;">
                  ${ui.driveFiles.map((f) => `
                    <div class="row-between" style="background:var(--bg-surface);border:1px solid var(--border);border-radius:6px;padding:8px 10px;">
                      <div>
                        <strong style="font-size:12.5px;font-family:var(--font-mono);">${esc(f.name)}</strong>
                        <span style="font-size:11px;color:var(--text-muted);margin-left:8px;">${esc((f.updatedAt || '').slice(0, 16).replace('T', ' '))}</span>
                      </div>
                      <button type="button" class="btn btn-sm btn-primary btn-drive-load" data-fid="${esc(f.id)}">Charger</button>
                    </div>
                  `).join('')}
                </div>
              </div>
            ` : ''}
          </div>
        </section>
      </div>
    `;

    // Events
    container.querySelectorAll('#ord-margin-seg button').forEach((b) => {
      b.addEventListener('click', () => Store.updateConsumablePrefs({ safetyMarginPct: Number(b.dataset.m) }));
    });

    container.querySelector('#btn-reset-overrides')?.addEventListener('click', () => {
      Store.clearAllOverrides();
      appApi.toast('Tous les ajustements manuels ont été réinitialisés');
    });

    container.querySelectorAll('.qty-dec').forEach((b) => {
      b.addEventListener('click', () => {
        const next = Math.max(0, Number(b.dataset.cur) - 1);
        Store.setManualOverride(b.dataset.item, next);
      });
    });
    container.querySelectorAll('.qty-inc').forEach((b) => {
      b.addEventListener('click', () => {
        const next = Number(b.dataset.cur) + 1;
        Store.setManualOverride(b.dataset.item, next);
      });
    });
    container.querySelectorAll('.qty-input').forEach((inp) => {
      inp.addEventListener('change', () => {
        Store.setManualOverride(inp.dataset.item, Math.max(0, Math.round(Number(inp.value) || 0)));
      });
    });
    container.querySelectorAll('.qty-reset').forEach((b) => {
      b.addEventListener('click', () => Store.setManualOverride(b.dataset.item, null));
    });

    // Exports
    container.querySelector('#btn-copy-table').addEventListener('click', () => copyOrderTable(proj, calc, appApi));
    container.querySelector('#btn-dl-csv').addEventListener('click', () => downloadOrderCsv(proj, calc, appApi));
    container.querySelector('#btn-dl-json').addEventListener('click', () => exportProjectJson(appApi));
    container.querySelector('#btn-ul-json').addEventListener('click', () => {
      document.getElementById('global-import-json')?.click();
    });
    container.querySelector('#btn-print-pdf').addEventListener('click', () => printCleanPdf(proj, calc, appApi));

    // Drive Sync
    container.querySelector('#ord-gas-url').addEventListener('change', (e) => {
      Store.updateSyncSettings({ webhookUrl: e.target.value.trim() });
    });
    container.querySelector('#ord-gas-folder').addEventListener('change', (e) => {
      Store.updateSyncSettings({ folderPath: e.target.value.trim() || 'GESTION APPLI / PLACO PRO' });
    });
    container.querySelector('#ord-gas-token').addEventListener('change', (e) => {
      Store.updateSyncSettings({ token: e.target.value.trim() });
    });
    container.querySelector('#btn-ord-gas-code').addEventListener('click', () => openGasModal(appApi));
    container.querySelector('#btn-drive-test').addEventListener('click', () => testDriveWebhook(appApi));
    container.querySelector('#btn-drive-push').addEventListener('click', () => pushProjectToDrive(proj, calc, appApi));
    container.querySelector('#btn-drive-pull').addEventListener('click', () => listDriveProjects(appApi));
    container.querySelectorAll('.btn-drive-load').forEach((btn) => {
      btn.addEventListener('click', () => loadDriveProject(btn.dataset.fid, appApi));
    });
  }

  global.PlacoOrder = {
    render,
    exportProjectJson,
    printCleanPdf,
    copyOrderTable,
    testDriveWebhook,
    openGasModal,
    buildOrderTextTable
  };
})(window);
