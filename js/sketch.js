/* ============================================================================
 * PLACO PRO — Onglet 2 : Croquis Interactif (Mobile & PC) + Ouvertures
 * Modes : Vue en Plan (dessus) + Vue de Face (élévation mur / rampant)
 * Outils : Sélection, Traits Droits Magnétiques (0/45/90°), Main Levée,
 *          Pavé Numérique Immédiat (cm/m), Redressement Intelligent du Croquis
 * ============================================================================ */
(function (global) {
  'use strict';

  const C = global.PlacoConstants;
  const Store = global.PlacoStore;

  // État local de l'éditeur (préservé entre re-renders)
  const ui = {
    viewMode: 'plan',      // 'plan' | 'elevation'
    tool: 'select',        // 'select' | 'straight' | 'freehand' | 'pan' | 'place-opening'
    openingToolType: null, // 'porte' | 'fenetre' | 'porte_fenetre' | 'baie'
    viewBox: { x: -40, y: -40, w: 720, h: 540 },
    isDragging: false,
    dragStartWorld: null,
    dragCurrentWorld: null,
    freehandPoints: [],
    panStartClient: null,
    panStartVB: null,
    snapPoint: null,
    selectedOpeningId: null,
    distAnchor: 'left'     // 'left' | 'right' pour saisie distance ouverture
  };

  function esc(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function dist(a, b) {
    return Math.hypot(b.x - a.x, b.y - a.y);
  }

  function wallProfile(proj, wall) {
    if (!wall || !wall.profileId) return null;
    return (proj.profiles || []).find((p) => p.id === wall.profileId) || null;
  }

  /**
   * Convertit les coordonnées écran (clientX/Y) en coordonnées monde SVG (cm).
   */
  function clientToWorld(svgEl, clientX, clientY) {
    const rect = svgEl.getBoundingClientRect();
    if (!rect.width || !rect.height) return { x: 0, y: 0 };
    const vb = ui.viewBox;
    // preserveAspectRatio="xMidYMid meet"
    const scale = Math.min(rect.width / vb.w, rect.height / vb.h);
    const renderedW = vb.w * scale;
    const renderedH = vb.h * scale;
    const offsetX = (rect.width - renderedW) / 2;
    const offsetY = (rect.height - renderedH) / 2;
    const wx = vb.x + (clientX - rect.left - offsetX) / scale;
    const wy = vb.y + (clientY - rect.top - offsetY) / scale;
    return { x: wx, y: wy };
  }

  /**
   * Aimantation aux extrémités des murs existants + grille 10 cm.
   */
  function snapToPlan(pt, walls, anchorPt, allowAngleSnap) {
    const SNAP_VERTEX = 20;
    let snapped = { x: pt.x, y: pt.y, kind: null };

    // 1. Aimantation aux extrémités des murs existants
    let bestD = SNAP_VERTEX;
    (walls || []).filter((w) => w.mode !== 'elevation').forEach((w) => {
      [{ x: w.x1, y: w.y1 }, { x: w.x2, y: w.y2 }].forEach((v) => {
        const d = dist(pt, v);
        if (d < bestD) {
          bestD = d;
          snapped = { x: v.x, y: v.y, kind: 'vertex' };
        }
      });
    });

    if (snapped.kind === 'vertex') return snapped;

    // 2. Aimantation angulaire 0° / 45° / 90° en mode traits droits
    if (allowAngleSnap && anchorPt) {
      const dx = pt.x - anchorPt.x;
      const dy = pt.y - anchorPt.y;
      const len = Math.hypot(dx, dy);
      if (len > 5) {
        const rawAngle = Math.atan2(dy, dx);
        const step = Math.PI / 4; // 45°
        const nearest = Math.round(rawAngle / step) * step;
        const diffDeg = Math.abs((rawAngle - nearest) * 180 / Math.PI);
        if (diffDeg <= 14) {
          const snappedLen = Math.round(len / 5) * 5;
          return {
            x: Math.round(anchorPt.x + Math.cos(nearest) * snappedLen),
            y: Math.round(anchorPt.y + Math.sin(nearest) * snappedLen),
            kind: 'angle',
            angleDeg: Math.round(((nearest * 180 / Math.PI) + 360) % 360)
          };
        }
      }
    }

    // 3. Grille légère 5 cm
    return {
      x: Math.round(pt.x / 5) * 5,
      y: Math.round(pt.y / 5) * 5,
      kind: 'grid'
    };
  }

  /**
   * Simplification Ramer-Douglas-Peucker pour transformer un tracé main levée en segments propres.
   */
  function rdpSimplify(points, epsilon) {
    if (points.length <= 2) return points;
    const first = points[0];
    const last = points[points.length - 1];
    let maxDist = 0;
    let index = 0;

    const dx = last.x - first.x;
    const dy = last.y - first.y;
    const lenSq = dx * dx + dy * dy;

    for (let i = 1; i < points.length - 1; i++) {
      let d;
      if (lenSq < 1e-6) {
        d = dist(points[i], first);
      } else {
        const t = Math.max(0, Math.min(1, ((points[i].x - first.x) * dx + (points[i].y - first.y) * dy) / lenSq));
        const proj = { x: first.x + t * dx, y: first.y + t * dy };
        d = dist(points[i], proj);
      }
      if (d > maxDist) {
        maxDist = d;
        index = i;
      }
    }

    if (maxDist > epsilon) {
      const left = rdpSimplify(points.slice(0, index + 1), epsilon);
      const right = rdpSimplify(points.slice(index), epsilon);
      return left.slice(0, -1).concat(right);
    }
    return [first, last];
  }

  /**
   * Distance point-segment + position curviligne le long du mur (pour glisser-déposer / cliquer une ouverture).
   */
  function projectPointOnWall(pt, w) {
    const dx = w.x2 - w.x1;
    const dy = w.y2 - w.y1;
    const lenSq = dx * dx + dy * dy;
    if (lenSq < 1) return { dist: Infinity, t: 0 };
    const t = Math.max(0, Math.min(1, ((pt.x - w.x1) * dx + (pt.y - w.y1) * dy) / lenSq));
    const px = w.x1 + t * dx;
    const py = w.y1 + t * dy;
    return { dist: Math.hypot(pt.x - px, pt.y - py), t, px, py };
  }

  /**
   * Redimensionne géométriquement un mur en plan pour respecter exactement sa longueur en cm.
   */
  function resizeWallGeometryToLength(wall, newLenCm) {
    const len = Math.max(20, Math.round(Number(newLenCm) || 100));
    const dx = wall.x2 - wall.x1;
    const dy = wall.y2 - wall.y1;
    const cur = Math.hypot(dx, dy);
    if (cur < 1) {
      return { lengthCm: len, x2: wall.x1 + len, y2: wall.y1 };
    }
    const ux = dx / cur;
    const uy = dy / cur;
    return {
      lengthCm: len,
      x2: Math.round(wall.x1 + ux * len),
      y2: Math.round(wall.y1 + uy * len)
    };
  }

  /**
   * Bouton "Convertir / Redresser le croquis" :
   * Transforme un croquis main levée en plan propre à traits droits (angles 0/45/90°)
   * tout en respectant STRICTEMENT les cotes saisies (lengthCm) et en reconnectant les angles !
   */
  function straightenSketch(appApi) {
    const proj = Store.getActiveProject();
    const planWalls = proj.walls.filter((w) => w.mode !== 'elevation');
    if (!planWalls.length) {
      appApi.toast('Aucun mur en plan à redresser.');
      return;
    }

    const cloned = Store.deepClone(proj.walls);
    const pWalls = cloned.filter((w) => w.mode !== 'elevation');
    const SNAP_TOL = 32;

    // 1. Identifier les grappes de sommets connectés avant redressement
    const clusters = [];
    function findCluster(x, y) {
      for (let i = 0; i < clusters.length; i++) {
        if (Math.hypot(clusters[i].x - x, clusters[i].y - y) <= SNAP_TOL) return i;
      }
      clusters.push({ x, y });
      return clusters.length - 1;
    }

    const wallTopo = pWalls.map((w) => {
      const c1 = findCluster(w.x1, w.y1);
      const c2 = findCluster(w.x2, w.y2);
      const rawAngle = Math.atan2(w.y2 - w.y1, w.x2 - w.x1);
      // Aimantation intelligente : angles proches de 0/90/180/270 (±22°), sinon multiple de 45°
      const deg = ((rawAngle * 180 / Math.PI) + 360) % 360;
      let snappedDeg = Math.round(deg / 45) * 45;
      // Préférer l'orthogonal pur si à moins de 25° d'un axe 0/90/180/270
      const nearest90 = Math.round(deg / 90) * 90;
      if (Math.abs(deg - nearest90) <= 25) snappedDeg = nearest90;
      const snappedRad = (snappedDeg * Math.PI) / 180;
      const exactLen = Math.max(20, Math.round(Number(w.lengthCm) || Math.hypot(w.x2 - w.x1, w.y2 - w.y1)));
      return { w, c1, c2, rad: snappedRad, len: exactLen };
    });

    // 2. Reconstruire les positions des sommets par parcours BFS en respectant les longueurs exactes !
    const placedClusters = new Map();
    const placedWalls = new Set();

    // Construire liste d'adjacence
    const adj = new Map();
    wallTopo.forEach((wt, idx) => {
      if (!adj.has(wt.c1)) adj.set(wt.c1, []);
      if (!adj.has(wt.c2)) adj.set(wt.c2, []);
      adj.get(wt.c1).push({ idx, from: wt.c1, to: wt.c2, dir: 1 });
      adj.get(wt.c2).push({ idx, from: wt.c2, to: wt.c1, dir: -1 });
    });

    wallTopo.forEach((wt, startIdx) => {
      if (placedWalls.has(startIdx)) return;
      if (!placedClusters.has(wt.c1)) {
        placedClusters.set(wt.c1, { x: Math.round(clusters[wt.c1].x / 10) * 10, y: Math.round(clusters[wt.c1].y / 10) * 10 });
      }
      const queue = [wt.c1];
      while (queue.length) {
        const curC = queue.shift();
        const origin = placedClusters.get(curC);
        const links = adj.get(curC) || [];
        links.forEach((lk) => {
          const t = wallTopo[lk.idx];
          if (placedWalls.has(lk.idx)) return;
          const vx = Math.cos(t.rad) * t.len * lk.dir;
          const vy = Math.sin(t.rad) * t.len * lk.dir;
          const targetPt = { x: Math.round(origin.x + vx), y: Math.round(origin.y + vy) };

          if (!placedClusters.has(lk.to)) {
            placedClusters.set(lk.to, targetPt);
            queue.push(lk.to);
          }

          const pStart = placedClusters.get(t.c1) || origin;
          const pEnd = placedClusters.get(t.c2) || targetPt;

          // Si les deux sommets étaient déjà placés (fermeture de boucle), fermer proprement si écart < 25 cm,
          // sinon conserver la longueur exacte saisie depuis pStart
          const loopDist = Math.hypot(pEnd.x - pStart.x, pEnd.y - pStart.y);
          if (Math.abs(loopDist - t.len) <= 25 && loopDist > 10) {
            t.w.x1 = pStart.x;
            t.w.y1 = pStart.y;
            t.w.x2 = pEnd.x;
            t.w.y2 = pEnd.y;
            t.w.lengthCm = t.len; // Cote saisie conservée !
          } else {
            t.w.x1 = pStart.x;
            t.w.y1 = pStart.y;
            t.w.x2 = Math.round(pStart.x + Math.cos(t.rad) * t.len);
            t.w.y2 = Math.round(pStart.y + Math.sin(t.rad) * t.len);
            t.w.lengthCm = t.len;
          }
          t.w.wasFreehand = false;
          placedWalls.add(lk.idx);
        });
      }
    });

    Store.replaceAllWalls(cloned);
    fitViewToPlan(cloned);
    appApi.toast('Croquis redressé à traits droits (cotes exactes conservées) !');
  }

  /**
   * Centre le viewBox sur tous les murs du plan.
   */
  function fitViewToPlan(walls) {
    const planWalls = (walls || []).filter((w) => w.mode !== 'elevation');
    if (!planWalls.length) {
      ui.viewBox = { x: -40, y: -40, w: 720, h: 520 };
      return;
    }
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    planWalls.forEach((w) => {
      minX = Math.min(minX, w.x1, w.x2);
      maxX = Math.max(maxX, w.x1, w.x2);
      minY = Math.min(minY, w.y1, w.y2);
      maxY = Math.max(maxY, w.y1, w.y2);
    });
    const pad = 95;
    const w = Math.max(360, (maxX - minX) + pad * 2);
    const h = Math.max(280, (maxY - minY) + pad * 2);
    ui.viewBox = {
      x: Math.round(minX - pad),
      y: Math.round(minY - pad),
      w: Math.round(w),
      h: Math.round(h)
    };
  }

  /**
   * Pavé numérique flottant (Saisie immédiate des cotes en cm ou m).
   */
  function openDimensionKeypad(wallId, initialCm, label, onConfirm) {
    const root = document.getElementById('keypad-root');
    let unit = 'cm'; // 'cm' | 'm'
    let rawStr = String(Math.round(Number(initialCm) || 300));

    function renderKeypad() {
      root.innerHTML = `
        <div class="dim-keypad-backdrop" id="dk-backdrop">
          <div class="dim-keypad" role="dialog" aria-label="Saisie de cote">
            <div class="row-between">
              <strong style="font-size:13px;color:var(--text-main);">📏 ${esc(label || 'Longueur du mur')}</strong>
              <div class="segmented" id="dk-unit">
                <button type="button" data-u="cm" class="${unit === 'cm' ? 'active' : ''}">cm</button>
                <button type="button" data-u="m" class="${unit === 'm' ? 'active' : ''}">m</button>
              </div>
            </div>
            <div class="dim-display">
              <input id="dk-input" type="text" inputmode="decimal" value="${esc(rawStr)}" aria-label="Valeur cote" />
              <span style="font-family:var(--font-mono);font-size:15px;font-weight:700;color:var(--blue);margin-left:8px;">${unit}</span>
            </div>
            <div class="keypad-grid">
              ${['7', '8', '9', '4', '5', '6', '1', '2', '3', '.', '0', '⌫'].map((k) => `
                <button type="button" class="keypad-key" data-k="${k}">${k}</button>
              `).join('')}
            </div>
            <div class="row-between">
              <button type="button" class="btn" id="dk-cancel" style="flex:1;">Annuler</button>
              <button type="button" class="btn btn-primary" id="dk-ok" style="flex:1.5;">✔ Valider cote</button>
            </div>
          </div>
        </div>
      `;

      const inp = root.querySelector('#dk-input');
      inp.focus();
      inp.select();

      const commit = () => {
        const cleaned = inp.value.replace(',', '.').trim();
        const num = parseFloat(cleaned);
        if (!isNaN(num) && num > 0) {
          const cm = unit === 'm' ? Math.round(num * 100) : Math.round(num);
          root.innerHTML = '';
          onConfirm(Math.max(20, Math.min(3000, cm)));
        }
      };

      const close = () => { root.innerHTML = ''; };

      root.querySelectorAll('#dk-unit button').forEach((b) => {
        b.addEventListener('click', () => {
          const newUnit = b.dataset.u;
          if (newUnit === unit) return;
          const val = parseFloat(inp.value.replace(',', '.'));
          if (!isNaN(val)) {
            rawStr = newUnit === 'm' ? String(Math.round(val) / 100) : String(Math.round(val * 100));
          }
          unit = newUnit;
          renderKeypad();
        });
      });

      root.querySelectorAll('.keypad-key').forEach((btn) => {
        btn.addEventListener('click', () => {
          const k = btn.dataset.k;
          if (k === '⌫') {
            inp.value = inp.value.slice(0, -1);
          } else if (k === '.') {
            if (!inp.value.includes('.')) inp.value += '.';
          } else {
            inp.value = inp.value === '0' ? k : (inp.value + k);
          }
          rawStr = inp.value;
          inp.focus();
        });
      });

      inp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); commit(); }
        if (e.key === 'Escape') { e.preventDefault(); close(); }
      });

      root.querySelector('#dk-ok').addEventListener('click', commit);
      root.querySelector('#dk-cancel').addEventListener('click', close);
      root.querySelector('#dk-backdrop').addEventListener('click', (e) => {
        if (e.target.id === 'dk-backdrop') close();
      });
    }

    renderKeypad();
  }

  /**
   * Génère le SVG complet de la Vue en Plan (utilisé aussi dans l'export PDF !).
   */
  function buildPlanSvgContent(proj, calc, selectedWallId, interactive) {
    const planWalls = (proj.walls || []).filter((w) => w.mode !== 'elevation');
    const poly = calc && calc.planGeom && calc.planGeom.polygon ? calc.planGeom.polygon : [];
    const showCeilingFill = proj.ceiling && proj.ceiling.enabled && poly.length >= 3;

    let svgParts = [];

    if (!planWalls.length && interactive && !ui.isDragging) {
      const cx = ui.viewBox.x + ui.viewBox.w / 2;
      const cy = ui.viewBox.y + ui.viewBox.h / 2;
      svgParts.push(`
        <g pointer-events="none" opacity="0.72">
          <text x="${cx}" y="${cy - 8}" text-anchor="middle" fill="#94A3B8" font-size="16" font-weight="700" font-family="Inter, sans-serif">Croquis vierge — aucun mur tracé</text>
          <text x="${cx}" y="${cy + 16}" text-anchor="middle" fill="#64748B" font-size="12.5" font-family="Inter, sans-serif">Choisissez « Traits droits », « Main levée » ou « + Pièce rect. » ci-dessus pour commencer</text>
        </g>
      `);
    }

    // Remplissage zone plafond si pièce détectée
    if (showCeilingFill) {
      const ptsStr = poly.map((p) => `${p.x},${p.y}`).join(' ');
      svgParts.push(`
        <polygon points="${ptsStr}" fill="rgba(56, 189, 248, 0.08)" stroke="rgba(56, 189, 248, 0.35)" stroke-width="1.5" stroke-dasharray="8 6" />
      `);
      // Centroid pour label surface
      const cx = poly.reduce((s, p) => s + p.x, 0) / poly.length;
      const cy = poly.reduce((s, p) => s + p.y, 0) / poly.length;
      svgParts.push(`
        <g pointer-events="none">
          <rect x="${cx - 68}" y="${cy - 22}" width="136" height="44" rx="8" fill="rgba(11,17,26,0.82)" stroke="rgba(56,189,248,0.45)" stroke-width="1.2" />
          <text x="${cx}" y="${cy - 4}" text-anchor="middle" fill="#38BDF8" font-size="13" font-weight="800" font-family="JetBrains Mono, Consolas, monospace">${calc.planGeom.areaM2} m²</text>
          <text x="${cx}" y="${cy + 13}" text-anchor="middle" fill="#94A3B8" font-size="10" font-family="Inter, sans-serif">Pér. ${calc.planGeom.perimeterMl} ml · Plafond ON</text>
        </g>
      `);
    }

    // Murs + ouvertures + cotes
    planWalls.forEach((w) => {
      const prof = wallProfile(proj, w);
      const isSelected = interactive && w.id === selectedWallId;
      const strokeColor = isSelected ? '#F5C518' : (prof && prof.color ? prof.color : '#E2E8F0');
      const thick = prof && prof.category === 'doublage' ? 12 : 9;

      const dx = w.x2 - w.x1;
      const dy = w.y2 - w.y1;
      const geomLen = Math.max(1, Math.hypot(dx, dy));
      const ux = dx / geomLen;
      const uy = dy / geomLen;
      const nx = -uy; // normale unitaire
      const ny = ux;

      // Trait principal du mur + zone de clic élargie
      svgParts.push(`
        <g class="plan-wall-group" data-wall-id="${esc(w.id)}" style="cursor:${interactive ? 'pointer' : 'default'};">
          ${interactive ? `<line x1="${w.x1}" y1="${w.y1}" x2="${w.x2}" y2="${w.y2}" stroke="transparent" stroke-width="28" stroke-linecap="round" />` : ''}
          ${isSelected ? `<line x1="${w.x1}" y1="${w.y1}" x2="${w.x2}" y2="${w.y2}" stroke="rgba(245,197,24,0.28)" stroke-width="${thick + 10}" stroke-linecap="round" />` : ''}
          <line x1="${w.x1}" y1="${w.y1}" x2="${w.x2}" y2="${w.y2}" stroke="${strokeColor}" stroke-width="${thick}" stroke-linecap="square" />
          <circle cx="${w.x1}" cy="${w.y1}" r="${isSelected ? 6 : 4}" fill="${isSelected ? '#F5C518' : '#38BDF8'}" stroke="#0B111A" stroke-width="1.5" />
          <circle cx="${w.x2}" cy="${w.y2}" r="${isSelected ? 6 : 4}" fill="${isSelected ? '#F5C518' : '#38BDF8'}" stroke="#0B111A" stroke-width="1.5" />
      `);

      // Ouvertures sur le mur
      (w.openings || []).forEach((op) => {
        const ratioStart = Math.max(0, Math.min(1, (Number(op.distFromLeftCm) || 0) / Math.max(1, w.lengthCm)));
        const ratioEnd = Math.max(ratioStart, Math.min(1, ((Number(op.distFromLeftCm) || 0) + (Number(op.widthCm) || 80)) / Math.max(1, w.lengthCm)));
        const ox1 = w.x1 + dx * ratioStart;
        const oy1 = w.y1 + dy * ratioStart;
        const ox2 = w.x1 + dx * ratioEnd;
        const oy2 = w.y1 + dy * ratioEnd;
        const opLenPx = Math.hypot(ox2 - ox1, oy2 - oy1);
        const opSpec = C.OPENING_TYPES[op.type] || C.OPENING_TYPES.porte;

        // Effacer le mur sur la largeur de l'ouverture
        svgParts.push(`<line x1="${ox1}" y1="${oy1}" x2="${ox2}" y2="${oy2}" stroke="#0D1522" stroke-width="${thick + 2}" />`);

        if (op.type === 'porte') {
          // Battant + arc d'ouverture de porte
          const leafX = ox1 + nx * opLenPx * 0.85;
          const leafY = oy1 + ny * opLenPx * 0.85;
          svgParts.push(`
            <line x1="${ox1}" y1="${oy1}" x2="${leafX}" y2="${leafY}" stroke="${opSpec.color}" stroke-width="2.5" />
            <path d="M ${leafX} ${leafY} A ${opLenPx * 0.85} ${opLenPx * 0.85} 0 0 0 ${ox2} ${oy2}" fill="none" stroke="${opSpec.color}" stroke-width="1.5" stroke-dasharray="4 3" />
          `);
        } else if (op.type === 'fenetre' || op.type === 'porte_fenetre') {
          // Double vitrage bleu technique
          svgParts.push(`
            <line x1="${ox1 + nx * 3}" y1="${oy1 + ny * 3}" x2="${ox2 + nx * 3}" y2="${oy2 + ny * 3}" stroke="${opSpec.color}" stroke-width="2.2" />
            <line x1="${ox1 - nx * 3}" y1="${oy1 - ny * 3}" x2="${ox2 - nx * 3}" y2="${oy2 - ny * 3}" stroke="${opSpec.color}" stroke-width="2.2" />
          `);
        } else {
          // Baie libre
          svgParts.push(`<line x1="${ox1}" y1="${oy1}" x2="${ox2}" y2="${oy2}" stroke="${opSpec.color}" stroke-width="2" stroke-dasharray="5 4" />`);
        }
      });

      // Étiquette de cote (cliquable pour ouvrir le pavé numérique !)
      const midX = (w.x1 + w.x2) / 2 + nx * 24;
      const midY = (w.y1 + w.y2) / 2 + ny * 24;
      const badgeW = 68;
      svgParts.push(`
          <g class="dim-badge" data-dim-wall="${esc(w.id)}" style="cursor:pointer;">
            <rect x="${midX - badgeW / 2}" y="${midY - 12}" width="${badgeW}" height="22" rx="5"
                  fill="${isSelected ? '#F5C518' : '#111927'}" stroke="${isSelected ? '#0B111A' : '#38BDF8'}" stroke-width="1.2" />
            <text x="${midX}" y="${midY + 3}" text-anchor="middle"
                  fill="${isSelected ? '#0B111A' : '#F8FAFC'}" font-size="11" font-weight="800" font-family="JetBrains Mono, Consolas, monospace">${Math.round(w.lengthCm)} cm</text>
          </g>
        </g>
      `);
    });

    // Prévisualisation en cours de tracé
    if (interactive && ui.isDragging && ui.tool === 'straight' && ui.dragStartWorld && ui.dragCurrentWorld) {
      const a = ui.dragStartWorld;
      const b = ui.dragCurrentWorld;
      const l = Math.round(dist(a, b));
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2 - 14;
      svgParts.push(`
        <line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="#F5C518" stroke-width="6" stroke-dasharray="8 5" stroke-linecap="round" />
        <circle cx="${a.x}" cy="${a.y}" r="5" fill="#F5C518" />
        <circle cx="${b.x}" cy="${b.y}" r="5" fill="#38BDF8" />
        <rect x="${mx - 42}" y="${my - 12}" width="84" height="22" rx="5" fill="#F5C518" />
        <text x="${mx}" y="${my + 3}" text-anchor="middle" fill="#0B111A" font-size="11.5" font-weight="800" font-family="JetBrains Mono, Consolas, monospace">${l} cm</text>
      `);
    }

    if (interactive && ui.isDragging && ui.tool === 'freehand' && ui.freehandPoints.length > 1) {
      const d = ui.freehandPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
      svgParts.push(`<path d="${d}" fill="none" stroke="#F5C518" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" opacity="0.9" />`);
    }

    return svgParts.join('\n');
  }

  /**
   * Génère le SVG de la Vue de Face (Élévation d'un mur seul, avec gestion rampant/pignon et ouvertures cotées).
   */
  function buildElevationSvg(wall, prof) {
    if (!wall) {
      return `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-muted);flex-direction:column;gap:10px;">
        <div>Aucun mur sélectionné.</div>
        <button type="button" class="btn btn-primary" id="btn-create-elev-wall-empty">+ Créer un mur en vue de face</button>
      </div>`;
    }
    const L = Math.max(50, Number(wall.lengthCm) || 300);
    const hL = Math.max(50, Number(wall.hLeftCm) || 250);
    const hR = Math.max(50, Number(wall.hRightCm) || hL);
    const maxH = Math.max(hL, hR);

    const padX = 75;
    const padTop = 50;
    const padBot = 65;
    const vbW = L + padX * 2;
    const vbH = maxH + padTop + padBot;

    const toY = (yFromFloor) => padTop + (maxH - yFromFloor);
    const wallPoly = `${padX},${toY(0)} ${padX + L},${toY(0)} ${padX + L},${toY(hR)} ${padX},${toY(hL)}`;
    const color = (prof && prof.color) || '#F5C518';

    // Lignes repères de hauteur tous les 50 cm + trame plaques 120 cm en filigrane
    let gridLines = '';
    for (let x = 120; x < L; x += 120) {
      const hAt = hL + (hR - hL) * (x / L);
      gridLines += `<line x1="${padX + x}" y1="${toY(0)}" x2="${padX + x}" y2="${toY(hAt)}" stroke="rgba(56,189,248,0.22)" stroke-width="1.5" stroke-dasharray="6 5" />`;
    }

    // Ouvertures
    let openingsSvg = '';
    (wall.openings || []).forEach((op) => {
      const ox = padX + (Number(op.distFromLeftCm) || 0);
      const ow = Number(op.widthCm) || 83;
      const oh = Number(op.heightCm) || 204;
      const os = Number(op.sillHeightCm) || 0;
      const oyTop = toY(os + oh);
      const isSelOp = ui.selectedOpeningId === op.id;
      const spec = C.OPENING_TYPES[op.type] || C.OPENING_TYPES.porte;

      openingsSvg += `
        <g class="elev-opening" data-op-id="${esc(op.id)}" style="cursor:pointer;">
          <rect x="${ox}" y="${oyTop}" width="${ow}" height="${oh}"
                fill="#0B111A" stroke="${isSelOp ? '#F5C518' : spec.color}" stroke-width="${isSelOp ? 4 : 2.5}" />
          <line x1="${ox}" y1="${oyTop}" x2="${ox + ow}" y2="${oyTop + oh}" stroke="${spec.color}" stroke-width="1" opacity="0.35" />
          <line x1="${ox + ow}" y1="${oyTop}" x2="${ox}" y2="${oyTop + oh}" stroke="${spec.color}" stroke-width="1" opacity="0.35" />
          <text x="${ox + ow / 2}" y="${oyTop + oh / 2 - 4}" text-anchor="middle" fill="#F8FAFC" font-size="13" font-weight="700">${esc(op.label || spec.shortLabel)}</text>
          <text x="${ox + ow / 2}" y="${oyTop + oh / 2 + 14}" text-anchor="middle" fill="${spec.color}" font-size="12" font-weight="700" font-family="JetBrains Mono, Consolas, monospace">${ow} × ${oh}</text>
          ${os > 0 ? `<text x="${ox + ow / 2}" y="${toY(os / 2) + 4}" text-anchor="middle" fill="#94A3B8" font-size="11" font-family="JetBrains Mono, Consolas, monospace">Allège ${os} cm</text>` : ''}
          <!-- Cote distance angle gauche -->
          <text x="${ox + ow / 2}" y="${toY(0) + 18}" text-anchor="middle" fill="#38BDF8" font-size="11" font-family="JetBrains Mono, Consolas, monospace">← ${Math.round(op.distFromLeftCm)} cm</text>
        </g>
      `;
    });

    return `
      <svg id="elev-svg" class="sketch-svg" viewBox="0 0 ${vbW} ${vbH}" preserveAspectRatio="xMidYMid meet" data-pad-x="${padX}" data-wall-len="${L}">
        <!-- Sol -->
        <line x1="${padX - 30}" y1="${toY(0)}" x2="${padX + L + 30}" y2="${toY(0)}" stroke="#475569" stroke-width="3" />
        <!-- Mur -->
        <polygon points="${wallPoly}" fill="rgba(226,232,240,0.08)" stroke="${color}" stroke-width="3.5" />
        ${gridLines}
        ${openingsSvg}

        <!-- Cote Longueur bas -->
        <line x1="${padX}" y1="${toY(0) + 38}" x2="${padX + L}" y2="${toY(0) + 38}" stroke="#F5C518" stroke-width="2" />
        <line x1="${padX}" y1="${toY(0) + 30}" x2="${padX}" y2="${toY(0) + 46}" stroke="#F5C518" stroke-width="2" />
        <line x1="${padX + L}" y1="${toY(0) + 30}" x2="${padX + L}" y2="${toY(0) + 46}" stroke="#F5C518" stroke-width="2" />
        <g id="elev-dim-length" style="cursor:pointer;">
          <rect x="${padX + L / 2 - 44}" y="${toY(0) + 27}" width="88" height="22" rx="5" fill="#F5C518" />
          <text x="${padX + L / 2}" y="${toY(0) + 42}" text-anchor="middle" fill="#0B111A" font-size="12.5" font-weight="800" font-family="JetBrains Mono, Consolas, monospace">${Math.round(L)} cm</text>
        </g>

        <!-- Cote Hauteur Gauche -->
        <line x1="${padX - 24}" y1="${toY(0)}" x2="${padX - 24}" y2="${toY(hL)}" stroke="#38BDF8" stroke-width="2" />
        <text x="${padX - 30}" y="${toY(hL / 2)}" text-anchor="end" fill="#38BDF8" font-size="12" font-weight="700" font-family="JetBrains Mono, Consolas, monospace">H.G ${Math.round(hL)}</text>

        <!-- Cote Hauteur Droite -->
        <line x1="${padX + L + 24}" y1="${toY(0)}" x2="${padX + L + 24}" y2="${toY(hR)}" stroke="#38BDF8" stroke-width="2" />
        <text x="${padX + L + 30}" y="${toY(hR / 2)}" text-anchor="start" fill="#38BDF8" font-size="12" font-weight="700" font-family="JetBrains Mono, Consolas, monospace">H.D ${Math.round(hR)}</text>
      </svg>
    `;
  }

  /**
   * Rendu principal de l'Onglet 2.
   */
  function render(container, state, calc, appApi) {
    const proj = Store.getActiveProject();
    const walls = proj.walls || [];
    const selectedWall = walls.find((w) => w.id === state.selectedWallId) || walls[0] || null;
    if (selectedWall && state.selectedWallId !== selectedWall.id) {
      state.selectedWallId = selectedWall.id;
    }

    const wallProfiles = proj.profiles.filter((p) => p.category !== 'plafond');
    const ceilingProfiles = proj.profiles.filter((p) => p.category === 'plafond');
    const ceil = proj.ceiling || { enabled: false, profileId: ceilingProfiles[0]?.id, autoFromPlan: true };
    const planGeom = calc.planGeom || { areaM2: 0, perimeterMl: 0, detectedClosed: false };

    const activeToolHint = {
      select: 'Cliquez sur un mur pour le sélectionner, ou sur sa cote jaune pour la modifier.',
      straight: 'Cliquez-glissez pour tracer un mur droit (aimantation 0°/45°/90° + sommets).',
      freehand: 'Dessinez au doigt ou à la souris — les segments et la saisie de cote s’ouvrent automatiquement.',
      pan: 'Glissez pour déplacer le plan (molette pour zoomer).',
      'place-opening': `Cliquez sur un mur pour y poser : ${C.OPENING_TYPES[ui.openingToolType]?.label || 'Ouverture'}.`
    }[ui.tool];

    container.innerHTML = `
      <div class="sketch-layout">
        <!-- ZONE DE DESSIN VECTORIEL (GAUCHE) -->
        <div class="sketch-stage-card">
          <div class="sketch-toolbar">
            <!-- Choix Vue en Plan / Vue de Face -->
            <div class="segmented" id="sk-view-mode">
              <button type="button" data-v="plan" class="${ui.viewMode === 'plan' ? 'active' : ''}">🗺️ Vue en plan (dessus)</button>
              <button type="button" data-v="elevation" class="${ui.viewMode === 'elevation' ? 'active-blue' : ''}">🧱 Vue de face (mur seul)</button>
            </div>

            ${ui.viewMode === 'plan' ? `
              <!-- Outils de tracé en plan -->
              <div class="segmented" id="sk-tools">
                <button type="button" data-t="select" class="${ui.tool === 'select' ? 'active' : ''}" title="Sélectionner / Modifier">👆 Sélect.</button>
                <button type="button" data-t="straight" class="${ui.tool === 'straight' ? 'active' : ''}" title="Traits droits magnétiques 0/45/90°">📏 Traits droits</button>
                <button type="button" data-t="freehand" class="${ui.tool === 'freehand' ? 'active' : ''}" title="Croquis main levée (terrain / mobile)">✍️ Main levée</button>
                <button type="button" data-t="pan" class="${ui.tool === 'pan' ? 'active' : ''}" title="Déplacer la vue">✋ Pan</button>
              </div>
              <div class="row" style="gap:6px;">
                <button type="button" class="btn btn-sm btn-primary" id="btn-straighten" title="Redresse les traits main levée à 0/45/90° en respectant vos cotes exactes">✨ Redresser le croquis</button>
                <button type="button" class="btn btn-sm btn-blue" id="btn-quick-room" title="Ajouter une pièce rectangulaire 4 murs">+ Pièce rect.</button>
                <button type="button" class="btn btn-sm" id="btn-undo" title="Annuler" ${state.undoStack.length ? '' : 'disabled'}>↩</button>
              </div>
            ` : `
              <div class="row" style="gap:6px;">
                <button type="button" class="btn btn-sm btn-primary" id="btn-add-elev-wall">+ Nouveau mur seul (élévation)</button>
                <button type="button" class="btn btn-sm" id="btn-undo" title="Annuler" ${state.undoStack.length ? '' : 'disabled'}>↩</button>
              </div>
            `}
          </div>

          <!-- CANVAS SVG INTERACTIF -->
          <div class="sketch-canvas-wrap" id="sketch-canvas-wrap">
            ${ui.viewMode === 'plan' ? `
              <svg id="plan-svg" class="sketch-svg" viewBox="${ui.viewBox.x} ${ui.viewBox.y} ${ui.viewBox.w} ${ui.viewBox.h}" preserveAspectRatio="xMidYMid meet">
                ${buildPlanSvgContent(proj, calc, selectedWall ? selectedWall.id : null, true)}
              </svg>
              <div class="sketch-zoom-controls">
                <button type="button" class="btn" id="btn-zoom-in" title="Zoomer">+</button>
                <button type="button" class="btn" id="btn-zoom-out" title="Dézoomer">−</button>
                <button type="button" class="btn" id="btn-zoom-fit" title="Recentrer le plan">⌖</button>
              </div>
            ` : buildElevationSvg(selectedWall, selectedWall ? wallProfile(proj, selectedWall) : null)}

            <div class="sketch-hud-top">
              <div class="hud-pill" style="border-color:var(--yellow-border);">
                <span style="color:var(--yellow);">●</span>
                <span>${esc(activeToolHint)}</span>
              </div>
            </div>
          </div>

          <!-- PALETTE OUVERTURES (GLISSER-DÉPOSER OU CLIC) -->
          <div class="opening-palette">
            <span style="font-size:11.5px;font-weight:700;color:var(--text-sub);white-space:nowrap;">Ouvertures (glisser sur un mur ou cliquer) :</span>
            ${Object.values(C.OPENING_TYPES).map((ot) => `
              <button type="button" class="opening-chip ${ui.tool === 'place-opening' && ui.openingToolType === ot.id ? 'active' : ''}"
                      draggable="true" data-op-type="${ot.id}">
                <span style="width:9px;height:9px;border-radius:50%;background:${ot.color};display:inline-block;"></span>
                <span>+ ${esc(ot.label)}</span>
              </button>
            `).join('')}
          </div>
        </div>

        <!-- PANNEAU INSPECTEUR DROIT (MURS, OUVERTURES, FAUX PLAFOND) -->
        <aside class="stack">
          <!-- FAUX PLAFOND DE LA PIÈCE -->
          <section class="card">
            <div class="card-header">
              <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-weight:700;font-size:13px;">
                <input type="checkbox" id="chk-ceiling-enabled" ${ceil.enabled ? 'checked' : ''} style="width:18px;height:18px;accent-color:var(--yellow);" />
                <span>Inclure le faux plafond de cette pièce</span>
              </label>
              ${ceil.enabled && calc.ceilingResult ? `<span class="badge badge-blue">${calc.ceilingResult.areaM2} m²</span>` : ''}
            </div>
            ${ceil.enabled ? `
              <div class="card-body stack" style="gap:10px;">
                <div class="field">
                  <label>Profil de faux plafond</label>
                  <select id="sel-ceiling-profile" class="select">
                    ${ceilingProfiles.map((cp) => `<option value="${esc(cp.id)}" ${ceil.profileId === cp.id ? 'selected' : ''}>${esc(cp.name)}</option>`).join('')}
                  </select>
                </div>
                <label style="display:flex;align-items:center;gap:8px;font-size:12px;color:var(--text-sub);cursor:pointer;">
                  <input type="checkbox" id="chk-ceiling-auto" ${ceil.autoFromPlan ? 'checked' : ''} style="accent-color:var(--blue);" />
                  <span>Calcul automatique depuis le plan (${planGeom.areaM2} m² · pér. ${planGeom.perimeterMl} ml)</span>
                </label>
                ${!ceil.autoFromPlan ? `
                  <div class="grid-2">
                    <div class="field">
                      <label>Longueur plafond (cm)</label>
                      <input id="inp-ceil-len" class="input mono" type="number" min="50" max="3000" value="${esc(ceil.customLengthCm || 400)}" />
                    </div>
                    <div class="field">
                      <label>Largeur plafond (cm)</label>
                      <input id="inp-ceil-wid" class="input mono" type="number" min="50" max="3000" value="${esc(ceil.customWidthCm || 350)}" />
                    </div>
                  </div>
                ` : ''}
              </div>
            ` : ''}
          </section>

          <!-- LISTE DES MURS DU CHANTIER -->
          <section class="card">
            <div class="card-header">
              <h3 class="card-title">🧱 Murs &amp; Cloisons (${walls.length})</h3>
              <button type="button" class="btn btn-sm btn-blue" id="btn-add-wall-quick">+ Mur</button>
            </div>
            <div class="card-body" style="padding:10px;">
              ${walls.length ? `
                <div class="wall-list">
                  ${walls.map((w) => {
                    const p = wallProfile(proj, w);
                    const isSel = selectedWall && w.id === selectedWall.id;
                    const isRampant = Math.abs((w.hLeftCm || 250) - (w.hRightCm || 250)) > 1;
                    return `
                      <div class="wall-item ${isSel ? 'active' : ''}" data-select-wall="${esc(w.id)}">
                        <div style="display:flex;align-items:center;gap:8px;min-width:0;">
                          <span class="profile-swatch" style="background:${esc(p?.color || '#E2E8F0')}"></span>
                          <div style="min-width:0;">
                            <div style="font-size:12.5px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(w.name)}</div>
                            <div style="font-size:11px;color:var(--text-sub);font-family:var(--font-mono);">
                              ${Math.round(w.lengthCm)} × ${isRampant ? `${Math.round(w.hLeftCm)}→${Math.round(w.hRightCm)}` : Math.round(w.hLeftCm)} cm
                              ${w.mode === 'elevation' ? ' · Mur seul' : ''}
                              ${(w.openings || []).length ? ` · ${(w.openings || []).length} ouv.` : ''}
                            </div>
                          </div>
                        </div>
                        <button type="button" class="btn btn-sm btn-ghost" data-keypad-wall="${esc(w.id)}" title="Modifier longueur">📏</button>
                      </div>
                    `;
                  }).join('')}
                </div>
              ` : '<div style="font-size:12.5px;color:var(--text-muted);text-align:center;padding:12px;">Tracez un mur sur le croquis ou cliquez sur "+ Pièce rect." / "+ Mur".</div>'}
            </div>
          </section>

          <!-- PROPRIÉTÉS DU MUR SÉLECTIONNÉ + OUVERTURES -->
          ${selectedWall ? renderWallInspector(selectedWall, wallProfiles) : ''}
        </aside>
      </div>
    `;

    bindEvents(container, proj, selectedWall, appApi);
  }

  function renderWallInspector(wall, wallProfiles) {
    const openings = wall.openings || [];
    const isRampant = Math.abs((wall.hLeftCm || 250) - (wall.hRightCm || 250)) > 1;
    return `
      <section class="card">
        <div class="card-header">
          <h3 class="card-title">⚙️ Mur sélectionné</h3>
          <div class="row" style="gap:6px;">
            <button type="button" class="btn btn-sm btn-blue" id="btn-open-wall-elev" title="Afficher ce mur en vue de face">🧱 Face</button>
            <button type="button" class="btn btn-sm btn-danger" id="btn-del-wall" title="Supprimer ce mur">🗑️</button>
          </div>
        </div>
        <div class="card-body stack" style="gap:11px;">
          <div class="field">
            <label>Désignation du mur</label>
            <input id="wi-name" class="input" type="text" value="${esc(wall.name)}" />
          </div>

          <div class="field">
            <label>Gabarit d'ouvrage assigné (DTU 25.41)</label>
            <select id="wi-profile" class="select">
              <option value="" ${!wall.profileId ? 'selected' : ''}>— Non affecté (exclu du calcul) —</option>
              ${wallProfiles.map((p) => `<option value="${esc(p.id)}" ${wall.profileId === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}
            </select>
          </div>

          <div class="grid-3" style="gap:8px;">
            <div class="field">
              <label>Longueur (cm)</label>
              <input id="wi-length" class="input mono" type="number" min="20" max="3000" value="${Math.round(wall.lengthCm)}" />
            </div>
            <div class="field">
              <label>H. Gauche (cm)</label>
              <input id="wi-hleft" class="input mono" type="number" min="30" max="600" value="${Math.round(wall.hLeftCm || 250)}" />
            </div>
            <div class="field">
              <label>H. Droite (cm)</label>
              <input id="wi-hright" class="input mono" type="number" min="30" max="600" value="${Math.round(wall.hRightCm || 250)}" />
            </div>
          </div>
          ${isRampant ? '<div class="badge badge-yellow" style="align-self:flex-start;">📐 Rampant / Pignon actif (coupe biaisée calculée)</div>' : ''}

          <!-- OUVERTURES DU MUR -->
          <div style="border-top:1px solid var(--border);padding-top:10px;">
            <div class="row-between" style="margin-bottom:8px;">
              <strong style="font-size:12.5px;color:var(--blue);">🚪 Ouvertures sur ce mur (${openings.length})</strong>
              <button type="button" class="btn btn-sm btn-primary" id="btn-add-op-inspector">+ Ajouter</button>
            </div>
            ${openings.length ? openings.map((op) => {
              const distLeft = Math.round(Number(op.distFromLeftCm) || 0);
              const w = Math.round(Number(op.widthCm) || 83);
              const h = Math.round(Number(op.heightCm) || 204);
              const sill = Math.round(Number(op.sillHeightCm) || 0);
              const distRight = Math.max(0, Math.round(wall.lengthCm - distLeft - w));
              const spec = C.OPENING_TYPES[op.type] || C.OPENING_TYPES.porte;
              return `
                <div class="op-editor-card" data-op-card="${esc(op.id)}" style="background:var(--bg-surface);border:1px solid ${ui.selectedOpeningId === op.id ? 'var(--yellow)' : 'var(--border)'};border-radius:8px;padding:10px;margin-bottom:8px;">
                  <div class="row-between" style="margin-bottom:8px;">
                    <select class="select op-type-sel" data-op="${esc(op.id)}" style="width:auto;min-height:30px;padding:4px 8px;font-size:12px;">
                      ${Object.values(C.OPENING_TYPES).map((t) => `<option value="${t.id}" ${op.type === t.id ? 'selected' : ''}>${esc(t.label)}</option>`).join('')}
                    </select>
                    <button type="button" class="btn btn-sm btn-danger op-del-btn" data-op="${esc(op.id)}">✕</button>
                  </div>
                  <!-- Presets rapides -->
                  <div class="row" style="gap:4px;margin-bottom:8px;">
                    ${spec.presets.map((pr) => `
                      <button type="button" class="btn btn-sm op-preset-btn" data-op="${esc(op.id)}" data-w="${pr.w}" data-h="${pr.h}" data-s="${pr.s}" style="font-size:10.5px;padding:2px 6px;min-height:24px;">${esc(pr.label)}</button>
                    `).join('')}
                  </div>
                  <div class="grid-2" style="gap:6px;margin-bottom:6px;">
                    <div class="field">
                      <label>Dist. angle gauche (cm)</label>
                      <input type="number" class="input mono op-dist-left" data-op="${esc(op.id)}" min="0" max="${Math.round(wall.lengthCm)}" value="${distLeft}" />
                    </div>
                    <div class="field">
                      <label>Dist. angle droit (cm)</label>
                      <input type="number" class="input mono op-dist-right" data-op="${esc(op.id)}" min="0" max="${Math.round(wall.lengthCm)}" value="${distRight}" />
                    </div>
                  </div>
                  <div class="grid-3" style="gap:6px;">
                    <div class="field">
                      <label>Largeur</label>
                      <input type="number" class="input mono op-w" data-op="${esc(op.id)}" min="20" max="${Math.round(wall.lengthCm)}" value="${w}" />
                    </div>
                    <div class="field">
                      <label>Hauteur</label>
                      <input type="number" class="input mono op-h" data-op="${esc(op.id)}" min="20" max="400" value="${h}" />
                    </div>
                    <div class="field">
                      <label>Allège</label>
                      <input type="number" class="input mono op-s" data-op="${esc(op.id)}" min="0" max="300" value="${sill}" />
                    </div>
                  </div>
                </div>
              `;
            }).join('') : '<div style="font-size:11.5px;color:var(--text-muted);">Aucune ouverture sur ce mur. Glissez une porte/fenêtre depuis la barre ci-dessous ou cliquez sur "+ Ajouter".</div>'}
          </div>
        </div>
      </section>
    `;
  }

  function bindEvents(container, proj, selectedWall, appApi) {
    // Switch Vue Plan / Vue Face
    container.querySelectorAll('#sk-view-mode button').forEach((b) => {
      b.addEventListener('click', () => {
        ui.viewMode = b.dataset.v;
        if (ui.viewMode === 'plan') ui.tool = 'select';
        appApi.rerender();
      });
    });

    // Outils
    container.querySelectorAll('#sk-tools button').forEach((b) => {
      b.addEventListener('click', () => {
        ui.tool = b.dataset.t;
        ui.openingToolType = null;
        appApi.rerender();
      });
    });

    // Undo
    const undoBtn = container.querySelector('#btn-undo');
    if (undoBtn) {
      undoBtn.addEventListener('click', () => {
        if (Store.undoWalls()) appApi.toast('Dernière action annulée');
      });
    }

    // Redresser croquis
    const straightBtn = container.querySelector('#btn-straighten');
    if (straightBtn) {
      straightBtn.addEventListener('click', () => straightenSketch(appApi));
    }

    // Pièce rectangulaire rapide
    const quickRoomBtn = container.querySelector('#btn-quick-room');
    if (quickRoomBtn) {
      quickRoomBtn.addEventListener('click', () => openQuickRoomModal(appApi));
    }

    // Nouveau mur seul (élévation)
    const addElevHandler = () => {
      const p = Store.getActiveProject();
      const h = Number(p.defaultHeightCm) || 250;
      const w = Store.addWall({
        name: `Mur seul ${p.walls.length + 1}`,
        mode: 'elevation',
        x1: 0, y1: 0, x2: 350, y2: 0,
        lengthCm: 350,
        hLeftCm: h,
        hRightCm: h
      });
      ui.viewMode = 'elevation';
      openDimensionKeypad(w.id, 350, 'Longueur du mur (vue de face)', (cm) => {
        Store.updateWall(w.id, { lengthCm: cm, x2: cm });
        appApi.toast(`Mur seul ${cm} × ${h} cm créé`);
      });
    };
    const btnAddElev = container.querySelector('#btn-add-elev-wall');
    if (btnAddElev) btnAddElev.addEventListener('click', addElevHandler);
    const btnAddElevEmpty = container.querySelector('#btn-create-elev-wall-empty');
    if (btnAddElevEmpty) btnAddElevEmpty.addEventListener('click', addElevHandler);

    // Ajout mur rapide depuis la liste
    const btnAddWallQuick = container.querySelector('#btn-add-wall-quick');
    if (btnAddWallQuick) {
      btnAddWallQuick.addEventListener('click', () => {
        if (ui.viewMode === 'elevation') {
          addElevHandler();
        } else {
          const p = Store.getActiveProject();
          const offset = (p.walls.length % 5) * 40;
          const w = Store.addWall({
            name: `Mur ${p.walls.length + 1}`,
            mode: 'plan',
            x1: 100 + offset, y1: 120 + offset,
            x2: 400 + offset, y2: 120 + offset,
            lengthCm: 300
          });
          openDimensionKeypad(w.id, 300, `Longueur de ${w.name}`, (cm) => {
            Store.updateWall(w.id, resizeWallGeometryToLength(w, cm));
          });
        }
      });
    }

    // Palette ouvertures (clic + drag & drop)
    container.querySelectorAll('.opening-chip').forEach((chip) => {
      const opType = chip.dataset.opType;
      chip.addEventListener('click', () => {
        if (ui.viewMode === 'elevation' && selectedWall) {
          const spec = C.OPENING_TYPES[opType];
          const op = Store.addOpening(selectedWall.id, {
            type: opType,
            distFromLeftCm: Math.max(0, Math.round((selectedWall.lengthCm - spec.defaultWidthCm) / 2))
          });
          if (op) {
            ui.selectedOpeningId = op.id;
            appApi.toast(`${spec.label} ajouté sur ${selectedWall.name}`);
          }
          return;
        }
        if (ui.tool === 'place-opening' && ui.openingToolType === opType) {
          ui.tool = 'select';
          ui.openingToolType = null;
        } else {
          ui.tool = 'place-opening';
          ui.openingToolType = opType;
        }
        appApi.rerender();
      });

      chip.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', opType);
        ui.openingToolType = opType;
      });
    });

    // Drop sur le canvas (Plan ou Élévation)
    const canvasWrap = container.querySelector('#sketch-canvas-wrap');
    if (canvasWrap) {
      canvasWrap.addEventListener('dragover', (e) => e.preventDefault());
      canvasWrap.addEventListener('drop', (e) => {
        e.preventDefault();
        const opType = e.dataTransfer.getData('text/plain') || ui.openingToolType || 'porte';
        const spec = C.OPENING_TYPES[opType] || C.OPENING_TYPES.porte;
        if (ui.viewMode === 'plan') {
          const svgEl = container.querySelector('#plan-svg');
          if (!svgEl) return;
          const worldPt = clientToWorld(svgEl, e.clientX, e.clientY);
          const planWalls = Store.getActiveProject().walls.filter((w) => w.mode !== 'elevation');
          let bestWall = null, bestProj = null;
          planWalls.forEach((w) => {
            const pr = projectPointOnWall(worldPt, w);
            if (!bestProj || pr.dist < bestProj.dist) {
              bestProj = pr;
              bestWall = w;
            }
          });
          if (bestWall && bestProj && bestProj.dist < 60) {
            const centerCm = Math.round(bestProj.t * bestWall.lengthCm);
            const distLeft = Math.max(0, Math.min(bestWall.lengthCm - spec.defaultWidthCm, Math.round(centerCm - spec.defaultWidthCm / 2)));
            Store.setSelectedWallId(bestWall.id);
            const op = Store.addOpening(bestWall.id, { type: opType, distFromLeftCm: distLeft });
            if (op) ui.selectedOpeningId = op.id;
            appApi.toast(`${spec.label} posé sur ${bestWall.name}`);
          } else {
            appApi.toast('Déposez directement sur un mur du plan.');
          }
        } else if (selectedWall) {
          const elevSvg = container.querySelector('#elev-svg');
          let distLeft = Math.max(0, Math.round((selectedWall.lengthCm - spec.defaultWidthCm) / 2));
          if (elevSvg) {
            const rect = elevSvg.getBoundingClientRect();
            const ratio = (e.clientX - rect.left) / Math.max(1, rect.width);
            distLeft = Math.max(0, Math.min(selectedWall.lengthCm - spec.defaultWidthCm, Math.round(ratio * selectedWall.lengthCm - spec.defaultWidthCm / 2)));
          }
          const op = Store.addOpening(selectedWall.id, { type: opType, distFromLeftCm: distLeft });
          if (op) ui.selectedOpeningId = op.id;
          appApi.toast(`${spec.label} posé sur ${selectedWall.name}`);
        }
      });
    }

    // Interactions SVG en Vue Plan
    const planSvg = container.querySelector('#plan-svg');
    if (planSvg) {
      bindPlanSvgInteractions(planSvg, appApi);
    }

    // Interactions SVG en Vue Face
    const elevSvg = container.querySelector('#elev-svg');
    if (elevSvg && selectedWall) {
      elevSvg.querySelectorAll('.elev-opening').forEach((g) => {
        g.addEventListener('click', (e) => {
          e.stopPropagation();
          ui.selectedOpeningId = g.dataset.opId;
          appApi.rerender();
        });
      });
      const dimLen = elevSvg.querySelector('#elev-dim-length');
      if (dimLen) {
        dimLen.addEventListener('click', () => {
          openDimensionKeypad(selectedWall.id, selectedWall.lengthCm, `Longueur de ${selectedWall.name}`, (cm) => {
            Store.updateWall(selectedWall.id, resizeWallGeometryToLength(selectedWall, cm), true);
          });
        });
      }
    }

    // Zoom buttons
    const zoomIn = container.querySelector('#btn-zoom-in');
    if (zoomIn) zoomIn.addEventListener('click', () => { zoomPlan(0.82); appApi.rerender(); });
    const zoomOut = container.querySelector('#btn-zoom-out');
    if (zoomOut) zoomOut.addEventListener('click', () => { zoomPlan(1.22); appApi.rerender(); });
    const zoomFit = container.querySelector('#btn-zoom-fit');
    if (zoomFit) zoomFit.addEventListener('click', () => { fitViewToPlan(Store.getActiveProject().walls); appApi.rerender(); });

    // Faux plafond controls
    const chkCeil = container.querySelector('#chk-ceiling-enabled');
    if (chkCeil) {
      chkCeil.addEventListener('change', (e) => Store.updateCeiling({ enabled: e.target.checked }));
    }
    const selCeilProf = container.querySelector('#sel-ceiling-profile');
    if (selCeilProf) {
      selCeilProf.addEventListener('change', (e) => Store.updateCeiling({ profileId: e.target.value }));
    }
    const chkCeilAuto = container.querySelector('#chk-ceiling-auto');
    if (chkCeilAuto) {
      chkCeilAuto.addEventListener('change', (e) => Store.updateCeiling({ autoFromPlan: e.target.checked }));
    }
    const inpCeilL = container.querySelector('#inp-ceil-len');
    if (inpCeilL) {
      inpCeilL.addEventListener('change', (e) => Store.updateCeiling({ customLengthCm: Math.max(50, Number(e.target.value) || 400) }));
    }
    const inpCeilW = container.querySelector('#inp-ceil-wid');
    if (inpCeilW) {
      inpCeilW.addEventListener('change', (e) => Store.updateCeiling({ customWidthCm: Math.max(50, Number(e.target.value) || 300) }));
    }

    // Liste des murs
    container.querySelectorAll('[data-select-wall]').forEach((item) => {
      item.addEventListener('click', (e) => {
        if (e.target.closest('[data-keypad-wall]')) return;
        Store.setSelectedWallId(item.dataset.selectWall);
      });
    });
    container.querySelectorAll('[data-keypad-wall]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const w = Store.getActiveProject().walls.find((x) => x.id === btn.dataset.keypadWall);
        if (!w) return;
        Store.setSelectedWallId(w.id);
        openDimensionKeypad(w.id, w.lengthCm, `Longueur de ${w.name}`, (cm) => {
          Store.updateWall(w.id, resizeWallGeometryToLength(w, cm), true);
          appApi.toast(`${w.name} mis à jour : ${cm} cm`);
        });
      });
    });

    // Inspecteur du mur sélectionné
    if (selectedWall) {
      container.querySelector('#wi-name')?.addEventListener('change', (e) => {
        Store.updateWall(selectedWall.id, { name: e.target.value.trim() || selectedWall.name });
      });
      container.querySelector('#wi-profile')?.addEventListener('change', (e) => {
        Store.updateWall(selectedWall.id, { profileId: e.target.value || null });
      });
      container.querySelector('#wi-length')?.addEventListener('change', (e) => {
        const cm = Math.max(20, Math.min(3000, Number(e.target.value) || selectedWall.lengthCm));
        Store.updateWall(selectedWall.id, resizeWallGeometryToLength(selectedWall, cm), true);
      });
      container.querySelector('#wi-hleft')?.addEventListener('change', (e) => {
        const h = Math.max(30, Math.min(600, Number(e.target.value) || 250));
        // Si mur plat auparavant, garder plat sauf si on modifie séparément hRight
        const wasFlat = Math.abs((selectedWall.hLeftCm || 250) - (selectedWall.hRightCm || 250)) < 1;
        Store.updateWall(selectedWall.id, wasFlat ? { hLeftCm: h, hRightCm: h } : { hLeftCm: h });
      });
      container.querySelector('#wi-hright')?.addEventListener('change', (e) => {
        const h = Math.max(30, Math.min(600, Number(e.target.value) || 250));
        Store.updateWall(selectedWall.id, { hRightCm: h });
      });
      container.querySelector('#btn-open-wall-elev')?.addEventListener('click', () => {
        ui.viewMode = 'elevation';
        appApi.rerender();
      });
      container.querySelector('#btn-del-wall')?.addEventListener('click', () => {
        Store.deleteWall(selectedWall.id);
        appApi.toast('Mur supprimé');
      });
      container.querySelector('#btn-add-op-inspector')?.addEventListener('click', () => {
        const op = Store.addOpening(selectedWall.id, { type: 'porte', distFromLeftCm: Math.max(0, Math.round((selectedWall.lengthCm - 83) / 2)) });
        if (op) ui.selectedOpeningId = op.id;
      });

      // Édition des ouvertures
      container.querySelectorAll('.op-type-sel').forEach((sel) => {
        sel.addEventListener('change', () => {
          const spec = C.OPENING_TYPES[sel.value] || C.OPENING_TYPES.porte;
          Store.updateOpening(selectedWall.id, sel.dataset.op, {
            type: spec.id,
            label: spec.shortLabel,
            widthCm: spec.defaultWidthCm,
            heightCm: spec.defaultHeightCm,
            sillHeightCm: spec.defaultSillCm
          });
        });
      });
      container.querySelectorAll('.op-del-btn').forEach((btn) => {
        btn.addEventListener('click', () => Store.deleteOpening(selectedWall.id, btn.dataset.op));
      });
      container.querySelectorAll('.op-preset-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          Store.updateOpening(selectedWall.id, btn.dataset.op, {
            widthCm: Number(btn.dataset.w),
            heightCm: Number(btn.dataset.h),
            sillHeightCm: Number(btn.dataset.s)
          });
        });
      });
      container.querySelectorAll('.op-dist-left').forEach((inp) => {
        inp.addEventListener('change', () => {
          const op = (selectedWall.openings || []).find((o) => o.id === inp.dataset.op);
          if (!op) return;
          const val = Math.max(0, Math.min(selectedWall.lengthCm - op.widthCm, Number(inp.value) || 0));
          Store.updateOpening(selectedWall.id, op.id, { distFromLeftCm: val });
        });
      });
      container.querySelectorAll('.op-dist-right').forEach((inp) => {
        inp.addEventListener('change', () => {
          const op = (selectedWall.openings || []).find((o) => o.id === inp.dataset.op);
          if (!op) return;
          const distR = Math.max(0, Number(inp.value) || 0);
          const distL = Math.max(0, Math.min(selectedWall.lengthCm - op.widthCm, selectedWall.lengthCm - op.widthCm - distR));
          Store.updateOpening(selectedWall.id, op.id, { distFromLeftCm: Math.round(distL) });
        });
      });
      container.querySelectorAll('.op-w').forEach((inp) => {
        inp.addEventListener('change', () => {
          const w = Math.max(20, Math.min(selectedWall.lengthCm, Number(inp.value) || 83));
          Store.updateOpening(selectedWall.id, inp.dataset.op, { widthCm: w });
        });
      });
      container.querySelectorAll('.op-h').forEach((inp) => {
        inp.addEventListener('change', () => {
          const h = Math.max(20, Math.min(400, Number(inp.value) || 204));
          Store.updateOpening(selectedWall.id, inp.dataset.op, { heightCm: h });
        });
      });
      container.querySelectorAll('.op-s').forEach((inp) => {
        inp.addEventListener('change', () => {
          const s = Math.max(0, Math.min(300, Number(inp.value) || 0));
          Store.updateOpening(selectedWall.id, inp.dataset.op, { sillHeightCm: s });
        });
      });
    }
  }

  function zoomPlan(factor) {
    const vb = ui.viewBox;
    const nw = Math.max(220, Math.min(3600, vb.w * factor));
    const nh = Math.max(160, Math.min(2800, vb.h * factor));
    vb.x += (vb.w - nw) / 2;
    vb.y += (vb.h - nh) / 2;
    vb.w = nw;
    vb.h = nh;
  }

  function bindPlanSvgInteractions(svgEl, appApi) {
    // Molette souris pour zoomer
    svgEl.addEventListener('wheel', (e) => {
      e.preventDefault();
      zoomPlan(e.deltaY > 0 ? 1.12 : 0.88);
      svgEl.setAttribute('viewBox', `${ui.viewBox.x} ${ui.viewBox.y} ${ui.viewBox.w} ${ui.viewBox.h}`);
    }, { passive: false });

    // Clic sur badges de cote
    svgEl.querySelectorAll('.dim-badge').forEach((badge) => {
      badge.addEventListener('pointerdown', (e) => e.stopPropagation());
      badge.addEventListener('click', (e) => {
        e.stopPropagation();
        const wallId = badge.dataset.dimWall;
        const w = Store.getActiveProject().walls.find((x) => x.id === wallId);
        if (!w) return;
        Store.setSelectedWallId(w.id);
        openDimensionKeypad(w.id, w.lengthCm, `Cote de ${w.name}`, (cm) => {
          Store.updateWall(w.id, resizeWallGeometryToLength(w, cm), true);
          appApi.toast(`${w.name} : ${cm} cm`);
        });
      });
    });

    let cachedDragCalc = null;

    svgEl.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.dim-badge')) return;
      const proj = Store.getActiveProject();
      const worldPt = clientToWorld(svgEl, e.clientX, e.clientY);

      if (ui.tool === 'pan' || e.button === 1) {
        ui.isDragging = true;
        ui.panStartClient = { x: e.clientX, y: e.clientY };
        ui.panStartVB = Object.assign({}, ui.viewBox);
        svgEl.setPointerCapture(e.pointerId);
        return;
      }

      if (ui.tool === 'select') {
        const wallGroup = e.target.closest('.plan-wall-group');
        if (wallGroup) {
          Store.setSelectedWallId(wallGroup.dataset.wallId);
        }
        return;
      }

      if (ui.tool === 'place-opening') {
        const planWalls = proj.walls.filter((w) => w.mode !== 'elevation');
        let bestWall = null, bestProj = null;
        planWalls.forEach((w) => {
          const pr = projectPointOnWall(worldPt, w);
          if (!bestProj || pr.dist < bestProj.dist) { bestProj = pr; bestWall = w; }
        });
        if (bestWall && bestProj && bestProj.dist < 45) {
          const spec = C.OPENING_TYPES[ui.openingToolType] || C.OPENING_TYPES.porte;
          const centerCm = Math.round(bestProj.t * bestWall.lengthCm);
          const distLeft = Math.max(0, Math.min(bestWall.lengthCm - spec.defaultWidthCm, Math.round(centerCm - spec.defaultWidthCm / 2)));
          Store.setSelectedWallId(bestWall.id);
          const op = Store.addOpening(bestWall.id, { type: spec.id, distFromLeftCm: distLeft });
          if (op) ui.selectedOpeningId = op.id;
          ui.tool = 'select';
          ui.openingToolType = null;
          appApi.toast(`${spec.label} ajouté sur ${bestWall.name}`);
        } else {
          appApi.toast('Touchez / cliquez directement sur un mur pour poser l’ouverture.');
        }
        return;
      }

      if (ui.tool === 'straight') {
        const snapped = snapToPlan(worldPt, proj.walls, null, false);
        ui.isDragging = true;
        ui.dragStartWorld = snapped;
        ui.dragCurrentWorld = snapped;
        cachedDragCalc = global.PlacoEngine.calculateProject(proj);
        svgEl.setPointerCapture(e.pointerId);
        return;
      }

      if (ui.tool === 'freehand') {
        ui.isDragging = true;
        ui.freehandPoints = [worldPt];
        cachedDragCalc = global.PlacoEngine.calculateProject(proj);
        svgEl.setPointerCapture(e.pointerId);
      }
    });

    svgEl.addEventListener('pointermove', (e) => {
      if (!ui.isDragging) return;
      const proj = Store.getActiveProject();

      if (ui.tool === 'pan' || ui.panStartClient) {
        const rect = svgEl.getBoundingClientRect();
        const scale = Math.min(rect.width / ui.panStartVB.w, rect.height / ui.panStartVB.h);
        ui.viewBox.x = ui.panStartVB.x - (e.clientX - ui.panStartClient.x) / scale;
        ui.viewBox.y = ui.panStartVB.y - (e.clientY - ui.panStartClient.y) / scale;
        svgEl.setAttribute('viewBox', `${ui.viewBox.x} ${ui.viewBox.y} ${ui.viewBox.w} ${ui.viewBox.h}`);
        return;
      }

      const worldPt = clientToWorld(svgEl, e.clientX, e.clientY);
      if (ui.tool === 'straight') {
        ui.dragCurrentWorld = snapToPlan(worldPt, proj.walls, ui.dragStartWorld, true);
        svgEl.innerHTML = buildPlanSvgContent(proj, cachedDragCalc, Store.getState().selectedWallId, true);
      } else if (ui.tool === 'freehand') {
        const last = ui.freehandPoints[ui.freehandPoints.length - 1];
        if (!last || dist(last, worldPt) > 6) {
          ui.freehandPoints.push(worldPt);
          svgEl.innerHTML = buildPlanSvgContent(proj, cachedDragCalc, Store.getState().selectedWallId, true);
        }
      }
    });

    svgEl.addEventListener('pointerup', (e) => {
      if (!ui.isDragging) return;
      const proj = Store.getActiveProject();
      ui.isDragging = false;
      ui.panStartClient = null;
      ui.panStartVB = null;

      if (ui.tool === 'straight' && ui.dragStartWorld && ui.dragCurrentWorld) {
        const a = ui.dragStartWorld;
        const b = ui.dragCurrentWorld;
        const rawLen = Math.round(dist(a, b));
        ui.dragStartWorld = null;
        ui.dragCurrentWorld = null;
        if (rawLen >= 20) {
          const w = Store.addWall({
            name: `Mur ${proj.walls.length + 1}`,
            mode: 'plan',
            x1: Math.round(a.x), y1: Math.round(a.y),
            x2: Math.round(b.x), y2: Math.round(b.y),
            lengthCm: rawLen
          });
          // Saisie immédiate des cotes via pavé numérique flottant !
          openDimensionKeypad(w.id, rawLen, `Cote exacte — ${w.name}`, (cm) => {
            Store.updateWall(w.id, resizeWallGeometryToLength(w, cm));
          });
        } else {
          appApi.rerender();
        }
        return;
      }

      if (ui.tool === 'freehand') {
        const pts = ui.freehandPoints.slice();
        ui.freehandPoints = [];
        if (pts.length >= 2) {
          const simplified = rdpSimplify(pts, 22);
          const createdWalls = [];
          for (let i = 0; i < simplified.length - 1; i++) {
            const p1 = simplified[i];
            const p2 = simplified[i + 1];
            const len = Math.round(dist(p1, p2));
            if (len < 20) continue;
            const w = Store.addWall({
              name: `Mur ${Store.getActiveProject().walls.length + 1}`,
              mode: 'plan',
              wasFreehand: true,
              x1: Math.round(p1.x), y1: Math.round(p1.y),
              x2: Math.round(p2.x), y2: Math.round(p2.y),
              lengthCm: len
            }, i > 0);
            createdWalls.push(w);
          }
          if (createdWalls.length === 1) {
            const w = createdWalls[0];
            openDimensionKeypad(w.id, w.lengthCm, `Cote exacte — ${w.name}`, (cm) => {
              Store.updateWall(w.id, resizeWallGeometryToLength(w, cm));
            });
          } else if (createdWalls.length > 1) {
            appApi.toast(`${createdWalls.length} murs tracés ! Cliquez sur chaque cote jaune puis sur "Redresser le croquis".`);
          } else {
            appApi.rerender();
          }
        }
      }
    });
  }

  /**
   * Modale d'ajout rapide d'une pièce rectangulaire 4 murs (très pratique sur chantier !).
   */
  function openQuickRoomModal(appApi) {
    const root = document.getElementById('modal-root');
    const proj = Store.getActiveProject();
    const wallProfiles = proj.profiles.filter((p) => p.category !== 'plafond');
    const defProf = wallProfiles.find((p) => p.category === 'doublage') || wallProfiles[0];

    root.innerHTML = `
      <div class="modal-backdrop" id="qr-bg">
        <div class="modal-box" style="max-width:440px;">
          <div class="card-header">
            <h3 class="card-title">⬜ Créer une pièce rectangulaire</h3>
            <button type="button" class="btn btn-sm btn-ghost" id="qr-close">✕</button>
          </div>
          <div class="card-body stack">
            <div class="grid-2">
              <div class="field">
                <label>Longueur pièce (cm)</label>
                <input id="qr-len" class="input mono" type="number" min="80" max="2500" value="450" />
              </div>
              <div class="field">
                <label>Largeur pièce (cm)</label>
                <input id="qr-wid" class="input mono" type="number" min="80" max="2500" value="360" />
              </div>
            </div>
            <div class="field">
              <label>Profil des 4 murs périphériques</label>
              <select id="qr-prof" class="select">
                ${wallProfiles.map((p) => `<option value="${esc(p.id)}" ${defProf && p.id === defProf.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}
              </select>
            </div>
            <label style="display:flex;align-items:center;gap:8px;font-size:12.5px;cursor:pointer;">
              <input type="checkbox" id="qr-replace" checked style="accent-color:var(--yellow);" />
              <span>Remplacer le plan actuel (décocher pour ajouter à côté)</span>
            </label>
            <div class="row-between">
              <button type="button" class="btn" id="qr-cancel">Annuler</button>
              <button type="button" class="btn btn-primary" id="qr-ok">✔ Générer les 4 murs</button>
            </div>
          </div>
        </div>
      </div>
    `;

    const close = () => { root.innerHTML = ''; };
    root.querySelector('#qr-close').addEventListener('click', close);
    root.querySelector('#qr-cancel').addEventListener('click', close);
    root.querySelector('#qr-bg').addEventListener('click', (e) => { if (e.target.id === 'qr-bg') close(); });
    root.querySelector('#qr-ok').addEventListener('click', () => {
      const L = Math.max(80, Number(root.querySelector('#qr-len').value) || 450);
      const W = Math.max(80, Number(root.querySelector('#qr-wid').value) || 360);
      const profId = root.querySelector('#qr-prof').value;
      const replace = root.querySelector('#qr-replace').checked;
      const h = Number(proj.defaultHeightCm) || 250;
      const ox = replace ? 80 : 120;
      const oy = replace ? 80 : 120;

      const newWalls = [
        { id: Store.uid('w'), name: 'Mur Nord', mode: 'plan', x1: ox, y1: oy, x2: ox + L, y2: oy, lengthCm: L, hLeftCm: h, hRightCm: h, profileId: profId, openings: [] },
        { id: Store.uid('w'), name: 'Mur Est', mode: 'plan', x1: ox + L, y1: oy, x2: ox + L, y2: oy + W, lengthCm: W, hLeftCm: h, hRightCm: h, profileId: profId, openings: [] },
        { id: Store.uid('w'), name: 'Mur Sud', mode: 'plan', x1: ox + L, y1: oy + W, x2: ox, y2: oy + W, lengthCm: L, hLeftCm: h, hRightCm: h, profileId: profId, openings: [] },
        { id: Store.uid('w'), name: 'Mur Ouest', mode: 'plan', x1: ox, y1: oy + W, x2: ox, y2: oy, lengthCm: W, hLeftCm: h, hRightCm: h, profileId: profId, openings: [] }
      ];

      const merged = replace ? newWalls : proj.walls.concat(newWalls);
      Store.replaceAllWalls(merged);
      Store.setSelectedWallId(newWalls[0].id);
      fitViewToPlan(merged);
      close();
      appApi.toast(`Pièce ${L} × ${W} cm générée (${Math.round((L * W) / 100) / 100} m²)`);
    });
  }

  global.PlacoSketch = {
    render,
    buildPlanSvgContent,
    buildElevationSvg,
    fitViewToPlan,
    straightenSketch
  };
})(window);
