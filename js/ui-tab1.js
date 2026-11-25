/* ============================================================================
 * PLACO PRO — Onglet 1 : Chantier & Paramètres Techniques (DTU 25.41)
 * ============================================================================ */
(function (global) {
  'use strict';

  const C = global.PlacoConstants;
  const Store = global.PlacoStore;

  function esc(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatFaceSummary(face) {
    if (!face) return 'BA13 Std × 1';
    const pt = C.PLATE_TYPES[face.plateType] || C.PLATE_TYPES.std;
    const hTxt = face.plateHeight === 'auto' ? 'H. auto' : `${face.plateHeight} cm`;
    return `${face.skins === 2 ? 'Double peau' : 'Simple peau'} · ${pt.code} (${hTxt})`;
  }

  function formatInsulSummary(ins) {
    if (!ins || !ins.enabled) return 'Sans isolant';
    const mat = C.INSULATION_MATERIALS[ins.material] || C.INSULATION_MATERIALS.laine_coton;
    return `${mat.name} ${ins.thicknessMm} mm`;
  }

  function renderProfileCard(prof) {
    let catBadge = '<span class="badge badge-blue">Cloison</span>';
    let detailsHtml = '';

    if (prof.category === 'cloison') {
      catBadge = '<span class="badge badge-blue">Cloison</span>';
      detailsHtml = `
        <span class="spec-chip">${esc(prof.section)} · Entraxe ${prof.entraxeCm} cm</span>
        <span class="spec-chip">${prof.montantType === 'double' ? 'Montants doublés dos à dos' : 'Montants simples'}</span>
        <span class="spec-chip">Face A : ${esc(formatFaceSummary(prof.faceA))}</span>
        <span class="spec-chip">Face B : ${esc(formatFaceSummary(prof.faceB))}</span>
        <span class="spec-chip">${esc(formatInsulSummary(prof.insulation))}</span>
      `;
    } else if (prof.category === 'doublage') {
      catBadge = '<span class="badge badge-yellow">Doublage</span>';
      const sysTxt = prof.doublageSystem === 'optima'
        ? `Optima 2 (F530 / 60 cm · Appuis ${prof.optimaRange || '75-120'} mm)`
        : `Ossature indép. ${prof.section} (${prof.entraxeCm} cm, ${prof.montantType === 'double' ? 'doublés' : 'simples'})`;
      detailsHtml = `
        <span class="spec-chip">${esc(sysTxt)}</span>
        <span class="spec-chip">${esc(formatFaceSummary(prof.faceA))}</span>
        <span class="spec-chip">${esc(formatInsulSummary(prof.insulation))}</span>
      `;
    } else {
      catBadge = '<span class="badge badge-green">Faux Plafond</span>';
      const susp = C.SUSPENTE_TYPES[prof.suspenteType] || C.SUSPENTE_TYPES.integra2;
      const suspExtra = prof.suspenteType === 'integra2' ? ` (${prof.integraLength || '200-240'} mm)` : '';
      detailsHtml = `
        <span class="spec-chip">F530 entraxe ${prof.entraxeCm} cm · ${prof.periphType || 'CR2'}</span>
        <span class="spec-chip">${esc(susp.shortLabel + suspExtra)}</span>
        <span class="spec-chip">${esc(formatFaceSummary(prof.faceA))}</span>
        <span class="spec-chip">${esc(formatInsulSummary(prof.insulation))}</span>
      `;
    }

    return `
      <div class="profile-card" data-profile-id="${esc(prof.id)}">
        <div class="row-between">
          <div class="row" style="gap:8px;min-width:0;flex:1;">
            <span class="profile-swatch" style="background:${esc(prof.color || '#F5C518')}"></span>
            <strong style="font-size:13px;overflow:hidden;text-overflow:ellipsis;">${esc(prof.name)}</strong>
          </div>
          ${catBadge}
        </div>
        <div class="profile-specs">${detailsHtml}</div>
        <div class="row-between" style="margin-top:auto;padding-top:4px;border-top:1px solid rgba(38,54,79,0.5);">
          <button type="button" class="btn btn-sm btn-blue" data-action="edit-profile" data-id="${esc(prof.id)}">✏️ Configurer</button>
          <div class="row" style="gap:6px;">
            <button type="button" class="btn btn-sm" data-action="dup-profile" data-id="${esc(prof.id)}" title="Dupliquer ce profil">⧉</button>
            <button type="button" class="btn btn-sm btn-danger" data-action="del-profile" data-id="${esc(prof.id)}" title="Supprimer ce profil">🗑️</button>
          </div>
        </div>
      </div>
    `;
  }

  function render(container, state, calc, appApi) {
    const proj = Store.getActiveProject();
    const hSuggestion = C.suggestPlateHeight(proj.defaultHeightCm);
    const prefs = proj.consumablePrefs || {};
    const sync = state.syncSettings || {};

    const cloisons = proj.profiles.filter((p) => p.category === 'cloison');
    const doublages = proj.profiles.filter((p) => p.category === 'doublage');
    const plafonds = proj.profiles.filter((p) => p.category === 'plafond');
    const savedList = state.savedProjects || [];
    const isSaved = Boolean(proj.savedId);

    container.innerHTML = `
      <div class="stack">
        <!-- GESTION DES CHANTIERS -->
        <section class="card">
          <div class="card-header">
            <div class="row" style="gap:8px;">
              <h2 class="card-title">🏗️ Gestion du chantier &amp; données générales</h2>
              ${isSaved
                ? '<span class="badge badge-green">● Chantier sauvegardé</span>'
                : '<span class="badge badge-yellow">● Chantier vierge / Brouillon</span>'}
            </div>
            <div class="row">
              <button type="button" class="btn btn-sm btn-primary" id="btn-new-blank">✨ Nouveau chantier vierge</button>
              <button type="button" class="btn btn-sm btn-blue" id="btn-save-project">💾 Sauvegarder ce chantier</button>
              <button type="button" class="btn btn-sm" id="btn-dup-project" ${Store.hasWorkInProgress() ? '' : 'disabled'}>⧉ Dupliquer</button>
              ${isSaved ? '<button type="button" class="btn btn-sm btn-danger" id="btn-del-project">🗑️ Supprimer</button>' : ''}
            </div>
          </div>
          <div class="card-body stack">
            <div class="grid-2">
              <div class="field">
                <label for="select-project">Mes chantiers sauvegardés (${savedList.length}) — ouverture uniquement sur sélection</label>
                <div class="row" style="gap:6px;flex-wrap:nowrap;">
                  <select id="select-project" class="select">
                    <option value="" ${!isSaved ? 'selected' : ''}>— Sélectionner un chantier sauvegardé (${savedList.length}) —</option>
                    ${savedList.map((p) => `
                      <option value="${esc(p.id)}" ${p.id === proj.savedId ? 'selected' : ''}>
                        ${esc(p.clientName || 'Sans nom')}${p.date ? ` — ${esc(p.date)}` : ''} (${(p.walls || []).length} murs)
                      </option>
                    `).join('')}
                  </select>
                  <button type="button" class="btn btn-sm" id="btn-tab1-import" title="Importer un fichier .json">📂 Importer</button>
                </div>
              </div>
              <div class="field">
                <label for="inp-client-name">Nom du client / Chantier</label>
                <input id="inp-client-name" class="input" type="text" value="${esc(proj.clientName || '')}" placeholder="Ex : Rénovation Dupont — RDC" />
              </div>
            </div>

            <div class="grid-3">
              <div class="field">
                <label for="inp-address">Adresse du chantier</label>
                <input id="inp-address" class="input" type="text" value="${esc(proj.address || '')}" placeholder="Rue, Code Postal, Ville" />
              </div>
              <div class="field">
                <label for="inp-date">Date du relevé</label>
                <input id="inp-date" class="input mono" type="date" value="${esc(proj.date || '')}" />
              </div>
              <div class="field">
                <label for="inp-default-h">Hauteur sous plafond par défaut</label>
                <div class="input-group">
                  <input id="inp-default-h" class="input mono" type="number" min="100" max="600" step="1" value="${esc(proj.defaultHeightCm || 250)}" />
                  <span class="input-addon">cm</span>
                </div>
              </div>
            </div>

            <div class="tip-box ${hSuggestion.zeroHorizontalJoint ? 'ok' : 'warn'}">
              <span>📐</span>
              <div style="flex:1;">
                <strong>Suggestion hauteur de plaque optimale :</strong> ${esc(hSuggestion.reason)}
                <div style="margin-top:4px;font-size:11.5px;opacity:0.85;">
                  Les profils réglés sur « Hauteur automatique » adoptent automatiquement des plaques de <strong>120 × ${hSuggestion.heightCm} cm</strong> (modifiable par mur si rampant ou hauteur spécifique).
                </div>
              </div>
              <button type="button" class="btn btn-sm" id="btn-apply-h-all" title="Appliquer cette hauteur à tous les murs existants">Appliquer à tous les murs</button>
            </div>
          </div>
        </section>

        <!-- PROFILS D'OUVRAGES RÉUTILISABLES (DTU 25.41) -->
        <section class="card">
          <div class="card-header">
            <h2 class="card-title">📐 Profils d'ouvrages réutilisables sur le plan (DTU 25.41)</h2>
            <div class="row">
              <button type="button" class="btn btn-sm btn-blue" data-action="new-profile" data-cat="cloison">+ Cloison</button>
              <button type="button" class="btn btn-sm btn-primary" data-action="new-profile" data-cat="doublage">+ Doublage</button>
              <button type="button" class="btn btn-sm" data-action="new-profile" data-cat="plafond" style="border-color:rgba(34,197,94,0.5);color:#4ADE80;">+ Faux plafond</button>
            </div>
          </div>
          <div class="card-body stack">
            <div>
              <div class="row-between" style="margin-bottom:8px;">
                <h3 style="margin:0;font-size:13px;color:var(--blue);text-transform:uppercase;letter-spacing:0.5px;">
                  1. Cloisons de distribution (M48 / M70 / M90 / M100 · Face A &amp; Face B indépendantes)
                </h3>
                <span class="badge badge-slate">${cloisons.length} profil(s)</span>
              </div>
              <div class="profile-grid">
                ${cloisons.map(renderProfileCard).join('')}
              </div>
            </div>

            <div>
              <div class="row-between" style="margin-bottom:8px;">
                <h3 style="margin:0;font-size:13px;color:var(--yellow);text-transform:uppercase;letter-spacing:0.5px;">
                  2. Doublages murs périphériques (Ossature indépendante ou Appuis Optima 2)
                </h3>
                <span class="badge badge-slate">${doublages.length} profil(s)</span>
              </div>
              <div class="profile-grid">
                ${doublages.map(renderProfileCard).join('')}
              </div>
            </div>

            <div>
              <div class="row-between" style="margin-bottom:8px;">
                <h3 style="margin:0;font-size:13px;color:#4ADE80;text-transform:uppercase;letter-spacing:0.5px;">
                  3. Faux plafonds sur ossature métallique F530 (Classiques ou Integra 2)
                </h3>
                <span class="badge badge-slate">${plafonds.length} profil(s)</span>
              </div>
              <div class="profile-grid">
                ${plafonds.map(renderProfileCard).join('')}
              </div>
            </div>
          </div>
        </section>

        <!-- PRÉFÉRENCES CONSOMMABLES & SYNCHRONISATION GOOGLE DRIVE -->
        <div class="grid-2">
          <section class="card">
            <div class="card-header">
              <h2 class="card-title">🔩 Conditionnements consommables &amp; marge</h2>
            </div>
            <div class="card-body stack">
              <div class="field">
                <label>Conditionnement Enduit à joints (0,35 kg/ml — 3 passes)</label>
                <div class="segmented" id="seg-enduit">
                  <button type="button" data-val="sac25" class="${prefs.enduitUnit !== 'seau20' ? 'active' : ''}">Sacs poudre 25 kg</button>
                  <button type="button" data-val="seau20" class="${prefs.enduitUnit === 'seau20' ? 'active' : ''}">Seaux pâte 20 kg</button>
                </div>
              </div>
              <div class="field">
                <label>Boîtes de vis TTPC 25 / 35 mm</label>
                <div class="segmented" id="seg-ttpc">
                  <button type="button" data-val="500" class="${Number(prefs.ttpcBoxSize) === 500 ? 'active' : ''}">Boîtes de 500 vis</button>
                  <button type="button" data-val="1000" class="${Number(prefs.ttpcBoxSize) !== 500 ? 'active' : ''}">Boîtes de 1000 vis</button>
                </div>
              </div>
              <div class="field">
                <label>Marge de sécurité globale sur la liste de commande</label>
                <div class="segmented" id="seg-margin">
                  <button type="button" data-val="0" class="${Number(prefs.safetyMarginPct || 0) === 0 ? 'active' : ''}">0 % (Calcul réel exact)</button>
                  <button type="button" data-val="5" class="${Number(prefs.safetyMarginPct) === 5 ? 'active' : ''}">+ 5 %</button>
                  <button type="button" data-val="10" class="${Number(prefs.safetyMarginPct) === 10 ? 'active' : ''}">+ 10 %</button>
                </div>
              </div>
            </div>
          </section>

          <section class="card">
            <div class="card-header">
              <h2 class="card-title">☁️ Synchronisation Google Drive (Apps Script)</h2>
              <button type="button" class="btn btn-sm btn-blue" id="btn-show-gas-code">📜 Voir Code.gs</button>
            </div>
            <div class="card-body stack">
              <div class="field">
                <label for="inp-gas-url">URL Webhook Google Apps Script (/exec)</label>
                <input id="inp-gas-url" class="input mono" type="url" value="${esc(sync.webhookUrl || '')}" placeholder="https://script.google.com/macros/s/.../exec" />
              </div>
              <div class="grid-2">
                <div class="field">
                  <label for="inp-gas-folder">Dossier Google Drive cible</label>
                  <input id="inp-gas-folder" class="input mono" type="text" value="${esc(sync.folderPath || 'GESTION APPLI / PLACO PRO')}" />
                </div>
                <div class="field">
                  <label for="inp-gas-token">Jeton APP_TOKEN (optionnel)</label>
                  <input id="inp-gas-token" class="input mono" type="password" value="${esc(sync.token || '')}" placeholder="Optionnel" />
                </div>
              </div>
              <div class="row">
                <button type="button" class="btn btn-sm btn-blue" id="btn-test-gas">🔌 Tester la connexion Drive</button>
                <button type="button" class="btn btn-sm btn-primary" id="btn-go-sketch" style="margin-left:auto;">Passer au Croquis (Onglet 2) →</button>
              </div>
            </div>
          </section>
        </div>
      </div>
    `;

    bindEvents(container, proj, appApi);
  }

  function bindEvents(container, proj, appApi) {
    container.querySelector('#select-project').addEventListener('change', (e) => {
      const targetId = e.target.value;
      if (!targetId) {
        appApi.requestBlankProject();
        return;
      }
      const cur = Store.getActiveProject();
      if (!cur.savedId && Store.hasWorkInProgress()) {
        const ok = confirm('Un travail non sauvegardé est en cours sur le chantier vierge. Voulez-vous ouvrir le chantier sélectionné et remplacer votre brouillon actuel ?');
        if (!ok) {
          e.target.value = '';
          return;
        }
      }
      const opened = Store.openSavedProject(targetId);
      if (opened) {
        appApi.toast(`Chantier "${opened.clientName}" ouvert`);
      }
    });

    container.querySelector('#btn-tab1-import').addEventListener('click', () => {
      document.getElementById('global-import-json')?.click();
    });

    container.querySelector('#btn-new-blank').addEventListener('click', () => {
      appApi.requestBlankProject();
    });

    container.querySelector('#btn-save-project').addEventListener('click', () => {
      const cur = Store.getActiveProject();
      let name = (cur.clientName || '').trim();
      if (!name) {
        const asked = prompt('Nom du chantier à enregistrer dans "Mes chantiers sauvegardés" :', '');
        if (asked === null) return;
        name = asked.trim();
      }
      const saved = Store.saveCurrentProject(name);
      appApi.toast(`Chantier "${saved.clientName}" enregistré dans Mes chantiers sauvegardés`);
    });

    container.querySelector('#btn-dup-project').addEventListener('click', () => {
      const copy = Store.duplicateActiveProject();
      if (copy) appApi.toast(`Chantier dupliqué : "${copy.clientName}"`);
    });

    const delBtn = container.querySelector('#btn-del-project');
    if (delBtn) {
      delBtn.addEventListener('click', () => {
        if (proj.savedId && confirm(`Supprimer définitivement le chantier "${proj.clientName}" de Mes chantiers sauvegardés ?`)) {
          Store.deleteSavedProject(proj.savedId);
          appApi.toast('Chantier supprimé — retour sur un chantier vierge');
        }
      });
    }

    container.querySelector('#inp-client-name').addEventListener('change', (e) => {
      Store.updateProjectMeta({ clientName: e.target.value });
    });
    container.querySelector('#inp-address').addEventListener('change', (e) => {
      Store.updateProjectMeta({ address: e.target.value });
    });
    container.querySelector('#inp-date').addEventListener('change', (e) => {
      Store.updateProjectMeta({ date: e.target.value });
    });
    container.querySelector('#inp-default-h').addEventListener('change', (e) => {
      const val = Math.max(100, Math.min(600, Number(e.target.value) || 250));
      Store.updateProjectMeta({ defaultHeightCm: val });
    });

    container.querySelector('#btn-apply-h-all').addEventListener('click', () => {
      const h = Number(Store.getActiveProject().defaultHeightCm) || 250;
      const p = Store.getActiveProject();
      if (!p.walls.length) {
        appApi.toast('Aucun mur tracé pour le moment');
        return;
      }
      const next = p.walls.map((w) => Object.assign({}, w, { hLeftCm: h, hRightCm: h }));
      Store.replaceAllWalls(next);
      appApi.toast(`Hauteur ${h} cm appliquée à ${next.length} mur(s)`);
    });

    // Segmented preferences
    container.querySelectorAll('#seg-enduit button').forEach((btn) => {
      btn.addEventListener('click', () => Store.updateConsumablePrefs({ enduitUnit: btn.dataset.val }));
    });
    container.querySelectorAll('#seg-ttpc button').forEach((btn) => {
      btn.addEventListener('click', () => Store.updateConsumablePrefs({ ttpcBoxSize: Number(btn.dataset.val) }));
    });
    container.querySelectorAll('#seg-margin button').forEach((btn) => {
      btn.addEventListener('click', () => Store.updateConsumablePrefs({ safetyMarginPct: Number(btn.dataset.val) }));
    });

    // Sync inputs
    container.querySelector('#inp-gas-url').addEventListener('change', (e) => {
      Store.updateSyncSettings({ webhookUrl: e.target.value.trim() });
    });
    container.querySelector('#inp-gas-folder').addEventListener('change', (e) => {
      Store.updateSyncSettings({ folderPath: e.target.value.trim() || 'GESTION APPLI / PLACO PRO' });
    });
    container.querySelector('#inp-gas-token').addEventListener('change', (e) => {
      Store.updateSyncSettings({ token: e.target.value.trim() });
    });

    container.querySelector('#btn-test-gas').addEventListener('click', () => {
      if (global.PlacoOrder && global.PlacoOrder.testDriveWebhook) {
        global.PlacoOrder.testDriveWebhook(appApi);
      }
    });
    container.querySelector('#btn-show-gas-code').addEventListener('click', () => {
      if (global.PlacoOrder && global.PlacoOrder.openGasModal) {
        global.PlacoOrder.openGasModal(appApi);
      }
    });
    container.querySelector('#btn-go-sketch').addEventListener('click', () => {
      Store.setActiveTab('tab2');
    });

    // Profile actions
    container.querySelectorAll('[data-action="new-profile"]').forEach((btn) => {
      btn.addEventListener('click', () => openProfileModal(null, btn.dataset.cat, appApi));
    });
    container.querySelectorAll('[data-action="edit-profile"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const target = Store.getActiveProject().profiles.find((p) => p.id === btn.dataset.id);
        if (target) openProfileModal(target, target.category, appApi);
      });
    });
    container.querySelectorAll('[data-action="dup-profile"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const target = Store.getActiveProject().profiles.find((p) => p.id === btn.dataset.id);
        if (!target) return;
        const copy = Store.deepClone(target);
        copy.id = Store.uid('prof');
        copy.name = `${target.name} (Copie)`;
        Store.upsertProfile(copy);
        appApi.toast('Profil dupliqué');
      });
    });
    container.querySelectorAll('[data-action="del-profile"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (!Store.deleteProfile(btn.dataset.id)) {
          appApi.toast('Impossible : conservez au moins 1 profil par catégorie.');
        } else {
          appApi.toast('Profil supprimé');
        }
      });
    });
  }

  function buildFaceEditorHtml(prefix, title, face) {
    const f = face || { skins: 1, plateType: 'std', plateHeight: 'auto' };
    return `
      <div style="background:var(--bg-surface);border:1px solid var(--border);border-radius:8px;padding:12px;">
        <div style="font-weight:700;font-size:12.5px;margin-bottom:10px;color:var(--yellow);">${esc(title)}</div>
        <div class="grid-3">
          <div class="field">
            <label>Parement (peaux)</label>
            <select id="${prefix}-skins" class="select">
              <option value="1" ${Number(f.skins) === 1 ? 'selected' : ''}>Simple peau (1 plaque)</option>
              <option value="2" ${Number(f.skins) === 2 ? 'selected' : ''}>Double peau (décalage 60 cm)</option>
            </select>
          </div>
          <div class="field">
            <label>Type de plaque BA13</label>
            <select id="${prefix}-plate-type" class="select">
              ${Object.values(C.PLATE_TYPES).map((pt) => `
                <option value="${pt.id}" ${f.plateType === pt.id ? 'selected' : ''}>${esc(pt.name)}</option>
              `).join('')}
            </select>
          </div>
          <div class="field">
            <label>Hauteur plaque (larg. 120 cm)</label>
            <select id="${prefix}-plate-h" class="select mono">
              <option value="auto" ${f.plateHeight === 'auto' ? 'selected' : ''}>Automatique (optimale)</option>
              ${C.PLATE_HEIGHTS_CM.map((h) => `
                <option value="${h}" ${String(f.plateHeight) === String(h) ? 'selected' : ''}>${h} cm</option>
              `).join('')}
            </select>
          </div>
        </div>
      </div>
    `;
  }

  function openProfileModal(existing, category, appApi) {
    const root = document.getElementById('modal-root');
    const isNew = !existing;
    const cat = existing ? existing.category : (category || 'cloison');
    const draft = existing ? Store.deepClone(existing) : {
      id: Store.uid('prof'),
      category: cat,
      name: cat === 'cloison' ? 'Nouvelle Cloison M70' : (cat === 'doublage' ? 'Nouveau Doublage Optima 2' : 'Nouveau Faux Plafond F530'),
      color: cat === 'cloison' ? '#38BDF8' : (cat === 'doublage' ? '#F5C518' : '#22C55E'),
      section: 'M70',
      entraxeCm: cat === 'plafond' ? 50 : 60,
      montantType: 'simple',
      doublageSystem: 'optima',
      optimaRange: '75-120',
      periphType: 'CR2',
      suspenteType: 'integra2',
      integraLength: '200-240',
      plenumCm: 20,
      faceA: { skins: 1, plateType: 'std', plateHeight: 'auto' },
      faceB: { skins: 1, plateType: 'std', plateHeight: 'auto' },
      insulation: { enabled: true, material: 'laine_coton', thicknessMm: cat === 'plafond' ? 200 : (cat === 'doublage' ? 100 : 60) }
    };

    const thicknesses = cat === 'plafond' ? C.INSULATION_THICKNESSES_CEILING : C.INSULATION_THICKNESSES_WALL;

    function renderModalContent() {
      let specificHtml = '';
      if (cat === 'cloison') {
        specificHtml = `
          <div class="grid-3">
            <div class="field">
              <label>Section ossature (Rail + Montant)</label>
              <select id="pm-section" class="select mono">
                ${Object.values(C.FRAME_SECTIONS).map((s) => `<option value="${s.id}" ${draft.section === s.id ? 'selected' : ''}>${s.id} (${s.rail} + ${s.montant})</option>`).join('')}
              </select>
            </div>
            <div class="field">
              <label>Entraxe des montants</label>
              <select id="pm-entraxe" class="select mono">
                <option value="60" ${Number(draft.entraxeCm) === 60 ? 'selected' : ''}>60 cm (standard DTU)</option>
                <option value="40" ${Number(draft.entraxeCm) === 40 ? 'selected' : ''}>40 cm (renforcé / faïence)</option>
              </select>
            </div>
            <div class="field">
              <label>Type de montants</label>
              <select id="pm-montant-type" class="select">
                <option value="simple" ${draft.montantType !== 'double' ? 'selected' : ''}>Simples</option>
                <option value="double" ${draft.montantType === 'double' ? 'selected' : ''}>Doublés dos à dos (grande hauteur)</option>
              </select>
            </div>
          </div>
          ${buildFaceEditorHtml('pm-fa', 'Parement Face A (côté 1)', draft.faceA)}
          ${buildFaceEditorHtml('pm-fb', 'Parement Face B (côté 2 — indépendant)', draft.faceB)}
        `;
      } else if (cat === 'doublage') {
        const isOptima = draft.doublageSystem === 'optima';
        specificHtml = `
          <div class="field">
            <label>Système de doublage périphérique</label>
            <div class="segmented" id="pm-doublage-sys">
              <button type="button" data-val="optima" class="${isOptima ? 'active' : ''}">Option B : Appuis réglables Optima 2 (F530)</button>
              <button type="button" data-val="independant" class="${!isOptima ? 'active' : ''}">Option A : Ossature indépendante (R/M)</button>
            </div>
          </div>
          ${isOptima ? `
            <div class="grid-2">
              <div class="field">
                <label>Plage de réglage Appuis Optima 2</label>
                <select id="pm-optima-range" class="select">
                  ${C.OPTIMA_RANGES.map((r) => `<option value="${r.id}" ${draft.optimaRange === r.id ? 'selected' : ''}>${esc(r.label)}</option>`).join('')}
                </select>
              </div>
              <div class="field">
                <label>Fourrures F530 + Lisses Clip</label>
                <input class="input mono" type="text" disabled value="Entraxe 60 cm · 1 à 2 appuis/fourrure" />
              </div>
            </div>
          ` : `
            <div class="grid-3">
              <div class="field">
                <label>Section ossature</label>
                <select id="pm-section" class="select mono">
                  ${Object.values(C.FRAME_SECTIONS).map((s) => `<option value="${s.id}" ${draft.section === s.id ? 'selected' : ''}>${s.id} (${s.rail} / ${s.montant})</option>`).join('')}
                </select>
              </div>
              <div class="field">
                <label>Entraxe montants</label>
                <select id="pm-entraxe" class="select mono">
                  <option value="60" ${Number(draft.entraxeCm) === 60 ? 'selected' : ''}>60 cm</option>
                  <option value="40" ${Number(draft.entraxeCm) === 40 ? 'selected' : ''}>40 cm</option>
                </select>
              </div>
              <div class="field">
                <label>Montants</label>
                <select id="pm-montant-type" class="select">
                  <option value="simple" ${draft.montantType !== 'double' ? 'selected' : ''}>Simples</option>
                  <option value="double" ${draft.montantType === 'double' ? 'selected' : ''}>Doublés dos à dos</option>
                </select>
              </div>
            </div>
          `}
          ${buildFaceEditorHtml('pm-fa', 'Parement Doublage', draft.faceA)}
        `;
      } else {
        specificHtml = `
          <div class="grid-2">
            <div class="field">
              <label>Entraxe Fourrures F530</label>
              <select id="pm-entraxe" class="select mono">
                <option value="50" ${Number(draft.entraxeCm) === 50 ? 'selected' : ''}>50 cm (pose perpendiculaire aux F530)</option>
                <option value="60" ${Number(draft.entraxeCm) === 60 ? 'selected' : ''}>60 cm (pose parallèle / standard)</option>
              </select>
            </div>
            <div class="field">
              <label>Profilé périphérique</label>
              <select id="pm-periph" class="select">
                <option value="CR2" ${draft.periphType !== 'lisse' ? 'selected' : ''}>Cornières périphériques CR2 (3 m)</option>
                <option value="lisse" ${draft.periphType === 'lisse' ? 'selected' : ''}>Lisses périphériques Clip (3 m)</option>
              </select>
            </div>
          </div>
          <div class="grid-2">
            <div class="field">
              <label>Type de suspentes</label>
              <select id="pm-suspente-type" class="select">
                ${Object.values(C.SUSPENTE_TYPES).map((s) => `<option value="${s.id}" ${draft.suspenteType === s.id ? 'selected' : ''}>${esc(s.label)}</option>`).join('')}
              </select>
            </div>
            ${draft.suspenteType === 'integra2' ? `
              <div class="field">
                <label>Longueur Integra 2 (selon isolant)</label>
                <select id="pm-integra-len" class="select">
                  ${C.INTEGRA2_LENGTHS.map((il) => `<option value="${il.id}" ${draft.integraLength === il.id ? 'selected' : ''}>${esc(il.label)}</option>`).join('')}
                </select>
              </div>
            ` : (draft.suspenteType === 'classique_tige' ? `
              <div class="field">
                <label>Hauteur de plénum (pour tiges filetées M6)</label>
                <div class="input-group">
                  <input id="pm-plenum" class="input mono" type="number" min="10" max="200" value="${esc(draft.plenumCm || 20)}" />
                  <span class="input-addon">cm</span>
                </div>
              </div>
            ` : `
              <div class="field">
                <label>Fixation sur solives bois</label>
                <input class="input" disabled value="1 suspente / 1,20 m max (~2,2–2,5/m²)" />
              </div>
            `)}
          </div>
          ${buildFaceEditorHtml('pm-fa', 'Parement Faux Plafond', draft.faceA)}
        `;
      }

      const insOn = draft.insulation && draft.insulation.enabled;
      root.innerHTML = `
        <div class="modal-backdrop" id="pm-backdrop">
          <div class="modal-box">
            <div class="card-header">
              <h3 class="card-title">${isNew ? 'Nouveau profil' : 'Modifier le profil'} — ${cat === 'cloison' ? 'Cloison' : (cat === 'doublage' ? 'Doublage' : 'Faux Plafond')}</h3>
              <button type="button" class="btn btn-sm btn-ghost" id="pm-close">✕</button>
            </div>
            <div class="card-body stack">
              <div class="grid-2">
                <div class="field">
                  <label>Nom du profil (affiché sur le plan)</label>
                  <input id="pm-name" class="input" type="text" value="${esc(draft.name)}" />
                </div>
                <div class="field">
                  <label>Couleur d'identification sur le croquis</label>
                  <div class="row">
                    ${['#F5C518', '#38BDF8', '#22C55E', '#E2E8F0', '#F43F5E', '#FB923C', '#A78BFA'].map((col) => `
                      <button type="button" class="pm-color-btn" data-col="${col}" style="width:28px;height:28px;border-radius:6px;background:${col};border:2px solid ${draft.color === col ? '#fff' : 'transparent'};cursor:pointer;"></button>
                    `).join('')}
                  </div>
                </div>
              </div>

              ${specificHtml}

              <!-- Isolation -->
              <div style="background:var(--bg-surface);border:1px solid var(--border);border-radius:8px;padding:12px;">
                <div class="row-between" style="margin-bottom:10px;">
                  <strong style="font-size:12.5px;color:#4ADE80;">🌿 Isolation thermique &amp; acoustique</strong>
                  <div class="segmented" id="pm-ins-toggle">
                    <button type="button" data-val="on" class="${insOn ? 'active' : ''}">Avec isolation</button>
                    <button type="button" data-val="off" class="${!insOn ? 'active' : ''}">Sans isolation</button>
                  </div>
                </div>
                ${insOn ? `
                  <div class="grid-2">
                    <div class="field">
                      <label>Matériau isolant</label>
                      <select id="pm-ins-mat" class="select">
                        ${Object.values(C.INSULATION_MATERIALS).map((m) => `
                          <option value="${m.id}" ${draft.insulation.material === m.id ? 'selected' : ''}>
                            ${esc(m.name)}${m.priority ? ' ★ (Prioritaire)' : ''}
                          </option>
                        `).join('')}
                      </select>
                    </div>
                    <div class="field">
                      <label>Épaisseur isolant</label>
                      <select id="pm-ins-thick" class="select mono">
                        ${thicknesses.map((t) => `<option value="${t}" ${Number(draft.insulation.thicknessMm) === t ? 'selected' : ''}>${t} mm</option>`).join('')}
                      </select>
                    </div>
                  </div>
                ` : '<div style="font-size:12px;color:var(--text-muted);">Aucun isolant comptabilisé pour cet ouvrage.</div>'}
              </div>

              <div class="row-between" style="padding-top:6px;">
                <button type="button" class="btn" id="pm-cancel">Annuler</button>
                <button type="button" class="btn btn-primary" id="pm-save">✔ Enregistrer le profil</button>
              </div>
            </div>
          </div>
        </div>
      `;

      // Bind modal interactive re-renders
      const syncDraftFromInputs = () => {
        const nameEl = root.querySelector('#pm-name');
        if (nameEl) draft.name = nameEl.value.trim() || draft.name;
        const secEl = root.querySelector('#pm-section');
        if (secEl) draft.section = secEl.value;
        const entEl = root.querySelector('#pm-entraxe');
        if (entEl) draft.entraxeCm = Number(entEl.value);
        const mtEl = root.querySelector('#pm-montant-type');
        if (mtEl) draft.montantType = mtEl.value;
        const optEl = root.querySelector('#pm-optima-range');
        if (optEl) draft.optimaRange = optEl.value;
        const perEl = root.querySelector('#pm-periph');
        if (perEl) draft.periphType = perEl.value;
        const susEl = root.querySelector('#pm-suspente-type');
        if (susEl) draft.suspenteType = susEl.value;
        const intEl = root.querySelector('#pm-integra-len');
        if (intEl) draft.integraLength = intEl.value;
        const plEl = root.querySelector('#pm-plenum');
        if (plEl) draft.plenumCm = Number(plEl.value) || 20;

        const faS = root.querySelector('#pm-fa-skins');
        if (faS) {
          draft.faceA = {
            skins: Number(faS.value),
            plateType: root.querySelector('#pm-fa-plate-type').value,
            plateHeight: root.querySelector('#pm-fa-plate-h').value
          };
        }
        const fbS = root.querySelector('#pm-fb-skins');
        if (fbS) {
          draft.faceB = {
            skins: Number(fbS.value),
            plateType: root.querySelector('#pm-fb-plate-type').value,
            plateHeight: root.querySelector('#pm-fb-plate-h').value
          };
        }
        const imEl = root.querySelector('#pm-ins-mat');
        if (imEl) draft.insulation.material = imEl.value;
        const itEl = root.querySelector('#pm-ins-thick');
        if (itEl) draft.insulation.thicknessMm = Number(itEl.value);
      };

      root.querySelectorAll('.pm-color-btn').forEach((b) => {
        b.addEventListener('click', () => {
          syncDraftFromInputs();
          draft.color = b.dataset.col;
          renderModalContent();
        });
      });

      root.querySelectorAll('#pm-doublage-sys button').forEach((b) => {
        b.addEventListener('click', () => {
          syncDraftFromInputs();
          draft.doublageSystem = b.dataset.val;
          renderModalContent();
        });
      });

      const suspSel = root.querySelector('#pm-suspente-type');
      if (suspSel) {
        suspSel.addEventListener('change', () => {
          syncDraftFromInputs();
          renderModalContent();
        });
      }

      root.querySelectorAll('#pm-ins-toggle button').forEach((b) => {
        b.addEventListener('click', () => {
          syncDraftFromInputs();
          draft.insulation.enabled = b.dataset.val === 'on';
          renderModalContent();
        });
      });

      const itSel = root.querySelector('#pm-ins-thick');
      if (itSel) {
        itSel.addEventListener('change', () => {
          syncDraftFromInputs();
          if (cat === 'doublage' && draft.doublageSystem === 'optima') {
            draft.optimaRange = C.suggestOptimaRange(draft.insulation.thicknessMm);
            renderModalContent();
          } else if (cat === 'plafond' && draft.suspenteType === 'integra2') {
            draft.integraLength = C.suggestIntegraLength(draft.insulation.thicknessMm);
            renderModalContent();
          }
        });
      }

      const close = () => { root.innerHTML = ''; };
      root.querySelector('#pm-close').addEventListener('click', close);
      root.querySelector('#pm-cancel').addEventListener('click', close);
      root.querySelector('#pm-backdrop').addEventListener('click', (e) => {
        if (e.target.id === 'pm-backdrop') close();
      });
      root.querySelector('#pm-save').addEventListener('click', () => {
        syncDraftFromInputs();
        Store.upsertProfile(draft);
        close();
        appApi.toast(`Profil "${draft.name}" enregistré`);
      });
    }

    renderModalContent();
  }

  global.PlacoTab1 = { render };
})(window);
