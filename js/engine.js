/* ============================================================================
 * PLACO PRO — Moteur de Calcul Intelligent & Calepinage Réel (DTU 25.41)
 * Compatible navigateur (window.PlacoEngine) et Node.js (module.exports)
 * ============================================================================ */
(function (global) {
  'use strict';

  const C = global.PlacoConstants || (typeof require === 'function' ? require('./constants.js') : null);

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function round2(v) {
    return Math.round((Number(v) || 0) * 100) / 100;
  }

  function round1(v) {
    return Math.round((Number(v) || 0) * 10) / 10;
  }

  function compEnabled(profile, key) {
    return !profile || !profile.components || profile.components[key] !== false;
  }

  /**
   * Calcule la hauteur du mur (en cm) à une abscisse x (en cm) avec interpolation linéaire (rampant/pignon).
   */
  function wallHeightAt(x, lengthCm, hLeftCm, hRightCm) {
    if (lengthCm <= 0) return hLeftCm;
    const t = clamp(x / lengthCm, 0, 1);
    return hLeftCm + (hRightCm - hLeftCm) * t;
  }

  /**
   * Calcule l'aire brute d'un mur trapézoïdal / rectangulaire (en m²).
   */
  function computeWallGrossAreaM2(wall) {
    const L = Math.max(0, Number(wall.lengthCm) || 0);
    const hL = Math.max(0, Number(wall.hLeftCm) || 250);
    const hR = Math.max(0, Number(wall.hRightCm) || hL);
    return (L * ((hL + hR) / 2)) / 10000;
  }

  /**
   * Calcule l'aire totale des ouvertures d'un mur (en m²), bornées dans le mur.
   */
  function computeOpeningsAreaM2(wall) {
    const L = Math.max(0, Number(wall.lengthCm) || 0);
    let areaCm2 = 0;
    (wall.openings || []).forEach((op) => {
      const ox0 = clamp(Number(op.distFromLeftCm) || 0, 0, L);
      const ox1 = clamp(ox0 + Math.max(0, Number(op.widthCm) || 0), 0, L);
      const oy0 = Math.max(0, Number(op.sillHeightCm) || 0);
      const maxH = Math.max(Number(wall.hLeftCm) || 250, Number(wall.hRightCm) || 250);
      const oy1 = clamp(oy0 + Math.max(0, Number(op.heightCm) || 0), 0, maxH);
      areaCm2 += Math.max(0, ox1 - ox0) * Math.max(0, oy1 - oy0);
    });
    return areaCm2 / 10000;
  }

  /**
   * Résout la hauteur de plaque (cm) pour une face donnée.
   */
  function resolvePlateHeightCm(faceSpec, maxWallHeightCm) {
    if (!faceSpec || faceSpec.plateHeight === 'auto' || !faceSpec.plateHeight) {
      return C.suggestPlateHeight(maxWallHeightCm).heightCm;
    }
    return Number(faceSpec.plateHeight) || 250;
  }

  /**
   * Tente de consommer une chute exploitable (> 40 x > 40 cm) dans le pool pour un panneau indépendant (w x h).
   */
  function tryConsumeOffcut(pool, needW, needH) {
    if (!pool || !pool.length) return null;
    // Cherche la plus petite chute qui couvre (needW x needH) ou (needH x needW)
    let bestIdx = -1;
    let bestArea = Infinity;
    for (let i = 0; i < pool.length; i++) {
      const c = pool[i];
      const fitsDirect = c.w >= needW - 0.1 && c.h >= needH - 0.1;
      const fitsRotated = c.h >= needW - 0.1 && c.w >= needH - 0.1;
      if (fitsDirect || fitsRotated) {
        const area = c.w * c.h;
        if (area < bestArea) {
          bestArea = area;
          bestIdx = i;
        }
      }
    }
    if (bestIdx >= 0) {
      return pool.splice(bestIdx, 1)[0];
    }
    return null;
  }

  /**
   * Ajoute une chute au pool uniquement si ses deux dimensions sont strictement exploitables (> 40 cm).
   */
  function pushUsableOffcut(pool, w, h, sourceLabel) {
    if (w > C.MIN_USABLE_OFFCUT_CM && h > C.MIN_USABLE_OFFCUT_CM) {
      pool.push({
        w: round1(w),
        h: round1(h),
        areaM2: round2((w * h) / 10000),
        source: sourceLabel
      });
      return true;
    }
    return false;
  }

  /**
   * Calepinage réel plaque par plaque d'UNE face et d'UNE peau d'un mur.
   *
   * Règles métier chantier respectées :
   *  - Largeur standard plaque = 120 cm.
   *  - Peau 1 : démarrage en plaque entière 120 cm.
   *  - Peau 2 (double peau) : démarrage en demi-plaque 60 cm (décalage des joints de 60 cm).
   *  - Si une ouverture tombe au milieu d'une plaque ou d'un entraxe de 60 cm :
   *    découpe en "L" ou en "U" dans une PLAQUE ENTIÈRE commandée.
   *  - Chutes d'allège, d'imposte ou de fin de mur réutilisées UNIQUEMENT si > 40 cm x > 40 cm.
   */
  function simulateWallFaceCalepinage(wall, faceSpec, skinIndex, offcutPools, faceLabel) {
    const L = Math.max(0, Number(wall.lengthCm) || 0);
    const hL = Math.max(10, Number(wall.hLeftCm) || 250);
    const hR = Math.max(10, Number(wall.hRightCm) || hL);
    const maxWallH = Math.max(hL, hR);
    const plateW = C.PLATE_WIDTH_CM; // 120 cm
    const plateH = resolvePlateHeightCm(faceSpec, maxWallH);
    const plateType = (faceSpec && faceSpec.plateType) || 'std';
    const poolKey = `${plateType}_${plateH}`;
    if (!offcutPools[poolKey]) offcutPools[poolKey] = [];
    const pool = offcutPools[poolKey];

    const openings = (wall.openings || []).map((op) => ({
      id: op.id,
      type: op.type,
      label: op.label || (C.OPENING_TYPES[op.type] ? C.OPENING_TYPES[op.type].shortLabel : 'Ouverture'),
      x0: clamp(Number(op.distFromLeftCm) || 0, 0, L),
      x1: clamp((Number(op.distFromLeftCm) || 0) + Math.max(0, Number(op.widthCm) || 0), 0, L),
      y0: Math.max(0, Number(op.sillHeightCm) || 0),
      y1: Math.max(0, Number(op.sillHeightCm) || 0) + Math.max(0, Number(op.heightCm) || 0)
    }));

    const pieces = [];
    let newPlatesCount = 0;
    let reusedOffcutsCount = 0;
    let netAreaCm2 = 0;
    let orderedPlatesAreaCm2 = 0;
    let verticalJointsCm = 0;
    let horizontalJointsCm = 0;
    const producedOffcuts = [];

    // Construire les rangées verticales (1 rang si maxWallH <= plateH, sinon empilage avec décalage)
    const numCourses = Math.max(1, Math.ceil(maxWallH / plateH));

    for (let courseIdx = 0; courseIdx < numCourses; courseIdx++) {
      const y0 = courseIdx * plateH;
      const y1Cap = Math.min(maxWallH, (courseIdx + 1) * plateH);

      // Décalage horizontal : peau 2 décale de 60 cm ; rang supérieur décale aussi de 60 cm
      const stagger = ((skinIndex - 1) + courseIdx) % 2 === 1;
      const colBounds = [];
      let cx = 0;
      if (stagger && L > 0) {
        const firstW = Math.min(60, L);
        colBounds.push([0, firstW]);
        cx = firstW;
      }
      while (cx < L - 0.01) {
        const nextX = Math.min(L, cx + plateW);
        colBounds.push([cx, nextX]);
        cx = nextX;
      }

      // Joint horizontal entre rangs
      if (courseIdx > 0) {
        // Calcul de la longueur utile du joint horizontal (hors ouvertures qui coupent y0)
        let hjLen = 0;
        for (let ci = 0; ci < colBounds.length; ci++) {
          const [bx0, bx1] = colBounds[ci];
          const midH = wallHeightAt((bx0 + bx1) / 2, L, hL, hR);
          if (midH <= y0) continue;
          let seg = bx1 - bx0;
          openings.forEach((op) => {
            if (op.y0 < y0 && op.y1 > y0) {
              const overlap = Math.max(0, Math.min(bx1, op.x1) - Math.max(bx0, op.x0));
              seg -= overlap;
            }
          });
          hjLen += Math.max(0, seg);
        }
        horizontalJointsCm += hjLen;
      }

      colBounds.forEach(([x0, x1], colIdx) => {
        const colW = x1 - x0;
        const hAtLeft = wallHeightAt(x0, L, hL, hR);
        const hAtRight = wallHeightAt(x1, L, hL, hR);
        const localTopLeft = clamp(hAtLeft, y0, y1Cap);
        const localTopRight = clamp(hAtRight, y0, y1Cap);
        const pieceHLeft = Math.max(0, localTopLeft - y0);
        const pieceHRight = Math.max(0, localTopRight - y0);
        const pieceMaxH = Math.max(pieceHLeft, pieceHRight);
        if (pieceMaxH <= 0.5) return;

        // Joint vertical à droite de la plaque (sauf bout du mur)
        if (colIdx < colBounds.length - 1) {
          let vj = Math.max(0, Math.min(hAtRight, y1Cap) - y0);
          openings.forEach((op) => {
            if (op.x0 < x1 - 0.5 && op.x1 > x1 + 0.5) {
              const overlapY = Math.max(0, Math.min(y0 + vj, op.y1) - Math.max(y0, op.y0));
              vj -= overlapY;
            }
          });
          verticalJointsCm += Math.max(0, vj);
        }

        // Aire trapézoïdale brute de cette travée de plaque
        const colTrapAreaCm2 = colW * ((pieceHLeft + pieceHRight) / 2);

        // Intersections avec les ouvertures
        const cutouts = [];
        let cutoutAreaCm2 = 0;
        openings.forEach((op) => {
          const ix0 = Math.max(x0, op.x0);
          const ix1 = Math.min(x1, op.x1);
          const iy0 = Math.max(y0, op.y0);
          const iy1 = Math.min(y0 + pieceMaxH, op.y1);
          if (ix1 > ix0 + 0.1 && iy1 > iy0 + 0.1) {
            const cw = ix1 - ix0;
            const ch = iy1 - iy0;
            cutouts.push({
              openingId: op.id,
              openingType: op.type,
              label: op.label,
              x0: ix0,
              x1: ix1,
              y0: iy0,
              y1: iy1,
              w: round1(cw),
              h: round1(ch)
            });
            cutoutAreaCm2 += cw * ch;
          }
        });

        const keptAreaCm2 = Math.max(0, colTrapAreaCm2 - cutoutAreaCm2);
        netAreaCm2 += keptAreaCm2;

        // Cas 1 : travée totalement vide (grande baie traversant toute la largeur et hauteur)
        if (keptAreaCm2 <= 10) {
          pieces.push({
            courseIdx, colIdx, x0, x1, y0, y1: y0 + pieceMaxH,
            hLeft: pieceHLeft, hRight: pieceHRight, colW: round1(colW), pieceH: round1(pieceMaxH),
            cutouts, cutType: 'void', fromOffcut: false, newPlateUsed: false,
            netAreaM2: 0, plateAreaM2: 0, reusableOffcut: null
          });
          return;
        }

        // Classifier le type de découpe (full, cut-width, slope, cut-L, cut-U, split-allege-imposte)
        const isSloped = Math.abs(pieceHLeft - pieceHRight) > 1;
        let cutType = 'full';
        let canUseSmallOffcut = false;
        let splitSubPanels = null;

        if (cutouts.length > 0) {
          // Vérifier si une ouverture coupe la plaque de bord à bord sur toute sa largeur (allège + imposte séparées)
          const fullSpanCutout = cutouts.find((ct) => ct.x0 <= x0 + 0.5 && ct.x1 >= x1 - 0.5);
          if (fullSpanCutout) {
            const allegeH = Math.max(0, fullSpanCutout.y0 - y0);
            const imposteH = Math.max(0, (y0 + pieceMaxH) - fullSpanCutout.y1);
            cutType = allegeH > 1 && imposteH > 1 ? 'allege-imposte' : (allegeH > 1 ? 'allege' : 'imposte');
            splitSubPanels = [];
            if (allegeH > 1) splitSubPanels.push({ label: 'Allège', w: colW, h: allegeH, y0: y0, y1: fullSpanCutout.y0 });
            if (imposteH > 1) splitSubPanels.push({ label: 'Imposte', w: colW, h: imposteH, y0: fullSpanCutout.y1, y1: y0 + pieceMaxH });
            canUseSmallOffcut = true;
          } else {
            // Découpe en L ou en U autour de l'ouverture : la plaque reste d'un seul tenant !
            const hasTopAndBottom = cutouts.some((ct) => ct.y0 > y0 + 1 && ct.y1 < (y0 + pieceMaxH) - 1);
            const hasBothSides = cutouts.some((ct) => ct.x0 > x0 + 1 && ct.x1 < x1 - 1);
            cutType = (hasTopAndBottom || hasBothSides) ? 'cut-U' : 'cut-L';
            canUseSmallOffcut = false; // Oblige une plaque entière (sauf si pièce très petite)
          }
        } else {
          if (isSloped) cutType = 'slope';
          else if (colW < plateW - 0.5 || pieceMaxH < plateH - 0.5) cutType = 'cut-width';
          canUseSmallOffcut = (colW < plateW - 5 || pieceMaxH < plateH - 5);
        }

        // Gestion des sous-panneaux indépendants (allège / imposte) quand une baie/fenêtre traverse toute la colonne
        if (splitSubPanels && splitSubPanels.length > 0) {
          let panelsNewPlates = 0;
          let panelsReused = 0;
          splitSubPanels.forEach((sp) => {
            const usedOff = tryConsumeOffcut(pool, sp.w, sp.h);
            if (usedOff) {
              panelsReused++;
              reusedOffcutsCount++;
            } else {
              panelsNewPlates++;
              newPlatesCount++;
              orderedPlatesAreaCm2 += plateW * plateH;
              // Chute restante sur cette nouvelle plaque (hauteur restante si > 40 cm)
              const remH = plateH - sp.h;
              if (pushUsableOffcut(pool, plateW, remH, `${wall.name} (${sp.label})`)) {
                producedOffcuts.push({ w: plateW, h: round1(remH), from: sp.label });
              }
            }
          });
          pieces.push({
            courseIdx, colIdx, x0, x1, y0, y1: y0 + pieceMaxH,
            hLeft: pieceHLeft, hRight: pieceHRight, colW: round1(colW), pieceH: round1(pieceMaxH),
            cutouts, cutType, fromOffcut: panelsReused > 0 && panelsNewPlates === 0,
            newPlateUsed: panelsNewPlates > 0, platesConsumed: panelsNewPlates,
            reusedCount: panelsReused,
            netAreaM2: round2(keptAreaCm2 / 10000),
            plateAreaM2: round2((panelsNewPlates * plateW * plateH) / 10000),
            reusableOffcut: null
          });
          return;
        }

        // Cas normal / Découpe en L ou U / Fin de mur / Rampant
        let fromOffcut = false;
        let newPlateUsed = false;
        let pieceReusableOffcut = null;

        if (canUseSmallOffcut) {
          const used = tryConsumeOffcut(pool, colW, pieceMaxH);
          if (used) {
            fromOffcut = true;
            reusedOffcutsCount++;
          }
        }

        if (!fromOffcut) {
          newPlateUsed = true;
          newPlatesCount++;
          orderedPlatesAreaCm2 += plateW * plateH;

          // 1) Chute de largeur en fin de mur (ou demi-plaque peau 2)
          const remW = plateW - colW;
          if (remW > C.MIN_USABLE_OFFCUT_CM && plateH > C.MIN_USABLE_OFFCUT_CM) {
            if (pushUsableOffcut(pool, remW, plateH, `${wall.name} ${faceLabel} (bande fin)`)) {
              pieceReusableOffcut = { w: round1(remW), h: plateH, reason: 'Chute largeur' };
              producedOffcuts.push(pieceReusableOffcut);
            }
          }
          // 2) Chute de hauteur (si plaque beaucoup plus haute que mur/rang)
          const remH = plateH - pieceMaxH;
          if (remH > C.MIN_USABLE_OFFCUT_CM && colW > C.MIN_USABLE_OFFCUT_CM) {
            if (pushUsableOffcut(pool, colW, remH, `${wall.name} ${faceLabel} (chute hauteur)`)) {
              pieceReusableOffcut = { w: round1(colW), h: round1(remH), reason: 'Chute hauteur' };
              producedOffcuts.push(pieceReusableOffcut);
            }
          }
          // 3) Chute issue d'une découpe d'ouverture (porte/fenêtre) — exploitable UNIQUEMENT si > 40 x > 40 cm
          cutouts.forEach((ct) => {
            if (ct.w > C.MIN_USABLE_OFFCUT_CM && ct.h > C.MIN_USABLE_OFFCUT_CM) {
              // Sur une découpe en L ou U, la chute rectangulaire de la fenêtre/porte est récupérable pour allège/imposte
              if (pushUsableOffcut(pool, ct.w, ct.h, `${wall.name} (découpe ${ct.label})`)) {
                pieceReusableOffcut = { w: ct.w, h: ct.h, reason: `Chute ${ct.label} > 40 cm` };
                producedOffcuts.push(pieceReusableOffcut);
              }
            }
          });
        }

        pieces.push({
          courseIdx, colIdx, x0, x1, y0, y1: y0 + pieceMaxH,
          hLeft: pieceHLeft, hRight: pieceHRight, colW: round1(colW), pieceH: round1(pieceMaxH),
          cutouts, cutType, fromOffcut, newPlateUsed,
          platesConsumed: newPlateUsed ? 1 : 0,
          reusedCount: fromOffcut ? 1 : 0,
          netAreaM2: round2(keptAreaCm2 / 10000),
          plateAreaM2: newPlateUsed ? round2((plateW * plateH) / 10000) : 0,
          reusableOffcut: pieceReusableOffcut
        });
      });
    }

    const netAreaM2 = round2(netAreaCm2 / 10000);
    const orderedAreaM2 = round2(orderedPlatesAreaCm2 / 10000);
    const wasteAreaM2 = round2(Math.max(0, orderedAreaM2 - netAreaM2));
    const wastePct = orderedAreaM2 > 0 ? round1(((orderedAreaM2 - netAreaM2) / orderedAreaM2) * 100) : 0;

    return {
      faceLabel,
      skinIndex,
      plateType,
      plateHeightCm: plateH,
      staggeredStart: skinIndex % 2 === 0,
      pieces,
      newPlatesCount,
      reusedOffcutsCount,
      producedOffcuts,
      netAreaM2,
      orderedAreaM2,
      wasteAreaM2,
      wastePct,
      verticalJointsMl: round2(verticalJointsCm / 100),
      horizontalJointsMl: round2(horizontalJointsCm / 100)
    };
  }

  /**
   * Calcule l'ossature métallique d'un mur (Cloison ou Doublage indépendant ou Doublage Optima 2)
   * + renforts automatiques autour des ouvertures (montants doublés + linteaux + traverses d'allège).
   */
  function computeWallFraming(wall, profile) {
    const L = Math.max(0, Number(wall.lengthCm) || 0);
    const hL = Math.max(10, Number(wall.hLeftCm) || 250);
    const hR = Math.max(10, Number(wall.hRightCm) || hL);
    const maxH = Math.max(hL, hR);
    const avgH = (hL + hR) / 2;
    const topEdgeCm = Math.hypot(L, hR - hL);
    const openings = wall.openings || [];

    // Longueur des passages au sol (allège === 0) à déduire du rail bas / lisse basse & bande résiliente
    let floorOpeningsWidthCm = 0;
    openings.forEach((op) => {
      if ((Number(op.sillHeightCm) || 0) <= 1) {
        floorOpeningsWidthCm += Math.max(0, Number(op.widthCm) || 0);
      }
    });
    const bottomTrackCm = Math.max(0, L - floorOpeningsWidthCm);

    // Cas A : Doublage sur appuis muraux réglables (Optima 2)
    if (profile.category === 'doublage' && profile.doublageSystem === 'optima') {
      const entraxe = 60; // DTU / Optima 2 : fourrures F530 entraxe 60 cm
      const lisseMlRaw = (topEdgeCm + bottomTrackCm) / 100;
      const lisseMl = round2(lisseMlRaw * 1.05);
      const lisseBars = Math.ceil(lisseMl / 3.0);

      // Positions des fourrures F530 verticales
      const furringPositions = [];
      for (let x = 0; x <= L + 0.1; x += entraxe) {
        const pos = Math.min(L, x);
        if (!furringPositions.length || pos - furringPositions[furringPositions.length - 1] > 1) {
          furringPositions.push(pos);
        }
      }
      if (L > 0 && L - furringPositions[furringPositions.length - 1] > 5) {
        furringPositions.push(L);
      }

      // Ajouter les fourrures d'encadrement à gauche et droite de chaque ouverture
      const jambPositions = [];
      let lintelSillF530Cm = 0;
      openings.forEach((op) => {
        const ox0 = clamp(Number(op.distFromLeftCm) || 0, 0, L);
        const ox1 = clamp(ox0 + Math.max(0, Number(op.widthCm) || 0), 0, L);
        jambPositions.push({ x: ox0, reinforced: true });
        jambPositions.push({ x: ox1, reinforced: true });
        lintelSillF530Cm += (ox1 - ox0) + 20; // linteau
        if ((Number(op.sillHeightCm) || 0) > 1) {
          lintelSillF530Cm += (ox1 - ox0) + 20; // allège
        }
      });

      // Filtrer les fourrures courantes qui tombent en plein milieu d'une ouverture haute
      const activeVerticals = [];
      let totalF530Cm = lintelSillF530Cm;
      let appuisCount = 0;
      let eclissesCount = 0;

      furringPositions.forEach((x) => {
        const localH = wallHeightAt(x, L, hL, hR);
        const insideOp = openings.find((op) => {
          const ox0 = Number(op.distFromLeftCm) || 0;
          const ox1 = ox0 + (Number(op.widthCm) || 0);
          return x > ox0 + 8 && x < ox1 - 8;
        });
        if (insideOp) {
          // Fourrure coupée pour allège + imposte uniquement
          const remH = Math.max(0, localH - (Number(insideOp.heightCm) || 0));
          if (remH > 15) {
            totalF530Cm += remH;
            appuisCount += 1;
            activeVerticals.push({ x, h: remH, type: 'cripple' });
          }
        } else {
          totalF530Cm += localH;
          // Optima 2 : 1 appui intermédiaire si h <= 260 cm, 2 appuis si h > 260 cm (tous les ~130 cm)
          const appuisParFourrure = localH > 260 ? 2 : 1;
          appuisCount += appuisParFourrure;
          if (localH > C.BAR_LENGTH_CM) {
            eclissesCount += Math.floor(localH / C.BAR_LENGTH_CM);
          }
          activeVerticals.push({ x, h: localH, type: 'standard', appuis: appuisParFourrure });
        }
      });

      // Fourrures d'encadrement des ouvertures
      jambPositions.forEach((jp) => {
        const localH = wallHeightAt(jp.x, L, hL, hR);
        totalF530Cm += localH;
        appuisCount += localH > 260 ? 2 : 1;
        if (localH > C.BAR_LENGTH_CM) eclissesCount += 1;
        activeVerticals.push({ x: jp.x, h: localH, type: 'jamb' });
      });

      const useF530 = compEnabled(profile, 'f530');
      const useLisses = compEnabled(profile, 'lisses');
      const useAppuis = compEnabled(profile, 'appuis');

      const f530Ml = useF530 ? round2((totalF530Cm / 100) * 1.05) : 0;
      const f530Bars = useF530 ? Math.ceil(f530Ml / 3.0) : 0;
      const finalLisseMl = useLisses ? lisseMl : 0;
      const finalLisseBars = useLisses ? lisseBars : 0;
      const finalAppuis = useAppuis ? appuisCount : 0;
      const finalEclisses = useF530 ? eclissesCount : 0;
      const optimaRange = profile.optimaRange || C.suggestOptimaRange(profile.insulation && profile.insulation.thicknessMm);

      // Chevilles à frapper : 1 tous les 60 cm sur lisses haute/basse + 1 par appui Optima
      const chevillesCount = (useLisses ? Math.ceil((topEdgeCm + bottomTrackCm) / 60) : 0) + finalAppuis;
      // Vis TRPF 13 : raccordements linteaux/allèges + éclisses
      const trpfCount = useF530 ? (openings.length * 8 + finalEclisses * 2) : 0;

      return {
        system: 'optima',
        optimaRange,
        entraxeCm: entraxe,
        lisseMl: finalLisseMl,
        lisseBars: finalLisseBars,
        f530Ml,
        f530Bars,
        appuisCount: finalAppuis,
        eclissesCount: finalEclisses,
        railMl: 0,
        railBars: 0,
        montantMl: 0,
        montantBars: 0,
        studPositions: useF530 ? activeVerticals : [],
        bottomTrackMl: round2(bottomTrackCm / 100),
        resilientTapeMl: 0,
        chevillesCount,
        trpfCount
      };
    }

    // Cas B : Ossature métallique Rails + Montants (Cloison ou Doublage indépendant)
    const section = profile.section || 'M48';
    const entraxe = Number(profile.entraxeCm) || 60;
    const isDoubledStuds = profile.montantType === 'double';
    const studMultiplier = isDoubledStuds ? 2 : 1;

    // Linteaux et traverses d'allège en rail plié (+30 cm pour retours pliés de 15 cm de chaque côté)
    let openingRailsCm = 0;
    openings.forEach((op) => {
      const w = Math.max(0, Number(op.widthCm) || 0);
      openingRailsCm += w + 30; // Linteau obligatoire
      if ((Number(op.sillHeightCm) || 0) > 1) {
        openingRailsCm += w + 30; // Traverse d'allège pour fenêtre
      }
    });

    const railMlRaw = (topEdgeCm + bottomTrackCm + openingRailsCm) / 100;
    const railMl = round2(railMlRaw * 1.05); // +5% chute DTU
    const railBars = Math.ceil(railMl / 3.0);

    // Positions des montants verticaux courants (départ à 0, puis tous les entraxe, plus montant de fin)
    const regularX = [];
    for (let x = 0; x <= L + 0.1; x += entraxe) {
      const pos = Math.min(L, x);
      if (!regularX.length || pos - regularX[regularX.length - 1] > 1) {
        regularX.push(pos);
      }
    }
    if (L > 0 && L - regularX[regularX.length - 1] > 5) {
      regularX.push(L);
    }

    const studPositions = [];
    let totalMontantCm = 0;
    let trpfCount = 0;

    regularX.forEach((x) => {
      const localH = wallHeightAt(x, L, hL, hR);
      const insideOp = openings.find((op) => {
        const ox0 = Number(op.distFromLeftCm) || 0;
        const ox1 = ox0 + (Number(op.widthCm) || 0);
        return x > ox0 + 8 && x < ox1 - 8;
      });
      if (insideOp) {
        // Montants courts (allège sous fenêtre + imposte au-dessus porte/fenêtre)
        const sillH = Math.max(0, Number(insideOp.sillHeightCm) || 0);
        const topOp = sillH + Math.max(0, Number(insideOp.heightCm) || 0);
        const imposteH = Math.max(0, localH - topOp);
        if (sillH > 15) {
          totalMontantCm += sillH;
          trpfCount += 4;
          studPositions.push({ x, h: sillH, y0: 0, type: 'cripple-sill', count: 1 });
        }
        if (imposteH > 15) {
          totalMontantCm += imposteH;
          trpfCount += 4;
          studPositions.push({ x, h: imposteH, y0: topOp, type: 'cripple-lintel', count: 1 });
        }
      } else {
        // Montant toute hauteur (avec éclissage +40 cm si > 300 cm)
        const splicedH = localH > C.BAR_LENGTH_CM ? localH + 40 : localH;
        totalMontantCm += splicedH * studMultiplier;
        trpfCount += 4 * studMultiplier + (isDoubledStuds ? 4 : 0); // sertissage/vissage dos à dos
        studPositions.push({ x, h: localH, y0: 0, type: isDoubledStuds ? 'double' : 'standard', count: studMultiplier });
      }
    });

    // Doublement AUTOMATIQUE des montants de chaque côté des portes, fenêtres et baies
    openings.forEach((op) => {
      const ox0 = clamp(Number(op.distFromLeftCm) || 0, 0, L);
      const ox1 = clamp(ox0 + Math.max(0, Number(op.widthCm) || 0), 0, L);
      [ox0, ox1].forEach((jx) => {
        const localH = wallHeightAt(jx, L, hL, hR);
        const splicedH = localH > C.BAR_LENGTH_CM ? localH + 40 : localH;
        // 2 montants doublés dos à dos de chaque côté de l'ouverture (renfort DTU 25.41)
        totalMontantCm += splicedH * 2;
        trpfCount += 12; // fixation rails + solidarisation dos à dos + pattes linteau
        studPositions.push({ x: jx, h: localH, y0: 0, type: 'opening-doubled', count: 2, openingId: op.id });
      });
    });

    const useRails = compEnabled(profile, 'rails');
    const useMontants = compEnabled(profile, 'montants');
    const useResiliente = compEnabled(profile, 'bandeResiliente');

    const finalRailMl = useRails ? railMl : 0;
    const finalRailBars = useRails ? railBars : 0;
    const montantMl = useMontants ? round2((totalMontantCm / 100) * 1.05) : 0;
    const montantBars = useMontants ? Math.ceil(montantMl / 3.0) : 0;

    // Bande résiliente acoustique sous rails bas de cloisons (si cochée)
    const resilientTapeMl = (profile.category === 'cloison' && useResiliente) ? round2(bottomTrackCm / 100) : 0;

    // Chevilles à frapper : 1 tous les 60 cm sur rail haut et rail bas (hors passages de porte)
    const chevillesCount = useRails ? (Math.ceil(topEdgeCm / 60) + Math.ceil(bottomTrackCm / 60) + 2) : 0;
    const finalTrpfCount = (useRails || useMontants) ? trpfCount : 0;

    return {
      system: 'ossature',
      section,
      entraxeCm: entraxe,
      montantType: profile.montantType || 'simple',
      railMl: finalRailMl,
      railBars: finalRailBars,
      montantMl,
      montantBars,
      lisseMl: 0,
      lisseBars: 0,
      f530Ml: 0,
      f530Bars: 0,
      appuisCount: 0,
      eclissesCount: 0,
      studPositions: useMontants ? studPositions : [],
      bottomTrackMl: round2(bottomTrackCm / 100),
      resilientTapeMl,
      chevillesCount,
      trpfCount: finalTrpfCount,
      openingCount: openings.length,
      avgHeightCm: round1(avgH),
      maxHeightCm: round1(maxH)
    };
  }

  /**
   * Détecte la surface et le périmètre de la pièce depuis les murs du plan (Shoelace sur enveloppe / boucle fermée,
   * ou fallback sur la boîte englobante des murs périphériques).
   */
  function detectPlanRoomGeometry(walls) {
    const planWalls = (walls || []).filter((w) => w.mode !== 'elevation');
    if (!planWalls.length) {
      return { areaM2: 0, perimeterMl: 0, widthCm: 0, depthCm: 0, polygon: [], detectedClosed: false };
    }

    // Tolérance de connexion entre sommets (en cm)
    const SNAP = 18;
    const nodes = [];
    function getOrAddNode(x, y) {
      for (let i = 0; i < nodes.length; i++) {
        if (Math.hypot(nodes[i].x - x, nodes[i].y - y) <= SNAP) {
          return i;
        }
      }
      nodes.push({ x, y });
      return nodes.length - 1;
    }

    // Construire le graphe d'arêtes à partir des murs (priorité aux doublages/périphériques pour le contour externe)
    const adj = new Map();
    const edges = [];
    planWalls.forEach((w) => {
      const a = getOrAddNode(Number(w.x1) || 0, Number(w.y1) || 0);
      const b = getOrAddNode(Number(w.x2) || 0, Number(w.y2) || 0);
      if (a === b) return;
      edges.push({ a, b, w });
      if (!adj.has(a)) adj.set(a, []);
      if (!adj.has(b)) adj.set(b, []);
      adj.get(a).push({ to: b, wall: w });
      adj.get(b).push({ to: a, wall: w });
    });

    // Calcul de la boîte englobante (toujours utile pour le calepinage plafond)
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    nodes.forEach((n) => {
      if (n.x < minX) minX = n.x;
      if (n.x > maxX) maxX = n.x;
      if (n.y < minY) minY = n.y;
      if (n.y > maxY) maxY = n.y;
    });
    const bboxW = Math.max(0, maxX - minX);
    const bboxD = Math.max(0, maxY - minY);

    // Chercher le cycle simple d'aire maximale (contour extérieur de la pièce) par marche à gauche / DFS borné
    let bestPoly = null;
    let bestAreaCm2 = 0;

    function polygonAreaCm2(pts) {
      let s = 0;
      for (let i = 0; i < pts.length; i++) {
        const j = (i + 1) % pts.length;
        s += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
      }
      return Math.abs(s) / 2;
    }

    function dfsCycle(start, current, visited, path) {
      const neighbors = adj.get(current) || [];
      for (let i = 0; i < neighbors.length; i++) {
        const nxt = neighbors[i].to;
        if (nxt === start && path.length >= 3) {
          const pts = path.map((idx) => nodes[idx]);
          const area = polygonAreaCm2(pts);
          if (area > bestAreaCm2) {
            bestAreaCm2 = area;
            bestPoly = pts;
          }
        } else if (!visited.has(nxt) && path.length < 16) {
          visited.add(nxt);
          path.push(nxt);
          dfsCycle(start, nxt, visited, path);
          path.pop();
          visited.delete(nxt);
        }
      }
    }

    if (nodes.length >= 3 && nodes.length <= 24) {
      for (let i = 0; i < nodes.length; i++) {
        const vis = new Set([i]);
        dfsCycle(i, i, vis, [i]);
      }
    }

    if (bestPoly && bestAreaCm2 > 500) {
      let perimCm = 0;
      for (let i = 0; i < bestPoly.length; i++) {
        const a = bestPoly[i];
        const b = bestPoly[(i + 1) % bestPoly.length];
        perimCm += Math.hypot(b.x - a.x, b.y - a.y);
      }
      // Recaler bbox sur bestPoly
      let pMinX = Infinity, pMaxX = -Infinity, pMinY = Infinity, pMaxY = -Infinity;
      bestPoly.forEach((p) => {
        if (p.x < pMinX) pMinX = p.x;
        if (p.x > pMaxX) pMaxX = p.x;
        if (p.y < pMinY) pMinY = p.y;
        if (p.y > pMaxY) pMaxY = p.y;
      });
      return {
        areaM2: round2(bestAreaCm2 / 10000),
        perimeterMl: round2(perimCm / 100),
        widthCm: round1(pMaxX - pMinX),
        depthCm: round1(pMaxY - pMinY),
        polygon: bestPoly,
        detectedClosed: true
      };
    }

    // Fallback rectangle englobant si pièce non fermée
    const fallbackAreaM2 = round2((bboxW * bboxD) / 10000);
    const fallbackPerimMl = round2((2 * (bboxW + bboxD)) / 100);
    return {
      areaM2: fallbackAreaM2,
      perimeterMl: fallbackPerimMl,
      widthCm: round1(bboxW),
      depthCm: round1(bboxD),
      polygon: bboxW > 0 && bboxD > 0 ? [
        { x: minX, y: minY }, { x: maxX, y: minY }, { x: maxX, y: maxY }, { x: minX, y: maxY }
      ] : [],
      detectedClosed: false
    };
  }

  /**
   * Calcule le faux plafond (ossature F530, CR2/lisse, éclisses, suspentes classiques ou Integra 2, plaques, isolant).
   */
  function computeCeiling(project, profilesById, planGeom) {
    const ceil = project.ceiling;
    if (!ceil || !ceil.enabled) return null;

    const profile = profilesById[ceil.profileId] ||
      (project.profiles || []).find((p) => p.category === 'plafond');
    if (!profile) return null;

    let lengthCm, widthCm, areaM2, perimeterMl, polygon;
    if (ceil.autoFromPlan && planGeom && planGeom.areaM2 > 0.1) {
      lengthCm = Math.max(planGeom.widthCm, planGeom.depthCm);
      widthCm = Math.min(planGeom.widthCm, planGeom.depthCm);
      areaM2 = planGeom.areaM2;
      perimeterMl = planGeom.perimeterMl;
      polygon = planGeom.polygon;
    } else {
      lengthCm = Math.max(50, Number(ceil.customLengthCm) || 400);
      widthCm = Math.max(50, Number(ceil.customWidthCm) || 300);
      areaM2 = round2((lengthCm * widthCm) / 10000);
      perimeterMl = round2((2 * (lengthCm + widthCm)) / 100);
      polygon = [{ x: 0, y: 0 }, { x: lengthCm, y: 0 }, { x: lengthCm, y: widthCm }, { x: 0, y: widthCm }];
    }

    const entraxeCm = Number(profile.entraxeCm) || 50; // 50 cm (pose perpendiculaire) ou 60 cm (parallèle)
    const periphType = profile.periphType || 'CR2';
    const suspenteType = profile.suspenteType || 'integra2';

    // Fourrures F530 posées dans le sens de lengthCm, espacées tous les entraxeCm sur widthCm
    const furringYPositions = [];
    // Première fourrure à <= 30 cm du bord (ou entraxe/2)
    const firstOffset = Math.min(30, entraxeCm / 2);
    for (let y = firstOffset; y < widthCm - 5; y += entraxeCm) {
      furringYPositions.push(round1(y));
    }
    if (!furringYPositions.length || (widthCm - furringYPositions[furringYPositions.length - 1]) > 35) {
      furringYPositions.push(round1(Math.max(firstOffset, widthCm - 15)));
    }

    const numFurrings = furringYPositions.length;
    const f530MlRaw = (numFurrings * lengthCm) / 100;
    const f530Ml = round2(f530MlRaw * 1.05);
    const f530Bars = Math.ceil(f530Ml / 3.0);

    // Éclisses F530 : 1 raccord à chaque jonction de barre 3 m sur chaque ligne
    const splicesPerLine = Math.max(0, Math.ceil(lengthCm / C.BAR_LENGTH_CM) - 1);
    const eclissesCount = numFurrings * splicesPerLine;

    // Suspentes : 1 tous les 120 cm max le long de chaque fourrure (première/dernière à <= 30 cm des bords)
    const suspenteXPositions = [];
    const maxStep = 120;
    const startX = Math.min(30, lengthCm / 4);
    const endX = Math.max(startX, lengthCm - 30);
    const span = Math.max(0, endX - startX);
    const intervals = Math.max(1, Math.ceil(span / maxStep));
    for (let i = 0; i <= intervals; i++) {
      suspenteXPositions.push(round1(startX + (span * i) / intervals));
    }
    const suspentesPerLine = suspenteXPositions.length;
    const suspentesCount = numFurrings * suspentesPerLine;
    const suspentesPerM2 = areaM2 > 0 ? round2(suspentesCount / areaM2) : 0;

    // Cornières périphériques CR2 ou Lisses
    const periphMl = round2(perimeterMl * 1.05);
    const periphBars = Math.ceil(periphMl / 3.0);
    const chevillesCount = Math.ceil((perimeterMl * 100) / 60) + (suspenteType === 'classique_tige' ? suspentesCount : 0);

    // Tiges filetées M6 (si suspentes classiques sur tige)
    const plenumCm = Math.max(10, Number(profile.plenumCm) || 20);
    const tigesM6Ml = suspenteType === 'classique_tige' ? round2((suspentesCount * (plenumCm + 5)) / 100) : 0;
    const tigesM6Bars1m = Math.ceil(tigesM6Ml);

    // Longueur Integra 2
    const insulThick = (profile.insulation && profile.insulation.enabled) ? (Number(profile.insulation.thicknessMm) || 200) : 100;
    const integraLength = profile.integraLength || C.suggestIntegraLength(insulThick);

    // Plaques de plafond (120 cm de large, joints décalés en quinconce)
    const faceA = profile.faceA || { skins: 1, plateType: 'std', plateHeight: 'auto' };
    const skins = Number(faceA.skins) || 1;
    const plateType = faceA.plateType || 'std';
    // Choix hauteur plaque plafond (par défaut 250 cm ou choisie)
    const plateH = faceA.plateHeight === 'auto' ? 250 : (Number(faceA.plateHeight) || 250);
    const plateAreaM2 = (C.PLATE_WIDTH_CM * plateH) / 10000;

    // Calepinage 2D des plaques plafond (rangées de 120 cm dans widthCm, décalage demi-plaque un rang sur deux)
    const rows = Math.max(1, Math.ceil(widthCm / C.PLATE_WIDTH_CM));
    const boardTiles = [];
    let platesPerSkin = 0;
    let ceilingJointsCm = 0;

    for (let r = 0; r < rows; r++) {
      const y0 = r * C.PLATE_WIDTH_CM;
      const y1 = Math.min(widthCm, (r + 1) * C.PLATE_WIDTH_CM);
      if (r > 0) ceilingJointsCm += lengthCm; // Joint longitudinal entre rangs
      let cx = 0;
      const stagger = r % 2 === 1;
      if (stagger && lengthCm > 60) {
        const fw = Math.min(plateH / 2, lengthCm);
        boardTiles.push({ x0: 0, x1: fw, y0, y1, row: r });
        cx = fw;
        platesPerSkin += 1;
        if (cx < lengthCm) ceilingJointsCm += (y1 - y0);
      }
      while (cx < lengthCm - 0.1) {
        const nx = Math.min(lengthCm, cx + plateH);
        boardTiles.push({ x0: cx, x1: nx, y0, y1, row: r });
        platesPerSkin += 1;
        if (nx < lengthCm - 0.1) ceilingJointsCm += (y1 - y0);
        cx = nx;
      }
    }
    const useF530 = compEnabled(profile, 'f530');
    const usePeriph = compEnabled(profile, 'periph');
    const useSuspentes = compEnabled(profile, 'suspentes');
    const useParement = compEnabled(profile, 'faceA');

    // Si la pièce n'est pas rectangulaire (aire réelle < bbox), ajuster proportionnellement avec 6% de chute
    const bboxAreaM2 = (lengthCm * widthCm) / 10000;
    const shapeFactor = bboxAreaM2 > 0 ? clamp(areaM2 / bboxAreaM2, 0.4, 1.0) : 1;
    const platesPerSkinAdj = Math.max(Math.ceil((areaM2 * 1.07) / plateAreaM2), Math.round(platesPerSkin * shapeFactor));
    const totalPlates = useParement ? (platesPerSkinAdj * skins) : 0;
    const orderedAreaM2 = useParement ? round2(totalPlates * plateAreaM2) : 0;
    const wastePct = (useParement && orderedAreaM2 > 0) ? round1(((orderedAreaM2 - areaM2 * skins) / orderedAreaM2) * 100) : 0;

    // Bandes papier : joints entre plaques + cueillie périphérique plafond/murs
    const bandePapierMl = useParement ? round2((ceilingJointsCm / 100) + perimeterMl) : 0;

    // Vis TTPC : 13.5 vis/m² par peau
    const ttpc25 = useParement ? Math.ceil(areaM2 * 13.5) : 0;
    const ttpc35 = (useParement && skins >= 2) ? Math.ceil(areaM2 * 13.5) : 0;
    const finalF530Ml = useF530 ? f530Ml : 0;
    const finalF530Bars = useF530 ? f530Bars : 0;
    const finalEclisses = useF530 ? eclissesCount : 0;
    const finalPeriphMl = usePeriph ? periphMl : 0;
    const finalPeriphBars = usePeriph ? periphBars : 0;
    const finalSuspentes = useSuspentes ? suspentesCount : 0;
    const finalSuspPerM2 = (useSuspentes && areaM2 > 0) ? suspentesPerM2 : 0;
    const finalTigesMl = useSuspentes ? tigesM6Ml : 0;
    const finalTigesBars = useSuspentes ? tigesM6Bars1m : 0;
    const finalChevilles = (usePeriph ? Math.ceil((perimeterMl * 100) / 60) : 0) + (useSuspentes && suspenteType === 'classique_tige' ? finalSuspentes : 0);
    const trpf13 = useF530 ? (finalEclisses * 2 + numFurrings * 2) : 0;

    return {
      profile,
      lengthCm: round1(lengthCm),
      widthCm: round1(widthCm),
      areaM2,
      netParementAreaM2: useParement ? areaM2 * skins : 0,
      perimeterMl,
      polygon,
      entraxeCm,
      periphType,
      suspenteType,
      integraLength,
      plenumCm,
      furringYPositions: useF530 ? furringYPositions : [],
      suspenteXPositions: useSuspentes ? suspenteXPositions : [],
      boardTiles: useParement ? boardTiles : [],
      numFurrings: useF530 ? numFurrings : 0,
      f530Ml: finalF530Ml,
      f530Bars: finalF530Bars,
      periphMl: finalPeriphMl,
      periphBars: finalPeriphBars,
      eclissesCount: finalEclisses,
      suspentesCount: finalSuspentes,
      suspentesPerM2: finalSuspPerM2,
      tigesM6Ml: finalTigesMl,
      tigesM6Bars1m: finalTigesBars,
      chevillesCount: finalChevilles,
      plateType,
      plateHeightCm: plateH,
      skins: useParement ? skins : 0,
      totalPlates,
      orderedAreaM2,
      wastePct,
      bandePapierMl,
      ttpc25,
      ttpc35,
      trpf13,
      insulation: profile.insulation && profile.insulation.enabled ? {
        material: profile.insulation.material,
        thicknessMm: Number(profile.insulation.thicknessMm) || 200,
        netAreaM2: areaM2
      } : null
    };
  }

  /**
   * Compte les angles rentrants et sortants à partir du plan 2D (pour bandes papier et bandes armées).
   */
  function detectPlanCorners(walls) {
    const planWalls = (walls || []).filter((w) => w.mode !== 'elevation');
    const SNAP = 18;
    const clusters = [];
    planWalls.forEach((w) => {
      [{ x: w.x1, y: w.y1, h: w.hLeftCm }, { x: w.x2, y: w.y2, h: w.hRightCm }].forEach((pt) => {
        let found = clusters.find((c) => Math.hypot(c.x - pt.x, c.y - pt.y) <= SNAP);
        if (!found) {
          found = { x: pt.x, y: pt.y, count: 0, maxH: pt.h || 250 };
          clusters.push(found);
        }
        found.count++;
        found.maxH = Math.max(found.maxH, pt.h || 250);
      });
    });

    let insideCornersMl = 0;
    let outsideCornersMl = 0;
    clusters.forEach((c) => {
      if (c.count === 2) {
        // Angle standard à 2 murs : 1 angle rentrant intérieur
        insideCornersMl += c.maxH / 100;
      } else if (c.count >= 3) {
        // Jonction en T ou croix : 2 angles rentrants
        insideCornersMl += (2 * c.maxH) / 100;
      } else if (c.count === 1) {
        // Extrémité libre de cloison : 2 angles sortants en bande armée
        outsideCornersMl += (2 * c.maxH) / 100;
      }
    });
    return {
      insideCornersMl: round2(insideCornersMl),
      outsideCornersMl: round2(outsideCornersMl)
    };
  }

  /**
   * Calcule l'ensemble d'un chantier Placo Pro (calepinage complet + ossatures + consommables + liste de commande).
   */
  function calculateProject(project) {
    const profiles = project.profiles || [];
    const profilesById = {};
    profiles.forEach((p) => { profilesById[p.id] = p; });

    const walls = project.walls || [];
    const offcutPools = {}; // Pool partagé par (plateType_plateHeight)
    const wallResults = [];

    // Accumulateurs globaux
    const platesMap = {};       // key: `${plateType}_${plateHeightCm}` -> { plateType, plateHeightCm, qty, areaM2 }
    const railsMap = {};        // section -> { section, ml, bars }
    const montantsMap = {};     // section -> { section, ml, bars }
    const optimaAppuisMap = {}; // range -> count
    const insulationMap = {};   // key: `${material}_${thicknessMm}` -> { material, thicknessMm, netAreaM2 }

    let totalF530Ml = 0;
    let totalF530Bars = 0;
    let totalLisseClipMl = 0;
    let totalLisseClipBars = 0;
    let totalCR2Ml = 0;
    let totalCR2Bars = 0;
    let totalEclissesF530 = 0;

    let totalTtpc25 = 0;
    let totalTtpc35 = 0;
    let totalTtpc45 = 0;
    let totalTrpf13 = 0;
    let totalChevilles = 0;

    let totalBandePapierMl = 0;
    let totalBandeArmeeMl = 0;
    let totalBandeResilienteMl = 0;

    let totalNetSurfaceM2 = 0;
    let totalOrderedPlateAreaM2 = 0;
    let totalPlatesCount = 0;
    let totalReusedOffcuts = 0;
    let totalOpeningsCount = 0;

    const dtuAlerts = [];

    function addPlates(plateType, plateHeightCm, qty) {
      if (qty <= 0) return;
      const key = `${plateType}_${plateHeightCm}`;
      if (!platesMap[key]) {
        platesMap[key] = { plateType, plateHeightCm, qty: 0, plateAreaM2: round2((C.PLATE_WIDTH_CM * plateHeightCm) / 10000) };
      }
      platesMap[key].qty += qty;
    }

    function addInsulation(insul, netAreaM2) {
      if (!insul || !insul.enabled || netAreaM2 <= 0) return;
      const mat = insul.material || 'laine_coton';
      const thick = Number(insul.thicknessMm) || 60;
      const key = `${mat}_${thick}`;
      if (!insulationMap[key]) {
        insulationMap[key] = { material: mat, thicknessMm: thick, netAreaM2: 0 };
      }
      insulationMap[key].netAreaM2 = round2(insulationMap[key].netAreaM2 + netAreaM2);
    }

    // 1. Calcul mur par mur (uniquement les murs affectés à un gabarit actif)
    walls.forEach((wall) => {
      const profile = wall.profileId ? profilesById[wall.profileId] : null;
      if (!profile) return;

      const grossAreaM2 = round2(computeWallGrossAreaM2(wall));
      const openingsAreaM2 = round2(computeOpeningsAreaM2(wall));
      const netWallAreaM2 = round2(Math.max(0, grossAreaM2 - openingsAreaM2));
      const maxH = Math.max(Number(wall.hLeftCm) || 250, Number(wall.hRightCm) || 250);

      totalOpeningsCount += (wall.openings || []).length;

      // Vérifications / conseils DTU 25.41
      if (profile.category === 'cloison' && profile.section === 'M48' && maxH > 260 && profile.montantType !== 'double' && compEnabled(profile, 'montants')) {
        dtuAlerts.push({
          level: 'warning',
          wallId: wall.id,
          wallName: wall.name,
          message: `DTU 25.41 : ${wall.name} (H = ${maxH} cm) en M48 simple dépasse 2,60 m. Envisagez des montants M48 doublés dos à dos ou une ossature M70.`
        });
      }
      if (profile.category === 'doublage' && profile.doublageSystem === 'optima' && profile.insulation && profile.insulation.enabled && compEnabled(profile, 'appuis')) {
        const rangeObj = C.OPTIMA_RANGES.find((r) => r.id === profile.optimaRange);
        if (rangeObj && profile.insulation.thicknessMm > rangeObj.maxInsulMm) {
          dtuAlerts.push({
            level: 'warning',
            wallId: wall.id,
            wallName: wall.name,
            message: `${wall.name} : isolant ${profile.insulation.thicknessMm} mm > plage appuis Optima 2 (${profile.optimaRange} mm).`
          });
        }
      }

      // Simuler chaque face cochée et chaque peau
      const facesToCalc = [];
      if (profile.category === 'cloison') {
        if (compEnabled(profile, 'faceA')) {
          facesToCalc.push({ key: 'faceA', label: 'Face A', spec: profile.faceA || { skins: 1, plateType: 'std', plateHeight: 'auto' } });
        }
        if (compEnabled(profile, 'faceB')) {
          facesToCalc.push({ key: 'faceB', label: 'Face B', spec: profile.faceB || { skins: 1, plateType: 'std', plateHeight: 'auto' } });
        }
      } else {
        if (compEnabled(profile, 'faceA')) {
          facesToCalc.push({ key: 'faceA', label: 'Face Parement', spec: profile.faceA || { skins: 1, plateType: 'std', plateHeight: 'auto' } });
        }
      }

      const faceCalepinages = [];
      let wallPlatesTotal = 0;
      let wallOrderedAreaM2 = 0;
      let wallNetFacesAreaM2 = 0;
      let wallReusedOffcuts = 0;
      let wallJointsPapierMl = 0;

      facesToCalc.forEach((f) => {
        const skinsCount = Number(f.spec.skins) || 1;
        for (let s = 1; s <= skinsCount; s++) {
          const sim = simulateWallFaceCalepinage(wall, f.spec, s, offcutPools, `${f.label} — Peau ${s}`);
          faceCalepinages.push({
            faceKey: f.key,
            faceLabel: f.label,
            skinIndex: s,
            ...sim
          });

          addPlates(sim.plateType, sim.plateHeightCm, sim.newPlatesCount);
          wallPlatesTotal += sim.newPlatesCount;
          wallOrderedAreaM2 += sim.orderedAreaM2;
          wallNetFacesAreaM2 += sim.netAreaM2;
          wallReusedOffcuts += sim.reusedOffcutsCount;

          // Vis TTPC par peau (13,5 vis/m² — dans la fourchette DTU 12 à 15 vis/m²)
          if (s === 1) totalTtpc25 += Math.ceil(sim.netAreaM2 * 13.5);
          else if (s === 2) totalTtpc35 += Math.ceil(sim.netAreaM2 * 13.5);
          else totalTtpc45 += Math.ceil(sim.netAreaM2 * 13.5);

          // Bandes à joints papier uniquement sur la peau de finition (dernière peau)
          if (s === skinsCount) {
            wallJointsPapierMl += sim.verticalJointsMl + sim.horizontalJointsMl;
            // Cueillie plafond (si pas déjà comptée via faux plafond)
            wallJointsPapierMl += round2(Math.hypot(Number(wall.lengthCm) || 0, (wall.hRightCm || 250) - (wall.hLeftCm || 250)) / 100);
          }
        }
      });

      // Bandes armées : tableaux + linteaux de toutes les ouvertures sur chaque face finie
      let wallBandeArmeeMl = 0;
      (wall.openings || []).forEach((op) => {
        const wM = (Number(op.widthCm) || 0) / 100;
        const hM = (Number(op.heightCm) || 0) / 100;
        const hasSill = (Number(op.sillHeightCm) || 0) > 1;
        // Pour un doublage : 2 montants de tableau + 1 linteau (+ 1 appui si fenêtre) ; pour une cloison : encadrement 2 faces si baie libre
        if (op.type === 'baie') {
          wallBandeArmeeMl += (2 * hM + wM) * facesToCalc.length;
        } else if (profile.category === 'doublage') {
          wallBandeArmeeMl += 2 * hM + wM + (hasSill ? wM : 0);
        } else {
          // Bloc-porte ou fenêtre en cloison : 1 tour d'encadrement léger si besoin
          wallBandeArmeeMl += hasSill ? (2 * hM + 2 * wM) : 0;
        }
      });

      // Ossature métallique & renforts
      const framing = computeWallFraming(wall, profile);
      if (framing.system === 'optima') {
        totalF530Ml += framing.f530Ml;
        totalF530Bars += framing.f530Bars;
        totalLisseClipMl += framing.lisseMl;
        totalLisseClipBars += framing.lisseBars;
        totalEclissesF530 += framing.eclissesCount;
        if (framing.appuisCount > 0) {
          optimaAppuisMap[framing.optimaRange] = (optimaAppuisMap[framing.optimaRange] || 0) + framing.appuisCount;
        }
      } else {
        const sec = framing.section;
        if (framing.railMl > 0) {
          if (!railsMap[sec]) railsMap[sec] = { section: sec, ml: 0, bars: 0 };
          railsMap[sec].ml = round2(railsMap[sec].ml + framing.railMl);
          railsMap[sec].bars += framing.railBars;
        }
        if (framing.montantMl > 0) {
          if (!montantsMap[sec]) montantsMap[sec] = { section: sec, ml: 0, bars: 0 };
          montantsMap[sec].ml = round2(montantsMap[sec].ml + framing.montantMl);
          montantsMap[sec].bars += framing.montantBars;
        }
      }

      totalTrpf13 += framing.trpfCount;
      totalChevilles += framing.chevillesCount;
      totalBandeResilienteMl += framing.resilientTapeMl;
      totalBandePapierMl += wallJointsPapierMl;
      totalBandeArmeeMl += wallBandeArmeeMl;

      // Isolation du mur (décompte des ouvertures !)
      addInsulation(profile.insulation, netWallAreaM2);

      totalNetSurfaceM2 += wallNetFacesAreaM2;
      totalOrderedPlateAreaM2 += wallOrderedAreaM2;
      totalPlatesCount += wallPlatesTotal;
      totalReusedOffcuts += wallReusedOffcuts;

      const wallWastePct = wallOrderedAreaM2 > 0
        ? round1(((wallOrderedAreaM2 - wallNetFacesAreaM2) / wallOrderedAreaM2) * 100)
        : 0;

      wallResults.push({
        wall,
        profile,
        grossAreaM2,
        openingsAreaM2,
        netWallAreaM2,
        wallNetFacesAreaM2: round2(wallNetFacesAreaM2),
        wallOrderedAreaM2: round2(wallOrderedAreaM2),
        wallPlatesTotal,
        wallReusedOffcuts,
        wallWastePct,
        faceCalepinages,
        framing,
        wallJointsPapierMl: round2(wallJointsPapierMl),
        wallBandeArmeeMl: round2(wallBandeArmeeMl)
      });
    });

    // 2. Angles rentrants / sortants du plan (uniquement si murs affectés avec parement actif)
    const activeParementWalls = wallResults.filter((wr) => wr.faceCalepinages.length > 0).map((wr) => wr.wall);
    const corners = detectPlanCorners(activeParementWalls);
    totalBandePapierMl += corners.insideCornersMl;
    totalBandeArmeeMl += corners.outsideCornersMl;

    // 3. Faux plafond
    const planGeom = detectPlanRoomGeometry(walls);
    const ceilingResult = computeCeiling(project, profilesById, planGeom);
    if (ceilingResult) {
      addPlates(ceilingResult.plateType, ceilingResult.plateHeightCm, ceilingResult.totalPlates);
      totalPlatesCount += ceilingResult.totalPlates;
      totalNetSurfaceM2 += ceilingResult.netParementAreaM2 != null ? ceilingResult.netParementAreaM2 : (ceilingResult.areaM2 * ceilingResult.skins);
      totalOrderedPlateAreaM2 += ceilingResult.orderedAreaM2;

      totalF530Ml += ceilingResult.f530Ml;
      totalF530Bars += ceilingResult.f530Bars;
      if (ceilingResult.periphType === 'CR2') {
        totalCR2Ml += ceilingResult.periphMl;
        totalCR2Bars += ceilingResult.periphBars;
      } else {
        totalLisseClipMl += ceilingResult.periphMl;
        totalLisseClipBars += ceilingResult.periphBars;
      }
      totalEclissesF530 += ceilingResult.eclissesCount;
      totalTtpc25 += ceilingResult.ttpc25;
      totalTtpc35 += ceilingResult.ttpc35;
      totalTrpf13 += ceilingResult.trpf13;
      totalChevilles += ceilingResult.chevillesCount;
      totalBandePapierMl += ceilingResult.bandePapierMl;

      if (ceilingResult.insulation) {
        addInsulation(
          { enabled: true, material: ceilingResult.insulation.material, thicknessMm: ceilingResult.insulation.thicknessMm },
          ceilingResult.insulation.netAreaM2
        );
      }
    }

    // Recalculer le nombre de barres 3m de manière agrégée (évite le sur-arrondi excessif mur par mur tout en gardant +5% chute)
    Object.values(railsMap).forEach((r) => { r.bars = Math.ceil(r.ml / 3.0); });
    Object.values(montantsMap).forEach((m) => { m.bars = Math.ceil(m.ml / 3.0); });
    totalF530Bars = totalF530Ml > 0 ? Math.ceil(totalF530Ml / 3.0) : 0;
    totalLisseClipBars = totalLisseClipMl > 0 ? Math.ceil(totalLisseClipMl / 3.0) : 0;
    totalCR2Bars = totalCR2Ml > 0 ? Math.ceil(totalCR2Ml / 3.0) : 0;

    // 4. Consommables globaux & conditionnements
    const prefs = project.consumablePrefs || {};
    const marginFactor = 1 + (Number(prefs.safetyMarginPct) || 0) / 100;
    const ttpcBoxSize = Number(prefs.ttpcBoxSize) || 1000;
    const enduitUnit = prefs.enduitUnit || 'sac25';

    const bandePapierMlTotal = round2(totalBandePapierMl);
    const bandePapierRouleaux = bandePapierMlTotal > 0 ? Math.ceil(bandePapierMlTotal / 150) : 0;

    const bandeArmeeMlTotal = round2(totalBandeArmeeMl);
    const bandeArmeeRouleaux = bandeArmeeMlTotal > 0 ? Math.ceil(bandeArmeeMlTotal / 30) : 0;

    const totalBandeAllMl = bandePapierMlTotal + bandeArmeeMlTotal;
    const enduitKg = round1(totalBandeAllMl * 0.35); // 0,35 kg/ml pour 3 passes
    const enduitPackKg = enduitUnit === 'seau20' ? 20 : 25;
    const enduitPacks = enduitKg > 0 ? Math.ceil(enduitKg / enduitPackKg) : 0;

    const bandeResilienteMlTotal = round2(totalBandeResilienteMl);
    const bandeResilienteRouleaux = bandeResilienteMlTotal > 0 ? Math.ceil(bandeResilienteMlTotal / 30) : 0;

    const ttpc25Boxes = totalTtpc25 > 0 ? Math.ceil(totalTtpc25 / ttpcBoxSize) : 0;
    const ttpc35Boxes = totalTtpc35 > 0 ? Math.ceil(totalTtpc35 / ttpcBoxSize) : 0;
    const ttpc45Boxes = totalTtpc45 > 0 ? Math.ceil(totalTtpc45 / 500) : 0;
    const trpf13Boxes = totalTrpf13 > 0 ? Math.ceil(totalTrpf13 / 500) : 0;
    const chevillesBoxes = totalChevilles > 0 ? Math.ceil(totalChevilles / 100) : 0;

    // 5. Construction de la Liste de Commande regroupée par famille
    const overrides = project.manualOverrides || {};

    function makeOrderItem(id, designation, detail, baseQty, unit, rawInfo) {
      const autoQty = baseQty > 0 ? Math.ceil(baseQty * marginFactor) : 0;
      const hasOverride = Object.prototype.hasOwnProperty.call(overrides, id) && overrides[id] !== null && overrides[id] !== '';
      const finalQty = hasOverride ? Math.max(0, Number(overrides[id])) : autoQty;
      return {
        id,
        designation,
        detail,
        baseQty,
        autoQty,
        qty: finalQty,
        unit,
        rawInfo: rawInfo || '',
        isOverridden: hasOverride
      };
    }

    // Famille 1 : Plaques de plâtre
    const plateItems = Object.values(platesMap)
      .sort((a, b) => a.plateType.localeCompare(b.plateType) || a.plateHeightCm - b.plateHeightCm)
      .map((p) => {
        const pt = C.PLATE_TYPES[p.plateType] || C.PLATE_TYPES.std;
        const totalM2 = round2(p.qty * p.plateAreaM2);
        return makeOrderItem(
          `plate_${p.plateType}_${p.plateHeightCm}`,
          `${pt.name} — 120 × ${p.plateHeightCm} cm`,
          `Surface plaque : ${p.plateAreaM2} m² (Total : ${totalM2} m²)`,
          p.qty,
          'plaques',
          `${totalM2} m²`
        );
      });

    // Famille 2 : Ossature métallique
    const framingItems = [];
    Object.values(railsMap).sort((a, b) => a.section.localeCompare(b.section)).forEach((r) => {
      const sec = C.FRAME_SECTIONS[r.section];
      framingItems.push(makeOrderItem(
        `rail_${r.section}`,
        `${sec ? sec.rail : 'Rail ' + r.section} — Barre 3,00 m`,
        `Rails hauts/bas (hors portes) + linteaux/allèges + 5%`,
        r.bars,
        'barres 3 m',
        `${r.ml} ml`
      ));
    });
    Object.values(montantsMap).sort((a, b) => a.section.localeCompare(b.section)).forEach((m) => {
      const sec = C.FRAME_SECTIONS[m.section];
      framingItems.push(makeOrderItem(
        `montant_${m.section}`,
        `${sec ? sec.montant : 'Montant ' + m.section} — Barre 3,00 m`,
        `Montants courants + renforts doublés ouvertures + 5%`,
        m.bars,
        'barres 3 m',
        `${m.ml} ml`
      ));
    });
    if (totalF530Bars > 0) {
      framingItems.push(makeOrderItem(
        'fourrure_f530',
        'Fourrure F530 — Barre 3,00 m',
        'Doublage Optima 2 et/ou Faux plafond (+5% chute)',
        totalF530Bars,
        'barres 3 m',
        `${round2(totalF530Ml)} ml`
      ));
    }
    if (totalLisseClipBars > 0) {
      framingItems.push(makeOrderItem(
        'lisse_clip',
        'Lisse haute/basse (type Lisse Clip) — Barre 3,00 m',
        'Doublage Optima 2 / périphérie plafond (+5% chute)',
        totalLisseClipBars,
        'barres 3 m',
        `${round2(totalLisseClipMl)} ml`
      ));
    }
    if (totalCR2Bars > 0) {
      framingItems.push(makeOrderItem(
        'corniere_cr2',
        'Cornière périphérique CR2 — Barre 3,00 m',
        'Périphérie faux plafond (+5% chute)',
        totalCR2Bars,
        'barres 3 m',
        `${round2(totalCR2Ml)} ml`
      ));
    }

    // Famille 3 : Accessoires & Fixations
    const accessoryItems = [];
    if (ceilingResult && ceilingResult.suspentesCount > 0) {
      if (ceilingResult.suspenteType === 'integra2') {
        accessoryItems.push(makeOrderItem(
          `suspente_integra2_${ceilingResult.integraLength}`,
          `Suspentes à piquer Integra 2 (${ceilingResult.integraLength} mm)`,
          `Entraxe max 1,20 m (~${ceilingResult.suspentesPerM2}/m²) + têtes clipsables`,
          ceilingResult.suspentesCount,
          'unités',
          `${ceilingResult.suspentesPerM2}/m²`
        ));
      } else if (ceilingResult.suspenteType === 'classique_tige') {
        accessoryItems.push(makeOrderItem(
          'suspente_pivot_f530',
          'Pivots / Cavaliers F530 pour tige M6',
          `Entraxe max 1,20 m (~${ceilingResult.suspentesPerM2}/m²)`,
          ceilingResult.suspentesCount,
          'unités',
          `${ceilingResult.suspentesPerM2}/m²`
        ));
        accessoryItems.push(makeOrderItem(
          'tige_filetee_m6',
          'Tiges filetées M6 — Longueur 1,00 m',
          `Plénum ${ceilingResult.plenumCm} cm (${ceilingResult.tigesM6Ml} ml utiles)`,
          ceilingResult.tigesM6Bars1m,
          'barres 1 m',
          `${ceilingResult.tigesM6Ml} ml`
        ));
        accessoryItems.push(makeOrderItem(
          'cheville_laiton_m6',
          'Chevilles laiton / bascule M6 + écrous',
          'Ancrage plafond pour tiges filetées M6',
          ceilingResult.suspentesCount,
          'unités',
          ''
        ));
      } else {
        accessoryItems.push(makeOrderItem(
          'suspente_classique_bois',
          'Suspentes classiques F530 (fixation solives bois)',
          `Entraxe max 1,20 m (~${ceilingResult.suspentesPerM2}/m²)`,
          ceilingResult.suspentesCount,
          'unités',
          `${ceilingResult.suspentesPerM2}/m²`
        ));
      }
    }

    Object.entries(optimaAppuisMap).forEach(([range, count]) => {
      if (count > 0) {
        accessoryItems.push(makeOrderItem(
          `optima_appui_${range}`,
          `Appuis muraux réglables Optima 2 (${range} mm)`,
          '1 à 2 appuis par fourrure F530 selon hauteur + encadrements',
          count,
          'unités',
          ''
        ));
      }
    });

    if (totalEclissesF530 > 0) {
      accessoryItems.push(makeOrderItem(
        'eclisse_f530',
        'Éclisses de raccordement pour fourrure F530',
        'Jonctions entre barres de 3,00 m',
        totalEclissesF530,
        'unités',
        ''
      ));
    }

    if (ttpc25Boxes > 0) {
      accessoryItems.push(makeOrderItem(
        'vis_ttpc_25',
        `Vis TTPC 25 mm — Boîte de ${ttpcBoxSize}`,
        `1ère peau / simple peau (~${totalTtpc25} vis estimées à 13,5 vis/m²)`,
        ttpc25Boxes,
        `boîte(s) de ${ttpcBoxSize}`,
        `${totalTtpc25} vis`
      ));
    }
    if (ttpc35Boxes > 0) {
      accessoryItems.push(makeOrderItem(
        'vis_ttpc_35',
        `Vis TTPC 35 mm — Boîte de ${ttpcBoxSize}`,
        `2ème peau / double peau (~${totalTtpc35} vis estimées)`,
        ttpc35Boxes,
        `boîte(s) de ${ttpcBoxSize}`,
        `${totalTtpc35} vis`
      ));
    }
    if (ttpc45Boxes > 0) {
      accessoryItems.push(makeOrderItem(
        'vis_ttpc_45',
        'Vis TTPC 45 mm — Boîte de 500',
        `3ème peau / ossature bois (~${totalTtpc45} vis estimées)`,
        ttpc45Boxes,
        'boîte(s) de 500',
        `${totalTtpc45} vis`
      ));
    }
    if (trpf13Boxes > 0) {
      accessoryItems.push(makeOrderItem(
        'vis_trpf_13',
        'Vis TRPF 13 mm (autoforeuses métal/métal) — Boîte de 500',
        `Assemblages rails/montants, doublages dos à dos, linteaux (~${totalTrpf13} vis)`,
        trpf13Boxes,
        'boîte(s) de 500',
        `${totalTrpf13} vis`
      ));
    }
    if (chevillesBoxes > 0) {
      accessoryItems.push(makeOrderItem(
        'chevilles_frapper',
        'Chevilles à frapper Ø6×40 mm — Boîte de 100',
        `Fixation rails / lisses / CR2 tous les 60 cm (~${totalChevilles} u.)`,
        chevillesBoxes,
        'boîte(s) de 100',
        `${totalChevilles} u.`
      ));
    }

    // Famille 4 : Isolation thermique et acoustique
    const insulationItems = Object.values(insulationMap)
      .sort((a, b) => (a.material === 'laine_coton' ? -1 : 1) || a.thicknessMm - b.thicknessMm)
      .map((ins) => {
        const matInfo = C.INSULATION_MATERIALS[ins.material] || C.INSULATION_MATERIALS.laine_coton;
        const m2WithCut = round2(ins.netAreaM2 * 1.05); // +5% découpe isolant
        const m2PerPack = (matInfo.m2PerPack && matInfo.m2PerPack[ins.thicknessMm]) || 6.0;
        const packs = Math.ceil(m2WithCut / m2PerPack);
        return makeOrderItem(
          `insul_${ins.material}_${ins.thicknessMm}`,
          `${matInfo.name} — Ép. ${ins.thicknessMm} mm`,
          `Surface nette hors ouvertures : ${ins.netAreaM2} m² (+5% = ${m2WithCut} m² | ${m2PerPack} m²/${matInfo.packLabel.replace('(s)', '').replace('(x)', '')})`,
          packs,
          matInfo.packLabel,
          `${m2WithCut} m²`
        );
      });

    // Famille 5 : Finitions & Étanchéité acoustique
    const finishItems = [];
    if (bandePapierRouleaux > 0) {
      finishItems.push(makeOrderItem(
        'bande_papier_150',
        'Bande à joints papier — Rouleau 150 ml',
        `Joints verticaux + horizontaux + cueillies + angles rentrants (${bandePapierMlTotal} ml)`,
        bandePapierRouleaux,
        'rouleau(x) 150 ml',
        `${bandePapierMlTotal} ml`
      ));
    }
    if (bandeArmeeRouleaux > 0) {
      finishItems.push(makeOrderItem(
        'bande_armee_30',
        'Bande armée — Rouleau 30 ml',
        `Angles sortants + tableaux & linteaux d'ouvertures (${bandeArmeeMlTotal} ml)`,
        bandeArmeeRouleaux,
        'rouleau(x) 30 ml',
        `${bandeArmeeMlTotal} ml`
      ));
    }
    if (enduitPacks > 0) {
      finishItems.push(makeOrderItem(
        `enduit_joints_${enduitUnit}`,
        enduitUnit === 'seau20' ? 'Enduit à joints prêt à l\'emploi — Seau 20 kg' : 'Enduit à joints poudre — Sac 25 kg',
        `3 passes sur ${round1(totalBandeAllMl)} ml de bandes (0,35 kg/ml = ${enduitKg} kg)`,
        enduitPacks,
        enduitUnit === 'seau20' ? 'seau(x) 20 kg' : 'sac(s) 25 kg',
        `${enduitKg} kg`
      ));
    }
    if (bandeResilienteRouleaux > 0) {
      finishItems.push(makeOrderItem(
        'bande_resiliente_30',
        'Bande résiliente acoustique — Rouleau 30 ml',
        `Désolidarisation sous rails bas cloisons hors portes (${bandeResilienteMlTotal} ml)`,
        bandeResilienteRouleaux,
        'rouleau(x) 30 ml',
        `${bandeResilienteMlTotal} ml`
      ));
    }

    const orderGroups = [
      { id: 'plaques', title: '1. Plaques de plâtre (DTU 25.41)', icon: 'layers', items: plateItems },
      { id: 'ossature', title: '2. Ossature métallique (Barres 3,00 m)', icon: 'grid', items: framingItems },
      { id: 'accessoires', title: '3. Accessoires, Suspentes & Visserie', icon: 'wrench', items: accessoryItems },
      { id: 'isolation', title: '4. Isolation thermique & acoustique', icon: 'shield', items: insulationItems },
      { id: 'finitions', title: '5. Finitions, Bandes & Enduits', icon: 'sparkles', items: finishItems }
    ];

    const globalWastePct = totalOrderedPlateAreaM2 > 0
      ? round1(((totalOrderedPlateAreaM2 - totalNetSurfaceM2) / totalOrderedPlateAreaM2) * 100)
      : 0;

    return {
      wallResults,
      ceilingResult,
      planGeom,
      corners,
      dtuAlerts,
      summary: {
        wallsCount: walls.length,
        openingsCount: totalOpeningsCount,
        totalNetSurfaceM2: round2(totalNetSurfaceM2),
        totalOrderedPlateAreaM2: round2(totalOrderedPlateAreaM2),
        totalPlatesCount,
        totalReusedOffcuts,
        globalWastePct,
        bandePapierMlTotal,
        bandeArmeeMlTotal,
        enduitKg,
        bandeResilienteMlTotal,
        totalTtpc25,
        totalTtpc35,
        totalTrpf13,
        totalChevilles
      },
      orderGroups
    };
  }

  const PlacoEngine = {
    wallHeightAt,
    computeWallGrossAreaM2,
    computeOpeningsAreaM2,
    resolvePlateHeightCm,
    simulateWallFaceCalepinage,
    computeWallFraming,
    detectPlanRoomGeometry,
    computeCeiling,
    detectPlanCorners,
    calculateProject
  };

  global.PlacoEngine = PlacoEngine;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = PlacoEngine;
  }
})(typeof window !== 'undefined' ? window : globalThis);
