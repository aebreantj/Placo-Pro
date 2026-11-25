/* ============================================================================
 * PLACO PRO — Onglet 3 : Calepinage Visuel Réel & Détails Techniques DTU 25.41
 * ============================================================================ */
(function (global) {
  'use strict';

  const C = global.PlacoConstants;
  const Store = global.PlacoStore;

  const ui = {
    selectedTarget: null, // wallId | 'ceiling'
    selectedFaceIdx: 0,
    showFramingOverlay: true
  };

  function esc(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /**
   * Génère le schéma SVG de calepinage réel pour une face/peau d'un mur.
   */
  function buildWallCalepinageSvg(wr, faceSim, showFraming) {
    const wall = wr.wall;
    const L = Math.max(40, Number(wall.lengthCm) || 300);
    const hL = Math.max(40, Number(wall.hLeftCm) || 250);
    const hR = Math.max(40, Number(wall.hRightCm) || hL);
    const maxH = Math.max(hL, hR);

    const padX = 64;
    const padTop = 44;
    const padBot = 58;
    const vbW = L + padX * 2;
    const vbH = maxH + padTop + padBot;
    const toY = (y) => padTop + (maxH - y);

    const pt = C.PLATE_TYPES[faceSim.plateType] || C.PLATE_TYPES.std;
    const wallClipId = `wall-clip-${wall.id.replace(/[^a-zA-Z0-9]/g, '')}`;
    const hatchId = `waste-hatch-${wall.id.replace(/[^a-zA-Z0-9]/g, '')}`;

    const wallPolyPoints = `${padX},${toY(0)} ${padX + L},${toY(0)} ${padX + L},${toY(hR)} ${padX},${toY(hL)}`;

    let platesSvg = '';
    let plateSeq = 0;

    (faceSim.pieces || []).forEach((pc) => {
      const px = padX + pc.x0;
      const pw = pc.x1 - pc.x0;
      const pyTopLeft = toY(pc.y0 + pc.hLeft);
      const pyTopRight = toY(pc.y0 + pc.hRight);
      const pyBot = toY(pc.y0);
      const piecePoly = `${px},${pyBot} ${px + pw},${pyBot} ${px + pw},${pyTopRight} ${px},${pyTopLeft}`;

      if (pc.cutType === 'void') {
        platesSvg += `<polygon points="${piecePoly}" fill="rgba(15,23,42,0.75)" stroke="#334155" stroke-width="1" stroke-dasharray="4 4" />`;
        return;
      }

      if (pc.newPlateUsed) plateSeq++;

      let fill = pt.fill;
      let stroke = pt.stroke;
      if (pc.fromOffcut) {
        fill = 'rgba(34, 197, 94, 0.28)';
        stroke = '#4ADE80';
      } else if (pc.cutType === 'cut-L' || pc.cutType === 'cut-U') {
        fill = 'rgba(245, 197, 24, 0.22)';
        stroke = '#F5C518';
      }

      platesSvg += `
        <polygon points="${piecePoly}" fill="${fill}" stroke="${stroke}" stroke-width="2" />
      `;

      // Zone d'ouverture découpée dans la plaque (hachurée rouge/ardoise)
      (pc.cutouts || []).forEach((ct) => {
        const cx = padX + ct.x0;
        const cw = ct.x1 - ct.x0;
        const cy = toY(ct.y1);
        const ch = ct.y1 - ct.y0;
        platesSvg += `
          <rect x="${cx}" y="${cy}" width="${cw}" height="${ch}" fill="url(#${hatchId})" stroke="#F43F5E" stroke-width="1.5" stroke-dasharray="4 3" />
        `;
      });

      // Étiquette de la plaque (centrée dans une zone libre en haut ou au milieu)
      const cx = px + pw / 2;
      const midH = pc.y0 + Math.min(pc.hLeft, pc.hRight) * 0.5;
      let labelY = toY(midH);
      // Si une ouverture occupe le milieu, remonter le label vers le haut de la plaque
      if (pc.cutouts && pc.cutouts.length) {
        labelY = toY(pc.y0 + Math.max(pc.hLeft, pc.hRight) - 22);
      }

      const tag = pc.fromOffcut
        ? '♻ Chute'
        : (pc.cutType === 'cut-U' ? `P${plateSeq} (U)` : (pc.cutType === 'cut-L' ? `P${plateSeq} (L)` : `P${plateSeq}`));

      if (pw >= 28) {
        platesSvg += `
          <g pointer-events="none">
            <rect x="${cx - 32}" y="${labelY - 12}" width="64" height="24" rx="4" fill="rgba(11,17,26,0.85)" stroke="${stroke}" stroke-width="1" />
            <text x="${cx}" y="${labelY - 1}" text-anchor="middle" fill="#F8FAFC" font-size="10.5" font-weight="800" font-family="JetBrains Mono, Consolas, monospace">${esc(tag)}</text>
            <text x="${cx}" y="${labelY + 10}" text-anchor="middle" fill="#94A3B8" font-size="9" font-family="JetBrains Mono, Consolas, monospace">${Math.round(pc.colW)} cm</text>
          </g>
        `;
      }
    });

    // Superposition de l'ossature métallique (Rails, Montants ou Fourrures F530 + Appuis Optima + Renforts ouvertures)
    let framingSvg = '';
    if (showFraming && wr.framing) {
      const fr = wr.framing;
      // Rail haut & rail bas (en pointillé bleu/jaune)
      framingSvg += `<line x1="${padX}" y1="${toY(hL)}" x2="${padX + L}" y2="${toY(hR)}" stroke="#38BDF8" stroke-width="3" opacity="0.85" />`;
      framingSvg += `<line x1="${padX}" y1="${toY(0)}" x2="${padX + L}" y2="${toY(0)}" stroke="#38BDF8" stroke-width="3" opacity="0.85" />`;

      (fr.studPositions || []).forEach((st) => {
        const sx = padX + st.x;
        const yStart = toY(st.y0 || 0);
        const yEnd = toY((st.y0 || 0) + st.h);
        const isReinforced = st.type === 'opening-doubled' || st.type === 'jamb';
        const isDouble = st.type === 'double';
        const col = isReinforced ? '#F5C518' : (isDouble ? '#A78BFA' : '#38BDF8');
        const sw = isReinforced ? 4 : (isDouble ? 3.5 : 2);
        framingSvg += `<line x1="${sx}" y1="${yStart}" x2="${sx}" y2="${yEnd}" stroke="${col}" stroke-width="${sw}" stroke-dasharray="${isReinforced ? '' : '6 4'}" opacity="0.9" />`;
        if (fr.system === 'optima' && (st.type === 'standard' || st.type === 'jamb')) {
          const count = st.h > 260 ? 2 : 1;
          for (let k = 1; k <= count; k++) {
            const ay = toY((st.h * k) / (count + 1));
            framingSvg += `<circle cx="${sx}" cy="${ay}" r="4.5" fill="#F5C518" stroke="#0B111A" stroke-width="1.2" />`;
          }
        }
      });
    }

    // Cadres des ouvertures (linteaux + allèges en rail plié)
    let openingsSvg = '';
    (wall.openings || []).forEach((op) => {
      const ox = padX + (Number(op.distFromLeftCm) || 0);
      const ow = Number(op.widthCm) || 83;
      const oh = Number(op.heightCm) || 204;
      const os = Number(op.sillHeightCm) || 0;
      const oyTop = toY(os + oh);
      openingsSvg += `
        <g>
          <rect x="${ox}" y="${oyTop}" width="${ow}" height="${oh}" fill="rgba(11,17,26,0.72)" stroke="#F43F5E" stroke-width="2.2" />
          ${showFraming ? `<line x1="${ox - 12}" y1="${oyTop - 2}" x2="${ox + ow + 12}" y2="${oyTop - 2}" stroke="#F5C518" stroke-width="3.5" />` : ''}
          ${showFraming && os > 0 ? `<line x1="${ox - 12}" y1="${toY(os) + 2}" x2="${ox + ow + 12}" y2="${toY(os) + 2}" stroke="#F5C518" stroke-width="3.5" />` : ''}
          <text x="${ox + ow / 2}" y="${oyTop + oh / 2 - 4}" text-anchor="middle" fill="#FDA4AF" font-size="11.5" font-weight="800">${esc(op.label || op.type)}</text>
          <text x="${ox + ow / 2}" y="${oyTop + oh / 2 + 12}" text-anchor="middle" fill="#F8FAFC" font-size="10.5" font-family="JetBrains Mono, Consolas, monospace">${ow} × ${oh} cm</text>
        </g>
      `;
    });

    return `
      <svg viewBox="0 0 ${vbW} ${vbH}" style="width:100%;max-height:430px;display:block;" preserveAspectRatio="xMidYMid meet">
        <defs>
          <clipPath id="${wallClipId}">
            <polygon points="${wallPolyPoints}" />
          </clipPath>
          <pattern id="${hatchId}" width="10" height="10" patternTransform="rotate(45 0 0)" patternUnits="userSpaceOnUse">
            <rect width="10" height="10" fill="rgba(11,17,26,0.75)" />
            <line x1="0" y1="0" x2="0" y2="10" stroke="rgba(244,63,94,0.45)" stroke-width="2" />
          </pattern>
        </defs>

        <!-- Ligne sol -->
        <line x1="${padX - 24}" y1="${toY(0)}" x2="${padX + L + 24}" y2="${toY(0)}" stroke="#475569" stroke-width="2.5" />

        <!-- Plaques & Ossature clipsés dans le mur -->
        <g clip-path="url(#${wallClipId})">
          ${platesSvg}
          ${framingSvg}
        </g>

        <!-- Contour mur -->
        <polygon points="${wallPolyPoints}" fill="none" stroke="#94A3B8" stroke-width="2" />
        ${openingsSvg}

        <!-- Cotes principales -->
        <line x1="${padX}" y1="${toY(0) + 28}" x2="${padX + L}" y2="${toY(0) + 28}" stroke="#F5C518" stroke-width="1.8" />
        <text x="${padX + L / 2}" y="${toY(0) + 46}" text-anchor="middle" fill="#F5C518" font-size="12" font-weight="800" font-family="JetBrains Mono, Consolas, monospace">
          L = ${Math.round(L)} cm · Plaque ${pt.code} 120 × ${faceSim.plateHeightCm} cm ${faceSim.staggeredStart ? '(Départ ½ plaque 60 cm)' : '(Départ plaque entière 120 cm)'}
        </text>
        <text x="${padX - 10}" y="${toY(hL / 2)}" text-anchor="end" fill="#38BDF8" font-size="11" font-weight="700" font-family="JetBrains Mono, Consolas, monospace">${Math.round(hL)}</text>
        <text x="${padX + L + 10}" y="${toY(hR / 2)}" text-anchor="start" fill="#38BDF8" font-size="11" font-weight="700" font-family="JetBrains Mono, Consolas, monospace">${Math.round(hR)}</text>
      </svg>
    `;
  }

  /**
   * Génère le schéma SVG de calepinage du Faux Plafond (F530, CR2, Suspentes, Plaques quinconce).
   */
  function buildCeilingCalepinageSvg(cr) {
    const L = Math.max(80, cr.lengthCm);
    const W = Math.max(80, cr.widthCm);
    const pad = 55;
    const vbW = L + pad * 2;
    const vbH = W + pad * 2;
    const pt = C.PLATE_TYPES[cr.plateType] || C.PLATE_TYPES.std;

    let tilesSvg = '';
    (cr.boardTiles || []).forEach((t, idx) => {
      tilesSvg += `
        <rect x="${pad + t.x0}" y="${pad + t.y0}" width="${t.x1 - t.x0}" height="${t.y1 - t.y0}"
              fill="${pt.fill}" stroke="${pt.stroke}" stroke-width="1.6" />
        <text x="${pad + (t.x0 + t.x1) / 2}" y="${pad + (t.y0 + t.y1) / 2 + 4}" text-anchor="middle"
              fill="#CBD5E1" font-size="11" font-family="JetBrains Mono, Consolas, monospace">P${idx + 1}</text>
      `;
    });

    let furringsSvg = '';
    (cr.furringYPositions || []).forEach((fy) => {
      furringsSvg += `<line x1="${pad}" y1="${pad + fy}" x2="${pad + L}" y2="${pad + fy}" stroke="#38BDF8" stroke-width="2.5" stroke-dasharray="8 4" />`;
      (cr.suspenteXPositions || []).forEach((sx) => {
        furringsSvg += `<circle cx="${pad + sx}" cy="${pad + fy}" r="4.5" fill="#F5C518" stroke="#0B111A" stroke-width="1.2" />`;
      });
    });

    return `
      <svg viewBox="0 0 ${vbW} ${vbH}" style="width:100%;max-height:420px;display:block;" preserveAspectRatio="xMidYMid meet">
        ${tilesSvg}
        ${furringsSvg}
        <!-- Cornière CR2 périphérique -->
        <rect x="${pad}" y="${pad}" width="${L}" height="${W}" fill="none" stroke="#F5C518" stroke-width="3.5" />
        <text x="${pad + L / 2}" y="${pad - 16}" text-anchor="middle" fill="#F5C518" font-size="13" font-weight="800" font-family="JetBrains Mono, Consolas, monospace">
          Faux Plafond ${Math.round(L)} × ${Math.round(W)} cm (${cr.areaM2} m²) · F530 entraxe ${cr.entraxeCm} cm · ${cr.suspentesCount} suspentes (~${cr.suspentesPerM2}/m²)
        </text>
      </svg>
    `;
  }

  function render(container, state, calc, appApi) {
    const s = calc.summary;
    const wallResults = calc.wallResults || [];
    const ceilRes = calc.ceilingResult;

    // Cible sélectionnée valide
    if (ui.selectedTarget !== 'ceiling') {
      const exists = wallResults.some((wr) => wr.wall.id === ui.selectedTarget);
      if (!exists) {
        ui.selectedTarget = wallResults.length ? wallResults[0].wall.id : (ceilRes ? 'ceiling' : null);
        ui.selectedFaceIdx = 0;
      }
    } else if (!ceilRes) {
      ui.selectedTarget = wallResults.length ? wallResults[0].wall.id : null;
      ui.selectedFaceIdx = 0;
    }

    const activeWallRes = ui.selectedTarget && ui.selectedTarget !== 'ceiling'
      ? wallResults.find((wr) => wr.wall.id === ui.selectedTarget)
      : null;

    if (activeWallRes && ui.selectedFaceIdx >= activeWallRes.faceCalepinages.length) {
      ui.selectedFaceIdx = 0;
    }
    const activeFace = activeWallRes ? activeWallRes.faceCalepinages[ui.selectedFaceIdx] : null;

    container.innerHTML = `
      <div class="stack">
        <!-- KPI GLOBAUX -->
        <div class="kpi-grid">
          <div class="kpi-card">
            <span class="kpi-label">Plaques à commander</span>
            <span class="kpi-value">${s.totalPlatesCount}</span>
            <span class="kpi-sub">Calepinage réel 120 cm (L/U inclus)</span>
          </div>
          <div class="kpi-card">
            <span class="kpi-label">Surface nette posée</span>
            <span class="kpi-value blue">${s.totalNetSurfaceM2} m²</span>
            <span class="kpi-sub">Commandé brut : ${s.totalOrderedPlateAreaM2} m²</span>
          </div>
          <div class="kpi-card">
            <span class="kpi-label">Taux de chute réel</span>
            <span class="kpi-value">${s.globalWastePct} %</span>
            <span class="kpi-sub">Simulation chantier exacte</span>
          </div>
          <div class="kpi-card">
            <span class="kpi-label">Chutes réutilisées (&gt;40 cm)</span>
            <span class="kpi-value green">${s.totalReusedOffcuts}</span>
            <span class="kpi-sub">Panneaux économisés</span>
          </div>
          <div class="kpi-card">
            <span class="kpi-label">Bandes &amp; Enduit 3 passes</span>
            <span class="kpi-value white">${Math.round(s.bandePapierMlTotal + s.bandeArmeeMlTotal)} ml</span>
            <span class="kpi-sub">Enduit estimé : ${s.enduitKg} kg</span>
          </div>
        </div>

        <!-- ALERTES DTU 25.41 -->
        ${(calc.dtuAlerts || []).length ? `
          <div class="stack" style="gap:8px;">
            ${calc.dtuAlerts.map((al) => `
              <div class="tip-box warn">
                <span>⚠️</span>
                <div><strong>Contrôle DTU 25.41 :</strong> ${esc(al.message)}</div>
              </div>
            `).join('')}
          </div>
        ` : ''}

        <!-- SCHÉMA VISUEL DE CALEPINAGE -->
        <section class="card">
          <div class="card-header">
            <h2 class="card-title">📐 Schéma de calepinage réel par mur &amp; plafond</h2>
            <div class="row">
              <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--text-sub);cursor:pointer;">
                <input type="checkbox" id="chk-show-framing" ${ui.showFramingOverlay ? 'checked' : ''} style="accent-color:var(--blue);" />
                <span>Afficher l'ossature &amp; renforts</span>
              </label>
              <button type="button" class="btn btn-sm btn-primary" id="btn-go-order">Liste de commande →</button>
            </div>
          </div>

          <div class="card-body stack">
            <!-- Sélecteur de mur / plafond -->
            <div class="row" style="gap:6px;">
              ${wallResults.map((wr) => `
                <button type="button" class="btn btn-sm ${ui.selectedTarget === wr.wall.id ? 'btn-primary' : ''}" data-cal-target="${esc(wr.wall.id)}">
                  ${esc(wr.wall.name)} <span style="opacity:0.75;font-family:var(--font-mono);">(${wr.wallPlatesTotal} pl.)</span>
                </button>
              `).join('')}
              ${ceilRes ? `
                <button type="button" class="btn btn-sm ${ui.selectedTarget === 'ceiling' ? 'btn-blue' : ''}" data-cal-target="ceiling" style="${ui.selectedTarget === 'ceiling' ? 'background:var(--blue-strong);color:#fff;' : ''}">
                  ⬜ Faux Plafond (${ceilRes.totalPlates} pl.)
                </button>
              ` : ''}
            </div>

            ${activeWallRes && activeFace ? `
              <!-- Sélecteur Face A / Face B & Peau 1 / Peau 2 -->
              <div class="row-between">
                <div class="segmented">
                  ${activeWallRes.faceCalepinages.map((fc, idx) => `
                    <button type="button" data-face-idx="${idx}" class="${ui.selectedFaceIdx === idx ? 'active' : ''}">
                      ${esc(fc.faceLabel)} · Peau ${fc.skinIndex} (${fc.newPlatesCount} pl.)
                    </button>
                  `).join('')}
                </div>
                <div class="row" style="gap:8px;">
                  <span class="badge badge-blue">Surface nette : ${activeFace.netAreaM2} m²</span>
                  <span class="badge badge-yellow">Chute réelle : ${activeFace.wastePct} %</span>
                  ${activeFace.reusedOffcutsCount > 0 ? `<span class="badge badge-green">♻ ${activeFace.reusedOffcutsCount} chute(s) réutilisée(s)</span>` : ''}
                </div>
              </div>

              <div class="calepinage-svg-box">
                ${buildWallCalepinageSvg(activeWallRes, activeFace, ui.showFramingOverlay)}
              </div>

              <div class="legend-row">
                <span class="legend-item"><span class="legend-box" style="background:${(C.PLATE_TYPES[activeFace.plateType] || C.PLATE_TYPES.std).fill};border-color:${(C.PLATE_TYPES[activeFace.plateType] || C.PLATE_TYPES.std).stroke};"></span>Plaque entière / standard</span>
                <span class="legend-item"><span class="legend-box" style="background:rgba(245,197,24,0.28);border-color:#F5C518;"></span>Découpe L / U autour d'ouverture (plaque entière commandée)</span>
                <span class="legend-item"><span class="legend-box" style="background:rgba(34,197,94,0.28);border-color:#4ADE80;"></span>Panneau issu d'une chute exploitable (&gt; 40 cm)</span>
                <span class="legend-item"><span class="legend-box" style="background:#38BDF8;"></span>Montants / F530 courants</span>
                <span class="legend-item"><span class="legend-box" style="background:#F5C518;"></span>Renforts doublés ouvertures + linteaux/appuis Optima</span>
              </div>

              <!-- Détail ossature du mur sélectionné -->
              <div class="grid-3" style="gap:10px;">
                <div style="background:var(--bg-surface);border:1px solid var(--border);border-radius:8px;padding:11px;">
                  <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;font-weight:700;">Ossature de ce mur</div>
                  <div style="margin-top:6px;font-family:var(--font-mono);font-size:12.5px;">
                    ${activeWallRes.framing.system === 'optima' ? `
                      <div>Fourrures F530 : <strong>${activeWallRes.framing.f530Bars} barres</strong> (${activeWallRes.framing.f530Ml} ml)</div>
                      <div>Lisses Clip : <strong>${activeWallRes.framing.lisseBars} barres</strong> (${activeWallRes.framing.lisseMl} ml)</div>
                      <div>Appuis Optima 2 (${activeWallRes.framing.optimaRange}) : <strong>${activeWallRes.framing.appuisCount} u.</strong></div>
                    ` : `
                      <div>Rails ${activeWallRes.framing.section.replace('M', 'R')} : <strong>${activeWallRes.framing.railBars} barres</strong> (${activeWallRes.framing.railMl} ml)</div>
                      <div>Montants ${activeWallRes.framing.section} : <strong>${activeWallRes.framing.montantBars} barres</strong> (${activeWallRes.framing.montantMl} ml)</div>
                      <div>Entraxe ${activeWallRes.framing.entraxeCm} cm · ${(activeWallRes.wall.openings || []).length} renfort(s) doublé(s)</div>
                    `}
                  </div>
                </div>
                <div style="background:var(--bg-surface);border:1px solid var(--border);border-radius:8px;padding:11px;">
                  <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;font-weight:700;">Joints &amp; Isolation mur</div>
                  <div style="margin-top:6px;font-family:var(--font-mono);font-size:12.5px;">
                    <div>Bandes papier : <strong>${activeWallRes.wallJointsPapierMl} ml</strong></div>
                    <div>Bandes armées : <strong>${activeWallRes.wallBandeArmeeMl} ml</strong></div>
                    <div>Isolant net (hors ouv.) : <strong>${activeWallRes.profile.insulation?.enabled ? `${activeWallRes.netWallAreaM2} m²` : 'Sans'}</strong></div>
                  </div>
                </div>
                <div style="background:var(--bg-surface);border:1px solid var(--border);border-radius:8px;padding:11px;">
                  <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;font-weight:700;">Visserie &amp; Fixations mur</div>
                  <div style="margin-top:6px;font-family:var(--font-mono);font-size:12.5px;">
                    <div>Vis TRPF 13 : <strong>~${activeWallRes.framing.trpfCount} vis</strong></div>
                    <div>Chevilles à frapper : <strong>~${activeWallRes.framing.chevillesCount} u.</strong></div>
                    <div>Bande résiliente : <strong>${activeWallRes.framing.resilientTapeMl} ml</strong></div>
                  </div>
                </div>
              </div>
            ` : (ui.selectedTarget === 'ceiling' && ceilRes ? `
              <div class="calepinage-svg-box">
                ${buildCeilingCalepinageSvg(ceilRes)}
              </div>
              <div class="grid-3" style="gap:10px;">
                <div style="background:var(--bg-surface);border:1px solid var(--border);border-radius:8px;padding:11px;font-family:var(--font-mono);font-size:12.5px;">
                  <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;font-weight:700;margin-bottom:5px;">Ossature F530 &amp; Périphérie</div>
                  <div>F530 (entraxe ${ceilRes.entraxeCm} cm) : <strong>${ceilRes.f530Bars} barres</strong> (${ceilRes.f530Ml} ml)</div>
                  <div>${ceilRes.periphType} périphérique : <strong>${ceilRes.periphBars} barres</strong> (${ceilRes.periphMl} ml)</div>
                  <div>Éclisses F530 : <strong>${ceilRes.eclissesCount} u.</strong></div>
                </div>
                <div style="background:var(--bg-surface);border:1px solid var(--border);border-radius:8px;padding:11px;font-family:var(--font-mono);font-size:12.5px;">
                  <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;font-weight:700;margin-bottom:5px;">Suspentes (${esc(C.SUSPENTE_TYPES[ceilRes.suspenteType]?.shortLabel || '')})</div>
                  <div>Nombre de suspentes : <strong>${ceilRes.suspentesCount} u.</strong></div>
                  <div>Densité réelle : <strong>${ceilRes.suspentesPerM2} susp./m²</strong></div>
                  ${ceilRes.suspenteType === 'classique_tige' ? `<div>Tiges M6 (plénum ${ceilRes.plenumCm} cm) : <strong>${ceilRes.tigesM6Bars1m} barres 1 m</strong></div>` : ''}
                  ${ceilRes.suspenteType === 'integra2' ? `<div>Longueur Integra 2 : <strong>${ceilRes.integraLength} mm</strong></div>` : ''}
                </div>
                <div style="background:var(--bg-surface);border:1px solid var(--border);border-radius:8px;padding:11px;font-family:var(--font-mono);font-size:12.5px;">
                  <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;font-weight:700;margin-bottom:5px;">Parement &amp; Isolation</div>
                  <div>Plaques ${C.PLATE_TYPES[ceilRes.plateType]?.code} ${ceilRes.plateHeightCm} : <strong>${ceilRes.totalPlates} pl.</strong></div>
                  <div>Chute réelle : <strong>${ceilRes.wastePct} %</strong></div>
                  <div>Isolant plafond : <strong>${ceilRes.insulation ? `${ceilRes.insulation.netAreaM2} m² (${ceilRes.insulation.thicknessMm} mm)` : 'Sans'}</strong></div>
                </div>
              </div>
            ` : '<div style="padding:24px;text-align:center;color:var(--text-muted);">Tracez au moins un mur dans l’onglet 2 pour visualiser le calepinage réel.</div>')}
          </div>
        </section>

        <!-- TABLEAU RÉCAPITULATIF PAR MUR -->
        <section class="card">
          <div class="card-header">
            <h2 class="card-title">📊 Récapitulatif détaillé par ouvrage</h2>
          </div>
          <div class="table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Mur / Ouvrage</th>
                  <th>Dimensions</th>
                  <th>Profil DTU 25.41</th>
                  <th>Ouvertures déduites</th>
                  <th>Surf. nette</th>
                  <th>Plaques</th>
                  <th>Chute réelle</th>
                  <th>Ossature</th>
                </tr>
              </thead>
              <tbody>
                ${wallResults.map((wr) => `
                  <tr>
                    <td><strong>${esc(wr.wall.name)}</strong></td>
                    <td style="font-family:var(--font-mono);">${Math.round(wr.wall.lengthCm)} × ${Math.round(wr.wall.hLeftCm)}${Math.abs(wr.wall.hLeftCm - wr.wall.hRightCm) > 1 ? `→${Math.round(wr.wall.hRightCm)}` : ''} cm</td>
                    <td><span style="font-size:12px;">${esc(wr.profile.name)}</span></td>
                    <td style="font-family:var(--font-mono);">${(wr.wall.openings || []).length} (${wr.openingsAreaM2} m²)</td>
                    <td style="font-family:var(--font-mono);color:var(--blue);">${wr.wallNetFacesAreaM2} m²</td>
                    <td style="font-family:var(--font-mono);font-weight:800;color:var(--yellow);">${wr.wallPlatesTotal} pl.</td>
                    <td style="font-family:var(--font-mono);">${wr.wallWastePct} %</td>
                    <td style="font-size:12px;font-family:var(--font-mono);">
                      ${wr.framing.system === 'optima'
                        ? `F530: ${wr.framing.f530Bars}b · Appuis: ${wr.framing.appuisCount}`
                        : `R: ${wr.framing.railBars}b · M: ${wr.framing.montantBars}b`}
                    </td>
                  </tr>
                `).join('')}
                ${ceilRes ? `
                  <tr>
                    <td><strong>Faux Plafond</strong></td>
                    <td style="font-family:var(--font-mono);">${Math.round(ceilRes.lengthCm)} × ${Math.round(ceilRes.widthCm)} cm</td>
                    <td><span style="font-size:12px;">${esc(ceilRes.profile.name)}</span></td>
                    <td style="font-family:var(--font-mono);">—</td>
                    <td style="font-family:var(--font-mono);color:var(--blue);">${ceilRes.areaM2} m²</td>
                    <td style="font-family:var(--font-mono);font-weight:800;color:var(--yellow);">${ceilRes.totalPlates} pl.</td>
                    <td style="font-family:var(--font-mono);">${ceilRes.wastePct} %</td>
                    <td style="font-size:12px;font-family:var(--font-mono);">F530: ${ceilRes.f530Bars}b · Susp.: ${ceilRes.suspentesCount}</td>
                  </tr>
                ` : ''}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    `;

    // Events
    container.querySelectorAll('[data-cal-target]').forEach((btn) => {
      btn.addEventListener('click', () => {
        ui.selectedTarget = btn.dataset.calTarget;
        ui.selectedFaceIdx = 0;
        appApi.rerender();
      });
    });

    container.querySelectorAll('[data-face-idx]').forEach((btn) => {
      btn.addEventListener('click', () => {
        ui.selectedFaceIdx = Number(btn.dataset.faceIdx) || 0;
        appApi.rerender();
      });
    });

    container.querySelector('#chk-show-framing')?.addEventListener('change', (e) => {
      ui.showFramingOverlay = e.target.checked;
      appApi.rerender();
    });

    container.querySelector('#btn-go-order')?.addEventListener('click', () => {
      Store.setActiveTab('tab4');
    });
  }

  global.PlacoCalepinage = {
    render,
    buildWallCalepinageSvg,
    buildCeilingCalepinageSvg
  };
})(window);
