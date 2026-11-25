/* ============================================================================
 * PLACO PRO — Onglet 1 : Chantier & Paramètres Techniques (DTU 25.41)
 * Mise en page directe en 3 colonnes côte à côte (sans modale) :
 *   1. Cloison distributive | 2. Doublage périphérique | 3. Faux plafond
 * avec cases à cocher par composant, menus déroulants rapides, variantes
 * multiples et affectation directe exclusive des murs du plan.
 * ============================================================================ */
(function (global) {
  'use strict';

  const C = global.PlacoConstants;
  const Store = global.PlacoStore;

  // Variante active affichée dans chacune des 3 colonnes
  const activeVariantByCat = {
    cloison: null,
    doublage: null,
    plafond: null
  };

  function esc(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function compOn(prof, key) {
    return !prof.components || prof.components[key] !== false;
  }

  function ensureComponents(prof) {
    if (!prof.components) prof.components = {};
    return prof.components;
  }

  function plateTypeOptionsHtml(selected) {
    const order = ['std', 'hydro', 'feu', 'acoustique', 'haute_durete'];
    const labels = {
      std: 'BA13 Std',
      hydro: 'Hydro H1',
      feu: 'Feu (PPF)',
      acoustique: 'Acoustique',
      haute_durete: 'Haute dureté'
    };
    return order.map((id) => `
      <option value="${id}" ${selected === id ? 'selected' : ''}>${labels[id]}</option>
    `).join('');
  }

  function plateHeightOptionsHtml(selected) {
    const val = String(selected || 'auto');
    return `
      <option value="auto" ${val === 'auto' ? 'selected' : ''}>H. Auto</option>
      ${C.PLATE_HEIGHTS_CM.map((h) => `<option value="${h}" ${val === String(h) ? 'selected' : ''}>${h} cm</option>`).join('')}
    `;
  }

  function insulationMaterialOptionsHtml(selected) {
    const labels = {
      laine_coton: 'Laine de coton ★',
      laine_verre: 'Laine de verre',
      laine_roche: 'Laine de roche',
      fibre_bois: 'Fibre de bois'
    };
    return Object.keys(labels).map((id) => `
      <option value="${id}" ${(selected || 'laine_coton') === id ? 'selected' : ''}>${labels[id]}</option>
    `).join('');
  }

  function thicknessOptionsHtml(list, selected) {
    const selNum = Number(selected);
    const items = list.slice();
    if (selNum && !items.includes(selNum)) {
      items.push(selNum);
      items.sort((a, b) => a - b);
    }
    return items.map((t) => `<option value="${t}" ${selNum === t ? 'selected' : ''}>${t} mm</option>`).join('');
  }

  function getActiveVariant(variants, category) {
    if (!variants.length) return null;
    const saved = activeVariantByCat[category];
    const found = variants.find((v) => v.id === saved);
    if (found) return found;
    activeVariantByCat[category] = variants[0].id;
    return variants[0];
  }

  function countAssignedWalls(walls, profileId) {
    return (walls || []).filter((w) => w.profileId === profileId).length;
  }

  /**
   * Construit l'encadré bas "Murs / Zones affectés à ce gabarit" pour Cloison & Doublage.
   */
  function renderWallAssignmentBox(prof, proj) {
    const walls = proj.walls || [];
    const profilesById = {};
    (proj.profiles || []).forEach((p) => { profilesById[p.id] = p; });

    const assignedHere = walls.filter((w) => w.profileId === prof.id);
    const totalMl = assignedHere.reduce((s, w) => s + (Number(w.lengthCm) || 0) / 100, 0);
    const totalM2 = assignedHere.reduce((s, w) => {
      const hAvg = ((Number(w.hLeftCm) || 250) + (Number(w.hRightCm) || 250)) / 2;
      return s + ((Number(w.lengthCm) || 0) * hAvg) / 10000;
    }, 0);

    return `
      <div class="wall-assign-box">
        <div class="wall-assign-title">
          <span>Murs / Zones affectés à ce gabarit</span>
          <span class="badge badge-slate">${assignedHere.length}/${walls.length}</span>
        </div>
        ${walls.length ? `
          <div class="wall-assign-list">
            ${walls.map((w) => {
              const isHere = w.profileId === prof.id;
              const otherProf = !isHere && w.profileId ? profilesById[w.profileId] : null;
              const lenM = ((Number(w.lengthCm) || 0) / 100).toFixed(2).replace('.', ',');
              return `
                <label class="wall-assign-row ${isHere ? 'assigned-here' : (otherProf ? 'assigned-other' : '')}">
                  <span style="display:flex;align-items:center;gap:7px;min-width:0;flex:1;">
                    <input type="checkbox" class="chk-assign-wall"
                           data-prof="${esc(prof.id)}" data-wall="${esc(w.id)}"
                           ${isHere ? 'checked' : ''} />
                    <span style="font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(w.name)}</span>
                  </span>
                  <span style="display:flex;align-items:center;gap:6px;flex-shrink:0;">
                    ${otherProf ? `<span style="font-size:10px;color:var(--text-muted);max-width:95px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="Actuellement affecté à : ${esc(otherProf.name)}">→ ${esc(otherProf.name)}</span>` : ''}
                    ${!isHere && !otherProf ? '<span style="font-size:10px;color:#F87171;">Non affecté</span>' : ''}
                    <span class="wall-assign-meta">${Math.round(w.lengthCm)} cm (${lenM} m)</span>
                  </span>
                </label>
              `;
            }).join('')}
          </div>
          <div class="wall-assign-footer">
            <span>${assignedHere.length} mur(s) · ${totalMl.toFixed(2).replace('.', ',')} ml</span>
            <span>${totalM2.toFixed(2).replace('.', ',')} m²</span>
          </div>
        ` : `
          <div style="font-size:11.5px;color:var(--text-muted);line-height:1.4;">
            Aucun mur tracé pour le moment. Tracez vos murs dans l'onglet <strong>2. Croquis</strong> puis cochez-les directement ici.
          </div>
        `}
      </div>
    `;
  }

  /**
   * Construit l'encadré bas "Zone affectée" pour la Colonne 3 — Faux plafond.
   */
  function renderCeilingAssignmentBox(prof, proj, calc) {
    const ceil = proj.ceiling || { enabled: false, profileId: prof.id, autoFromPlan: true, customLengthCm: 0, customWidthCm: 0 };
    const isAssignedHere = Boolean(ceil.enabled && ceil.profileId === prof.id);
    const planGeom = (calc && calc.planGeom) || { areaM2: 0, perimeterMl: 0 };
    const hasPlanArea = planGeom.areaM2 > 0.1;

    return `
      <div class="wall-assign-box">
        <div class="wall-assign-title">
          <span>Zones / Plafond affecté à ce gabarit</span>
          <span class="badge ${isAssignedHere ? 'badge-green' : 'badge-slate'}">${isAssignedHere ? 'Actif' : 'Inactif'}</span>
        </div>

        <label class="wall-assign-row ${isAssignedHere ? 'assigned-here' : ''}">
          <span style="display:flex;align-items:center;gap:7px;">
            <input type="checkbox" class="chk-assign-ceiling" data-prof="${esc(prof.id)}" ${isAssignedHere ? 'checked' : ''} />
            <span style="font-weight:700;">Faux plafond de la pièce</span>
          </span>
          <span class="wall-assign-meta">
            ${isAssignedHere && calc.ceilingResult ? `${calc.ceilingResult.areaM2} m²` : (hasPlanArea ? `${planGeom.areaM2} m²` : '0 m²')}
          </span>
        </label>

        ${isAssignedHere ? `
          <label style="display:flex;align-items:center;gap:6px;font-size:11.5px;color:var(--text-sub);cursor:pointer;">
            <input type="checkbox" id="t1-ceil-auto" ${ceil.autoFromPlan ? 'checked' : ''} style="accent-color:var(--blue);" />
            <span>Auto depuis le plan (${planGeom.areaM2} m² · pér. ${planGeom.perimeterMl} ml)</span>
          </label>
          ${(!ceil.autoFromPlan || !hasPlanArea) ? `
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
              <input type="number" id="t1-ceil-len" class="comp-select mono" min="50" max="3000"
                     value="${ceil.customLengthCm || ''}" placeholder="Long. (cm)" aria-label="Longueur plafond cm" />
              <input type="number" id="t1-ceil-wid" class="comp-select mono" min="50" max="3000"
                     value="${ceil.customWidthCm || ''}" placeholder="Larg. (cm)" aria-label="Largeur plafond cm" />
            </div>
          ` : ''}
          ${calc.ceilingResult ? `
            <div class="wall-assign-footer">
              <span>Pér. ${calc.ceilingResult.perimeterMl} ml</span>
              <span>${calc.ceilingResult.areaM2} m² · ${calc.ceilingResult.totalPlates} pl.</span>
            </div>
          ` : ''}
        ` : `
          <div style="font-size:11.5px;color:var(--text-muted);">
            Cochez ci-dessus pour inclure le faux plafond dans le calepinage et la commande.
          </div>
        `}
      </div>
    `;
  }

  /**
   * En-tête + barre de variantes commune à chaque colonne.
   */
  function renderColumnHeaderAndVariants(cat, title, icon, variants, active, proj) {
    const walls = proj.walls || [];
    const ceil = proj.ceiling || {};
    return `
      <div class="config-col-header">
        <h3 class="config-col-title">${icon} ${esc(title)}</h3>
        <button type="button" class="btn btn-sm btn-blue btn-add-variant" data-cat="${cat}">+ Variante</button>
      </div>
      <div class="variant-bar">
        ${variants.map((v, idx) => {
          const isAct = active && v.id === active.id;
          const cnt = cat === 'plafond'
            ? (ceil.enabled && ceil.profileId === v.id ? 1 : 0)
            : countAssignedWalls(walls, v.id);
          const letter = String.fromCharCode(65 + (idx % 26));
          return `
            <button type="button" class="variant-pill ${isAct ? 'active' : ''}" data-select-variant="${esc(v.id)}" data-cat="${cat}">
              <span class="v-dot" style="background:${esc(v.color || '#F5C518')}"></span>
              <span>Var. ${letter}</span>
              ${cnt > 0 ? `<span style="font-family:var(--font-mono);opacity:0.85;">(${cnt})</span>` : ''}
            </button>
          `;
        }).join('')}
      </div>
      ${active ? `
        <div class="variant-name-bar">
          <input type="text" class="input inp-variant-name" data-prof="${esc(active.id)}" value="${esc(active.name)}" aria-label="Nom de la variante" />
          ${variants.length > 1 ? `<button type="button" class="btn btn-sm btn-danger btn-del-variant" data-prof="${esc(active.id)}" data-cat="${cat}" title="Supprimer cette variante">🗑️</button>` : ''}
        </div>
      ` : ''}
    `;
  }

  /**
   * COLONNE 1 : CLOISON DISTRIBUTIVE
   */
  function renderColCloison(variants, proj) {
    const p = getActiveVariant(variants, 'cloison');
    if (!p) return '';
    const sec = p.section || 'M48';
    const rOn = compOn(p, 'rails');
    const mOn = compOn(p, 'montants');
    const iOn = Boolean(p.insulation && p.insulation.enabled);
    const faOn = compOn(p, 'faceA');
    const fbOn = compOn(p, 'faceB');
    const brOn = compOn(p, 'bandeResiliente');
    const fa = p.faceA || { skins: 1, plateType: 'std', plateHeight: 'auto' };
    const fb = p.faceB || { skins: 1, plateType: 'std', plateHeight: 'auto' };

    return `
      <div class="config-col col-cloison" data-col-prof="${esc(p.id)}">
        ${renderColumnHeaderAndVariants('cloison', '1. Cloison distributive', '🧱', variants, p, proj)}
        <div class="config-col-body">
          <!-- Rails -->
          <div class="comp-row ${rOn ? '' : 'disabled'}">
            <div class="comp-row-head">
              <label class="comp-check">
                <input type="checkbox" data-p="${esc(p.id)}" data-comp="rails" ${rOn ? 'checked' : ''} />
                <span>Rails</span>
              </label>
              <select class="comp-select mono" style="max-width:120px;" data-p="${esc(p.id)}" data-field="section" ${rOn ? '' : 'disabled'}>
                <option value="M48" ${sec === 'M48' ? 'selected' : ''}>R48</option>
                <option value="M70" ${sec === 'M70' ? 'selected' : ''}>R70</option>
                <option value="M90" ${sec === 'M90' ? 'selected' : ''}>R90</option>
                <option value="M100" ${sec === 'M100' ? 'selected' : ''}>R100</option>
              </select>
            </div>
          </div>

          <!-- Montants (synchronisés avec Rails) -->
          <div class="comp-row ${mOn ? '' : 'disabled'}">
            <div class="comp-row-head">
              <label class="comp-check">
                <input type="checkbox" data-p="${esc(p.id)}" data-comp="montants" ${mOn ? 'checked' : ''} />
                <span>Montants</span>
              </label>
              <select class="comp-select mono" style="max-width:120px;" data-p="${esc(p.id)}" data-field="section" ${mOn ? '' : 'disabled'}>
                <option value="M48" ${sec === 'M48' ? 'selected' : ''}>M48</option>
                <option value="M70" ${sec === 'M70' ? 'selected' : ''}>M70</option>
                <option value="M90" ${sec === 'M90' ? 'selected' : ''}>M90</option>
                <option value="M100" ${sec === 'M100' ? 'selected' : ''}>M100</option>
              </select>
            </div>
            <div class="comp-controls">
              <select class="comp-select mono" data-p="${esc(p.id)}" data-field="entraxeCm" ${mOn ? '' : 'disabled'}>
                <option value="60" ${Number(p.entraxeCm) === 60 ? 'selected' : ''}>Entraxe 60 cm</option>
                <option value="40" ${Number(p.entraxeCm) === 40 ? 'selected' : ''}>Entraxe 40 cm</option>
              </select>
              <select class="comp-select" data-p="${esc(p.id)}" data-field="montantType" ${mOn ? '' : 'disabled'}>
                <option value="simple" ${p.montantType !== 'double' ? 'selected' : ''}>Simples</option>
                <option value="double" ${p.montantType === 'double' ? 'selected' : ''}>Doublés dos à dos</option>
              </select>
            </div>
          </div>

          <!-- Isolant -->
          <div class="comp-row ${iOn ? '' : 'disabled'}">
            <div class="comp-row-head">
              <label class="comp-check">
                <input type="checkbox" data-p="${esc(p.id)}" data-ins-toggle="1" ${iOn ? 'checked' : ''} />
                <span>Isolant</span>
              </label>
            </div>
            <div class="comp-controls">
              <select class="comp-select" data-p="${esc(p.id)}" data-ins-field="material" ${iOn ? '' : 'disabled'}>
                ${insulationMaterialOptionsHtml(p.insulation && p.insulation.material)}
              </select>
              <select class="comp-select mono" style="max-width:105px;" data-p="${esc(p.id)}" data-ins-field="thicknessMm" ${iOn ? '' : 'disabled'}>
                ${thicknessOptionsHtml([50, 60, 80, 100], (p.insulation && p.insulation.thicknessMm) || 50)}
              </select>
            </div>
          </div>

          <!-- Parement Face A -->
          <div class="comp-row ${faOn ? '' : 'disabled'}">
            <div class="comp-row-head">
              <label class="comp-check">
                <input type="checkbox" data-p="${esc(p.id)}" data-comp="faceA" ${faOn ? 'checked' : ''} />
                <span>Parement Face A</span>
              </label>
            </div>
            <div class="comp-controls">
              <select class="comp-select" data-p="${esc(p.id)}" data-face="faceA" data-ff="skins" ${faOn ? '' : 'disabled'}>
                <option value="1" ${Number(fa.skins) === 1 ? 'selected' : ''}>Simple peau</option>
                <option value="2" ${Number(fa.skins) === 2 ? 'selected' : ''}>Double peau</option>
              </select>
              <select class="comp-select" data-p="${esc(p.id)}" data-face="faceA" data-ff="plateType" ${faOn ? '' : 'disabled'}>
                ${plateTypeOptionsHtml(fa.plateType)}
              </select>
              <select class="comp-select mono" style="max-width:95px;" data-p="${esc(p.id)}" data-face="faceA" data-ff="plateHeight" ${faOn ? '' : 'disabled'}>
                ${plateHeightOptionsHtml(fa.plateHeight)}
              </select>
            </div>
          </div>

          <!-- Parement Face B -->
          <div class="comp-row ${fbOn ? '' : 'disabled'}">
            <div class="comp-row-head">
              <label class="comp-check">
                <input type="checkbox" data-p="${esc(p.id)}" data-comp="faceB" ${fbOn ? 'checked' : ''} />
                <span>Parement Face B</span>
              </label>
            </div>
            <div class="comp-controls">
              <select class="comp-select" data-p="${esc(p.id)}" data-face="faceB" data-ff="skins" ${fbOn ? '' : 'disabled'}>
                <option value="1" ${Number(fb.skins) === 1 ? 'selected' : ''}>Simple peau</option>
                <option value="2" ${Number(fb.skins) === 2 ? 'selected' : ''}>Double peau</option>
              </select>
              <select class="comp-select" data-p="${esc(p.id)}" data-face="faceB" data-ff="plateType" ${fbOn ? '' : 'disabled'}>
                ${plateTypeOptionsHtml(fb.plateType)}
              </select>
              <select class="comp-select mono" style="max-width:95px;" data-p="${esc(p.id)}" data-face="faceB" data-ff="plateHeight" ${fbOn ? '' : 'disabled'}>
                ${plateHeightOptionsHtml(fb.plateHeight)}
              </select>
            </div>
          </div>

          <!-- Bande résiliente acoustique -->
          <div class="comp-row ${brOn ? '' : 'disabled'}">
            <div class="comp-row-head">
              <label class="comp-check">
                <input type="checkbox" data-p="${esc(p.id)}" data-comp="bandeResiliente" ${brOn ? 'checked' : ''} />
                <span>Bande résiliente acoustique</span>
              </label>
              <span style="font-size:11px;color:var(--text-muted);font-family:var(--font-mono);">sous rail bas</span>
            </div>
          </div>
        </div>
        ${renderWallAssignmentBox(p, proj)}
      </div>
    `;
  }

  /**
   * COLONNE 2 : DOUBLAGE DES MURS PÉRIPHÉRIQUES
   */
  function renderColDoublage(variants, proj) {
    const p = getActiveVariant(variants, 'doublage');
    if (!p) return '';
    const isOptima = (p.doublageSystem || 'optima') === 'optima';
    const sec = p.section || 'M70';
    const f530On = compOn(p, 'f530');
    const lissesOn = compOn(p, 'lisses');
    const appuisOn = compOn(p, 'appuis');
    const rOn = compOn(p, 'rails');
    const mOn = compOn(p, 'montants');
    const iOn = Boolean(p.insulation && p.insulation.enabled);
    const faOn = compOn(p, 'faceA');
    const fa = p.faceA || { skins: 1, plateType: 'std', plateHeight: 'auto' };

    return `
      <div class="config-col col-doublage" data-col-prof="${esc(p.id)}">
        ${renderColumnHeaderAndVariants('doublage', '2. Doublage murs périphériques', '🛡️', variants, p, proj)}
        <div class="config-col-body">
          <!-- Sélecteur de système en haut de colonne -->
          <div class="sys-switch-bar">
            <button type="button" class="${isOptima ? 'active' : ''}" data-p="${esc(p.id)}" data-set-doublage="optima">
              Système Optima<br/><span style="font-weight:500;font-size:10px;opacity:0.85;">Appuis + Fourrures</span>
            </button>
            <button type="button" class="${!isOptima ? 'active' : ''}" data-p="${esc(p.id)}" data-set-doublage="independant">
              Ossature indép.<br/><span style="font-weight:500;font-size:10px;opacity:0.85;">Rails + Montants</span>
            </button>
          </div>

          ${isOptima ? `
            <!-- Fourrures F530 + Lisses Clip -->
            <div class="comp-row ${f530On ? '' : 'disabled'}">
              <div class="comp-row-head">
                <label class="comp-check">
                  <input type="checkbox" data-p="${esc(p.id)}" data-comp="f530" ${f530On ? 'checked' : ''} />
                  <span>Fourrures F530</span>
                </label>
                <span class="badge badge-slate" style="font-family:var(--font-mono);">Entraxe 60 cm</span>
              </div>
            </div>

            <div class="comp-row ${lissesOn ? '' : 'disabled'}">
              <div class="comp-row-head">
                <label class="comp-check">
                  <input type="checkbox" data-p="${esc(p.id)}" data-comp="lisses" ${lissesOn ? 'checked' : ''} />
                  <span>Lisses basses / hautes Clip</span>
                </label>
                <span style="font-size:11px;color:var(--text-muted);font-family:var(--font-mono);">3,00 m</span>
              </div>
            </div>

            <!-- Appuis muraux réglables -->
            <div class="comp-row ${appuisOn ? '' : 'disabled'}">
              <div class="comp-row-head">
                <label class="comp-check">
                  <input type="checkbox" data-p="${esc(p.id)}" data-comp="appuis" ${appuisOn ? 'checked' : ''} />
                  <span>Appuis muraux réglables</span>
                </label>
              </div>
              <div class="comp-controls">
                <select class="comp-select mono" data-p="${esc(p.id)}" data-field="optimaRange" ${appuisOn ? '' : 'disabled'}>
                  ${C.OPTIMA_RANGES.map((r) => `<option value="${r.id}" ${(p.optimaRange || '75-120') === r.id ? 'selected' : ''}>${esc(r.label)}</option>`).join('')}
                </select>
              </div>
            </div>
          ` : `
            <!-- Rails -->
            <div class="comp-row ${rOn ? '' : 'disabled'}">
              <div class="comp-row-head">
                <label class="comp-check">
                  <input type="checkbox" data-p="${esc(p.id)}" data-comp="rails" ${rOn ? 'checked' : ''} />
                  <span>Rails</span>
                </label>
                <select class="comp-select mono" style="max-width:120px;" data-p="${esc(p.id)}" data-field="section" ${rOn ? '' : 'disabled'}>
                  <option value="M48" ${sec === 'M48' ? 'selected' : ''}>R48</option>
                  <option value="M70" ${sec === 'M70' ? 'selected' : ''}>R70</option>
                  <option value="M90" ${sec === 'M90' ? 'selected' : ''}>R90</option>
                  <option value="M100" ${sec === 'M100' ? 'selected' : ''}>R100</option>
                </select>
              </div>
            </div>

            <!-- Montants -->
            <div class="comp-row ${mOn ? '' : 'disabled'}">
              <div class="comp-row-head">
                <label class="comp-check">
                  <input type="checkbox" data-p="${esc(p.id)}" data-comp="montants" ${mOn ? 'checked' : ''} />
                  <span>Montants</span>
                </label>
                <select class="comp-select mono" style="max-width:120px;" data-p="${esc(p.id)}" data-field="section" ${mOn ? '' : 'disabled'}>
                  <option value="M48" ${sec === 'M48' ? 'selected' : ''}>M48</option>
                  <option value="M70" ${sec === 'M70' ? 'selected' : ''}>M70</option>
                  <option value="M90" ${sec === 'M90' ? 'selected' : ''}>M90</option>
                  <option value="M100" ${sec === 'M100' ? 'selected' : ''}>M100</option>
                </select>
              </div>
              <div class="comp-controls">
                <select class="comp-select mono" data-p="${esc(p.id)}" data-field="entraxeCm" ${mOn ? '' : 'disabled'}>
                  <option value="60" ${Number(p.entraxeCm) === 60 ? 'selected' : ''}>Entraxe 60 cm</option>
                  <option value="40" ${Number(p.entraxeCm) === 40 ? 'selected' : ''}>Entraxe 40 cm</option>
                </select>
                <select class="comp-select" data-p="${esc(p.id)}" data-field="montantType" ${mOn ? '' : 'disabled'}>
                  <option value="simple" ${p.montantType !== 'double' ? 'selected' : ''}>Simples</option>
                  <option value="double" ${p.montantType === 'double' ? 'selected' : ''}>Doublés</option>
                </select>
              </div>
            </div>
          `}

          <!-- Isolant -->
          <div class="comp-row ${iOn ? '' : 'disabled'}">
            <div class="comp-row-head">
              <label class="comp-check">
                <input type="checkbox" data-p="${esc(p.id)}" data-ins-toggle="1" ${iOn ? 'checked' : ''} />
                <span>Isolant</span>
              </label>
            </div>
            <div class="comp-controls">
              <select class="comp-select" data-p="${esc(p.id)}" data-ins-field="material" ${iOn ? '' : 'disabled'}>
                ${insulationMaterialOptionsHtml(p.insulation && p.insulation.material)}
              </select>
              <select class="comp-select mono" style="max-width:105px;" data-p="${esc(p.id)}" data-ins-field="thicknessMm" ${iOn ? '' : 'disabled'}>
                ${thicknessOptionsHtml([50, 60, 80, 100, 120, 145], (p.insulation && p.insulation.thicknessMm) || 100)}
              </select>
            </div>
          </div>

          <!-- Parement -->
          <div class="comp-row ${faOn ? '' : 'disabled'}">
            <div class="comp-row-head">
              <label class="comp-check">
                <input type="checkbox" data-p="${esc(p.id)}" data-comp="faceA" ${faOn ? 'checked' : ''} />
                <span>Parement</span>
              </label>
            </div>
            <div class="comp-controls">
              <select class="comp-select" data-p="${esc(p.id)}" data-face="faceA" data-ff="skins" ${faOn ? '' : 'disabled'}>
                <option value="1" ${Number(fa.skins) === 1 ? 'selected' : ''}>Simple peau</option>
                <option value="2" ${Number(fa.skins) === 2 ? 'selected' : ''}>Double peau</option>
              </select>
              <select class="comp-select" data-p="${esc(p.id)}" data-face="faceA" data-ff="plateType" ${faOn ? '' : 'disabled'}>
                ${plateTypeOptionsHtml(fa.plateType)}
              </select>
              <select class="comp-select mono" style="max-width:95px;" data-p="${esc(p.id)}" data-face="faceA" data-ff="plateHeight" ${faOn ? '' : 'disabled'}>
                ${plateHeightOptionsHtml(fa.plateHeight)}
              </select>
            </div>
          </div>
        </div>
        ${renderWallAssignmentBox(p, proj)}
      </div>
    `;
  }

  /**
   * COLONNE 3 : FAUX PLAFOND
   */
  function renderColPlafond(variants, proj, calc) {
    const p = getActiveVariant(variants, 'plafond');
    if (!p) return '';
    const f530On = compOn(p, 'f530');
    const periphOn = compOn(p, 'periph');
    const suspOn = compOn(p, 'suspentes');
    const iOn = Boolean(p.insulation && p.insulation.enabled);
    const faOn = compOn(p, 'faceA');
    const fa = p.faceA || { skins: 1, plateType: 'std', plateHeight: 'auto' };
    const suspType = p.suspenteType || 'integra2';

    return `
      <div class="config-col col-plafond" data-col-prof="${esc(p.id)}">
        ${renderColumnHeaderAndVariants('plafond', '3. Faux plafond', '⬜', variants, p, proj)}
        <div class="config-col-body">
          <!-- Fourrures F530 -->
          <div class="comp-row ${f530On ? '' : 'disabled'}">
            <div class="comp-row-head">
              <label class="comp-check">
                <input type="checkbox" data-p="${esc(p.id)}" data-comp="f530" ${f530On ? 'checked' : ''} />
                <span>Fourrures F530</span>
              </label>
              <select class="comp-select mono" style="max-width:135px;" data-p="${esc(p.id)}" data-field="entraxeCm" ${f530On ? '' : 'disabled'}>
                <option value="50" ${Number(p.entraxeCm) === 50 ? 'selected' : ''}>Entraxe 50 cm</option>
                <option value="60" ${Number(p.entraxeCm) === 60 ? 'selected' : ''}>Entraxe 60 cm</option>
              </select>
            </div>
          </div>

          <!-- Cornières périphériques CR2 -->
          <div class="comp-row ${periphOn ? '' : 'disabled'}">
            <div class="comp-row-head">
              <label class="comp-check">
                <input type="checkbox" data-p="${esc(p.id)}" data-comp="periph" ${periphOn ? 'checked' : ''} />
                <span>Cornières périph. CR2</span>
              </label>
              <select class="comp-select" style="max-width:125px;" data-p="${esc(p.id)}" data-field="periphType" ${periphOn ? '' : 'disabled'}>
                <option value="CR2" ${(p.periphType || 'CR2') === 'CR2' ? 'selected' : ''}>Cornières CR2</option>
                <option value="lisse" ${p.periphType === 'lisse' ? 'selected' : ''}>Lisses Clip</option>
              </select>
            </div>
          </div>

          <!-- Suspentes -->
          <div class="comp-row ${suspOn ? '' : 'disabled'}">
            <div class="comp-row-head">
              <label class="comp-check">
                <input type="checkbox" data-p="${esc(p.id)}" data-comp="suspentes" ${suspOn ? 'checked' : ''} />
                <span>Suspentes</span>
              </label>
            </div>
            <div class="comp-controls">
              <select class="comp-select" data-p="${esc(p.id)}" data-field="suspenteType" ${suspOn ? '' : 'disabled'}>
                <option value="integra2" ${suspType === 'integra2' ? 'selected' : ''}>Suspentes à piquer Integra 2</option>
                <option value="classique_bois" ${suspType === 'classique_bois' ? 'selected' : ''}>Suspentes classiques bois</option>
                <option value="classique_tige" ${suspType === 'classique_tige' ? 'selected' : ''}>Pivots + tiges filetées M6</option>
              </select>
              ${suspType === 'integra2' ? `
                <select class="comp-select mono" data-p="${esc(p.id)}" data-field="integraLength" ${suspOn ? '' : 'disabled'}>
                  ${C.INTEGRA2_LENGTHS.map((il) => `<option value="${il.id}" ${(p.integraLength || '200-240') === il.id ? 'selected' : ''}>Long. ${il.id} mm</option>`).join('')}
                </select>
              ` : (suspType === 'classique_tige' ? `
                <input type="number" class="comp-select mono" min="10" max="200" data-p="${esc(p.id)}" data-field="plenumCm"
                       value="${esc(p.plenumCm || 20)}" placeholder="Plénum cm" title="Hauteur de plénum en cm" ${suspOn ? '' : 'disabled'} />
              ` : '')}
            </div>
          </div>

          <!-- Isolant plafond -->
          <div class="comp-row ${iOn ? '' : 'disabled'}">
            <div class="comp-row-head">
              <label class="comp-check">
                <input type="checkbox" data-p="${esc(p.id)}" data-ins-toggle="1" ${iOn ? 'checked' : ''} />
                <span>Isolant</span>
              </label>
            </div>
            <div class="comp-controls">
              <select class="comp-select" data-p="${esc(p.id)}" data-ins-field="material" ${iOn ? '' : 'disabled'}>
                ${insulationMaterialOptionsHtml(p.insulation && p.insulation.material)}
              </select>
              <select class="comp-select mono" style="max-width:105px;" data-p="${esc(p.id)}" data-ins-field="thicknessMm" ${iOn ? '' : 'disabled'}>
                ${thicknessOptionsHtml([100, 120, 145, 200], (p.insulation && p.insulation.thicknessMm) || 200)}
              </select>
            </div>
          </div>

          <!-- Parement plafond -->
          <div class="comp-row ${faOn ? '' : 'disabled'}">
            <div class="comp-row-head">
              <label class="comp-check">
                <input type="checkbox" data-p="${esc(p.id)}" data-comp="faceA" ${faOn ? 'checked' : ''} />
                <span>Parement</span>
              </label>
            </div>
            <div class="comp-controls">
              <select class="comp-select" data-p="${esc(p.id)}" data-face="faceA" data-ff="skins" ${faOn ? '' : 'disabled'}>
                <option value="1" ${Number(fa.skins) === 1 ? 'selected' : ''}>Simple peau</option>
                <option value="2" ${Number(fa.skins) === 2 ? 'selected' : ''}>Double peau</option>
              </select>
              <select class="comp-select" data-p="${esc(p.id)}" data-face="faceA" data-ff="plateType" ${faOn ? '' : 'disabled'}>
                ${plateTypeOptionsHtml(fa.plateType)}
              </select>
              <select class="comp-select mono" style="max-width:95px;" data-p="${esc(p.id)}" data-face="faceA" data-ff="plateHeight" ${faOn ? '' : 'disabled'}>
                ${plateHeightOptionsHtml(fa.plateHeight)}
              </select>
            </div>
          </div>
        </div>
        ${renderCeilingAssignmentBox(p, proj, calc)}
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
              </div>
              <button type="button" class="btn btn-sm" id="btn-apply-h-all" title="Appliquer cette hauteur à tous les murs existants">Appliquer à tous les murs</button>
            </div>
          </div>
        </section>

        <!-- PARAMÈTRES TECHNIQUES EN 3 COLONNES DIRECTES (SANS MODALE) -->
        <section class="stack" style="gap:10px;">
          <div class="row-between">
            <div>
              <h2 style="margin:0;font-size:15px;font-weight:800;color:var(--text-main);">
                📐 Paramètres techniques &amp; Gabarits d'ouvrages (DTU 25.41)
              </h2>
              <div style="font-size:12px;color:var(--text-sub);">
                Cochez/décochez chaque composant, ajustez les menus déroulants directement et cochez les murs affectés en bas de colonne.
              </div>
            </div>
            <button type="button" class="btn btn-sm btn-primary" id="btn-go-sketch-top">Passer au Croquis (Onglet 2) →</button>
          </div>

          <div class="config-columns-3">
            ${renderColCloison(cloisons, proj)}
            ${renderColDoublage(doublages, proj)}
            ${renderColPlafond(plafonds, proj, calc)}
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

  function mutateProfile(profileId, mutator) {
    const proj = Store.getActiveProject();
    const target = (proj.profiles || []).find((p) => p.id === profileId);
    if (!target) return;
    const copy = Store.deepClone(target);
    mutator(copy);
    Store.upsertProfile(copy);
  }

  function bindEvents(container, proj, appApi) {
    // --- Gestion du chantier ---
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
        activeVariantByCat.cloison = null;
        activeVariantByCat.doublage = null;
        activeVariantByCat.plafond = null;
        appApi.toast(`Chantier "${opened.clientName}" ouvert`);
      }
    });

    container.querySelector('#btn-tab1-import').addEventListener('click', () => {
      document.getElementById('global-import-json')?.click();
    });

    container.querySelector('#btn-new-blank').addEventListener('click', () => {
      if (appApi.requestBlankProject()) {
        activeVariantByCat.cloison = null;
        activeVariantByCat.doublage = null;
        activeVariantByCat.plafond = null;
      }
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
      const p = Store.getActiveProject();
      const h = Number(p.defaultHeightCm) || 250;
      if (!p.walls.length) {
        appApi.toast('Aucun mur tracé pour le moment');
        return;
      }
      const next = p.walls.map((w) => Object.assign({}, w, { hLeftCm: h, hRightCm: h }));
      Store.replaceAllWalls(next);
      appApi.toast(`Hauteur ${h} cm appliquée à ${next.length} mur(s)`);
    });

    // --- Variantes dans les 3 colonnes ---
    container.querySelectorAll('.btn-add-variant').forEach((btn) => {
      btn.addEventListener('click', () => {
        const cat = btn.dataset.cat;
        const curList = Store.getActiveProject().profiles.filter((p) => p.category === cat);
        const created = C.createBlankVariant(cat, curList.length);
        activeVariantByCat[cat] = created.id;
        Store.upsertProfile(created);
        appApi.toast(`Nouvelle variante ajoutée : ${created.name}`);
      });
    });

    container.querySelectorAll('[data-select-variant]').forEach((btn) => {
      btn.addEventListener('click', () => {
        activeVariantByCat[btn.dataset.cat] = btn.dataset.selectVariant;
        appApi.rerender();
      });
    });

    container.querySelectorAll('.inp-variant-name').forEach((inp) => {
      inp.addEventListener('change', () => {
        mutateProfile(inp.dataset.prof, (p) => {
          p.name = inp.value.trim() || p.name;
        });
      });
    });

    container.querySelectorAll('.btn-del-variant').forEach((btn) => {
      btn.addEventListener('click', () => {
        const cat = btn.dataset.cat;
        if (Store.deleteProfile(btn.dataset.prof)) {
          activeVariantByCat[cat] = null;
          appApi.toast('Variante supprimée');
        } else {
          appApi.toast('Conservez au moins une variante par colonne.');
        }
      });
    });

    // --- Toggle système Doublage (Optima vs Ossature indépendante) ---
    container.querySelectorAll('[data-set-doublage]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const sys = btn.dataset.setDoublage;
        mutateProfile(btn.dataset.p, (p) => {
          p.doublageSystem = sys;
          if (sys === 'optima' && p.insulation) {
            p.optimaRange = C.suggestOptimaRange(p.insulation.thicknessMm);
          }
        });
      });
    });

    // --- Cases à cocher composants (Rails, Montants, F530, Lisses, Appuis, Face A, Face B, Bande résiliente, CR2, Suspentes) ---
    container.querySelectorAll('input[data-comp]').forEach((chk) => {
      chk.addEventListener('change', () => {
        const key = chk.dataset.comp;
        mutateProfile(chk.dataset.p, (p) => {
          const c = ensureComponents(p);
          c[key] = chk.checked;
        });
      });
    });

    // --- Champs directs du profil (section R/M synchronisée, entraxe, montantType, optimaRange, periphType, suspenteType, integraLength, plenumCm) ---
    container.querySelectorAll('[data-field]').forEach((el) => {
      el.addEventListener('change', () => {
        const field = el.dataset.field;
        const val = (field === 'entraxeCm' || field === 'plenumCm') ? Number(el.value) : el.value;
        mutateProfile(el.dataset.p, (p) => {
          p[field] = val;
        });
      });
    });

    // --- Isolant (case à cocher + nature + épaisseur avec auto-adaptation Optima 2 / Integra 2) ---
    container.querySelectorAll('input[data-ins-toggle]').forEach((chk) => {
      chk.addEventListener('change', () => {
        mutateProfile(chk.dataset.p, (p) => {
          if (!p.insulation) p.insulation = { enabled: chk.checked, material: 'laine_coton', thicknessMm: 80 };
          p.insulation.enabled = chk.checked;
        });
      });
    });

    container.querySelectorAll('[data-ins-field]').forEach((el) => {
      el.addEventListener('change', () => {
        const field = el.dataset.insField;
        mutateProfile(el.dataset.p, (p) => {
          if (!p.insulation) p.insulation = { enabled: true, material: 'laine_coton', thicknessMm: 80 };
          p.insulation[field] = field === 'thicknessMm' ? Number(el.value) : el.value;
          if (field === 'thicknessMm') {
            if (p.category === 'doublage' && (p.doublageSystem || 'optima') === 'optima') {
              p.optimaRange = C.suggestOptimaRange(p.insulation.thicknessMm);
            } else if (p.category === 'plafond' && (p.suspenteType || 'integra2') === 'integra2') {
              p.integraLength = C.suggestIntegraLength(p.insulation.thicknessMm);
            }
          }
        });
      });
    });

    // --- Parements Face A / Face B ---
    container.querySelectorAll('[data-face]').forEach((el) => {
      el.addEventListener('change', () => {
        const faceKey = el.dataset.face;
        const ff = el.dataset.ff;
        mutateProfile(el.dataset.p, (p) => {
          if (!p[faceKey]) p[faceKey] = { skins: 1, plateType: 'std', plateHeight: 'auto' };
          p[faceKey][ff] = ff === 'skins' ? Number(el.value) : el.value;
        });
      });
    });

    // --- Affectation directe exclusive des murs du plan ---
    container.querySelectorAll('.chk-assign-wall').forEach((chk) => {
      chk.addEventListener('change', () => {
        const wallId = chk.dataset.wall;
        const profId = chk.dataset.prof;
        // Un mur ne peut appartenir qu'à un seul gabarit : cocher ici le retire automatiquement des autres
        Store.updateWall(wallId, { profileId: chk.checked ? profId : null });
      });
    });

    // --- Affectation directe du faux plafond ---
    container.querySelectorAll('.chk-assign-ceiling').forEach((chk) => {
      chk.addEventListener('change', () => {
        const profId = chk.dataset.prof;
        if (chk.checked) {
          Store.updateCeiling({ enabled: true, profileId: profId });
        } else {
          Store.updateCeiling({ enabled: false });
        }
      });
    });

    container.querySelector('#t1-ceil-auto')?.addEventListener('change', (e) => {
      Store.updateCeiling({ autoFromPlan: e.target.checked });
    });
    container.querySelector('#t1-ceil-len')?.addEventListener('change', (e) => {
      Store.updateCeiling({ customLengthCm: Math.max(50, Number(e.target.value) || 0), autoFromPlan: false });
    });
    container.querySelector('#t1-ceil-wid')?.addEventListener('change', (e) => {
      Store.updateCeiling({ customWidthCm: Math.max(50, Number(e.target.value) || 0), autoFromPlan: false });
    });

    // --- Préférences consommables & Sync ---
    container.querySelectorAll('#seg-enduit button').forEach((btn) => {
      btn.addEventListener('click', () => Store.updateConsumablePrefs({ enduitUnit: btn.dataset.val }));
    });
    container.querySelectorAll('#seg-ttpc button').forEach((btn) => {
      btn.addEventListener('click', () => Store.updateConsumablePrefs({ ttpcBoxSize: Number(btn.dataset.val) }));
    });
    container.querySelectorAll('#seg-margin button').forEach((btn) => {
      btn.addEventListener('click', () => Store.updateConsumablePrefs({ safetyMarginPct: Number(btn.dataset.val) }));
    });

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

    const goSketch = () => Store.setActiveTab('tab2');
    container.querySelector('#btn-go-sketch')?.addEventListener('click', goSketch);
    container.querySelector('#btn-go-sketch-top')?.addEventListener('click', goSketch);
  }

  global.PlacoTab1 = { render };
})(window);
