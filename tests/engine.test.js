'use strict';

const assert = require('assert');
// Charger les modules en simulant globalThis
require('../js/constants.js');
const C = globalThis.PlacoConstants;
const Engine = require('../js/engine.js');

let passed = 0;
function test(name, fn) {
  try {
    fn();
    console.log('  [OK]', name);
    passed++;
  } catch (err) {
    console.error('  [FAIL]', name, '\n   ', err.message);
    process.exitCode = 1;
  }
}

console.log('=== Placo Pro — Suite de tests moteur DTU 25.41 ===');

test('Suggestion hauteur optimale de plaque selon HSP', () => {
  assert.strictEqual(C.suggestPlateHeight(248).heightCm, 250);
  assert.strictEqual(C.suggestPlateHeight(250).zeroHorizontalJoint, true);
  assert.strictEqual(C.suggestPlateHeight(258).heightCm, 260);
  assert.strictEqual(C.suggestPlateHeight(275).heightCm, 280);
  assert.strictEqual(C.suggestPlateHeight(295).heightCm, 300);
  assert.strictEqual(C.suggestPlateHeight(340).zeroHorizontalJoint, false);
});

test('Règle découpe L/U : une fenêtre au milieu des plaques commande bien des plaques entières', () => {
  // Mur 360 x 250 cm = exactement 3 travées de 120 cm.
  // Fenêtre de 120 x 125 cm centrée à x=120..240 ou chevauchant x=60..180 (coupe en L/U deux plaques !)
  const wall = {
    id: 'w-lu',
    name: 'Mur Fenêtre',
    mode: 'elevation',
    lengthCm: 360,
    hLeftCm: 250,
    hRightCm: 250,
    openings: [{ id: 'f1', type: 'fenetre', label: 'Fenêtre', distFromLeftCm: 60, widthCm: 120, heightCm: 125, sillHeightCm: 90 }]
  };
  const sim = Engine.simulateWallFaceCalepinage(wall, { skins: 1, plateType: 'std', plateHeight: 250 }, 1, {}, 'Face A');
  // 3 travées de 120 cm, les 2 premières ont une découpe en L/U -> DOIT commander 3 plaques entières !
  assert.strictEqual(sim.newPlatesCount, 3, `Attendu 3 plaques entières, obtenu ${sim.newPlatesCount}`);
  assert.ok(sim.pieces[0].cutType === 'cut-L' || sim.pieces[0].cutType === 'cut-U');
  assert.ok(sim.pieces[1].cutType === 'cut-L' || sim.pieces[1].cutType === 'cut-U');
  assert.ok(sim.wastePct > 10, 'Le taux de chute réel doit refléter la découpe fenêtre');
});

test('Double peau : décalage d’une demi-plaque de 60 cm sur la peau 2', () => {
  const wall = { id: 'w-dp', name: 'Cloison DP', mode: 'elevation', lengthCm: 300, hLeftCm: 250, hRightCm: 250, openings: [] };
  const sim1 = Engine.simulateWallFaceCalepinage(wall, { skins: 2, plateType: 'std', plateHeight: 250 }, 1, {}, 'Face A P1');
  const sim2 = Engine.simulateWallFaceCalepinage(wall, { skins: 2, plateType: 'std', plateHeight: 250 }, 2, {}, 'Face A P2');
  assert.strictEqual(sim1.staggeredStart, false);
  assert.strictEqual(sim1.pieces[0].colW, 120);
  assert.strictEqual(sim2.staggeredStart, true);
  assert.strictEqual(sim2.pieces[0].colW, 60, 'La 2e peau doit démarrer avec une demi-plaque de 60 cm');
});

test('Réutilisation des chutes strictement > 40 cm uniquement', () => {
  // Mur 1 de 150 cm -> 1 plaque 120 + 1 bande 30 cm -> chute de 90 cm (> 40 cm !) ajoutée au pool
  // Mur 2 de 80 cm -> doit réutiliser la chute de 90 cm (0 nouvelle plaque !)
  const pool = {};
  const w1 = { id: 'w1', name: 'M1', lengthCm: 150, hLeftCm: 250, hRightCm: 250, openings: [] };
  const w2 = { id: 'w2', name: 'M2', lengthCm: 80, hLeftCm: 250, hRightCm: 250, openings: [] };
  const s1 = Engine.simulateWallFaceCalepinage(w1, { skins: 1, plateType: 'std', plateHeight: 250 }, 1, pool, 'M1');
  const s2 = Engine.simulateWallFaceCalepinage(w2, { skins: 1, plateType: 'std', plateHeight: 250 }, 1, pool, 'M2');
  assert.strictEqual(s1.newPlatesCount, 2);
  assert.strictEqual(s2.reusedOffcutsCount, 1, 'La chute de 90x250 cm doit être réutilisée pour M2 (80 cm)');
  assert.strictEqual(s2.newPlatesCount, 0);

  // Mur 3 de 220 cm -> 120 + 100 -> reste seulement 20 cm (<= 40 cm !) -> NE DOIT PAS entrer dans le pool
  const poolSmall = {};
  const w3 = { id: 'w3', name: 'M3', lengthCm: 220, hLeftCm: 250, hRightCm: 250, openings: [] };
  Engine.simulateWallFaceCalepinage(w3, { skins: 1, plateType: 'std', plateHeight: 250 }, 1, poolSmall, 'M3');
  assert.strictEqual(poolSmall.std_250.length, 0, 'Une chute de 20 cm ne doit jamais être considérée réutilisable');
});

test('Ossature cloison : déduction porte au rail bas + doublement automatique montants ouverture', () => {
  const prof = C.createDefaultProfiles().find((p) => p.category === 'cloison');
  const wallNoOp = { id: 'a', name: 'A', lengthCm: 300, hLeftCm: 250, hRightCm: 250, openings: [] };
  const wallWithDoor = {
    id: 'b', name: 'B', lengthCm: 300, hLeftCm: 250, hRightCm: 250,
    openings: [{ id: 'd1', type: 'porte', distFromLeftCm: 100, widthCm: 83, heightCm: 204, sillHeightCm: 0 }]
  };
  const fNoOp = Engine.computeWallFraming(wallNoOp, prof);
  const fDoor = Engine.computeWallFraming(wallWithDoor, prof);

  assert.ok(fDoor.bottomTrackMl < fNoOp.bottomTrackMl, 'Le passage de porte doit être déduit du rail bas');
  assert.strictEqual(fDoor.resilientTapeMl, fDoor.bottomTrackMl, 'Bande résiliente déduit aussi le passage de porte');
  const doubledJambs = fDoor.studPositions.filter((s) => s.type === 'opening-doubled');
  assert.strictEqual(doubledJambs.length, 2, '2 montants doublés (gauche + droite) autour de la porte');
  assert.ok(fDoor.montantMl > fNoOp.montantMl, 'Les renforts doublés augmentent le métrage de montants');
});

test('Doublage Optima 2 : 1 appui/fourrure ≤ 260 cm, 2 appuis/fourrure > 260 cm', () => {
  const prof = C.createDefaultProfiles().find((p) => p.category === 'doublage');
  const w250 = { id: 'o1', name: 'O1', lengthCm: 300, hLeftCm: 250, hRightCm: 250, openings: [] };
  const w290 = { id: 'o2', name: 'O2', lengthCm: 300, hLeftCm: 290, hRightCm: 290, openings: [] };
  const f250 = Engine.computeWallFraming(w250, prof);
  const f290 = Engine.computeWallFraming(w290, prof);
  assert.strictEqual(f250.system, 'optima');
  assert.strictEqual(f290.appuisCount, f250.appuisCount * 2, 'À 290 cm (>260 cm), il faut 2 appuis Optima par fourrure F530');
});

test('Mur rampant / pignon (hLeft ≠ hRight) : calcul aire trapèze exact', () => {
  const wall = { id: 'r1', name: 'Pignon', lengthCm: 400, hLeftCm: 180, hRightCm: 320, openings: [] };
  const area = Engine.computeWallGrossAreaM2(wall);
  assert.strictEqual(area, 10, 'Aire trapèze 4m x (1.8+3.2)/2 = 10.0 m²');
});

test('Chantier vierge par défaut : tout strictement à zéro', () => {
  const blank = C.createBlankProject();
  assert.strictEqual(blank.clientName, '');
  assert.strictEqual(blank.address, '');
  assert.strictEqual(blank.date, '');
  assert.strictEqual(blank.walls.length, 0);
  assert.strictEqual(blank.ceiling.enabled, false);
  const res = Engine.calculateProject(blank);
  assert.strictEqual(res.summary.wallsCount, 0);
  assert.strictEqual(res.summary.openingsCount, 0);
  assert.strictEqual(res.summary.totalPlatesCount, 0);
  assert.strictEqual(res.summary.totalNetSurfaceM2, 0);
  assert.strictEqual(res.ceilingResult, null);
  const totalOrderLines = res.orderGroups.reduce((s, g) => s + g.items.length, 0);
  assert.strictEqual(totalOrderLines, 0, 'La liste de commande d’un chantier vierge doit être strictement vide');
});

test('Chantier complet multi-variantes (Optima A + Optima B Hydro + Cloison + Plafond)', () => {
  const proj = C.createBlankProject();
  proj.clientName = 'Test Intégration';
  const dbB = C.createBlankVariant('doublage', 1); // Variante B Hydro 60 mm
  proj.profiles.push(dbB);

  proj.walls = [
    { id: 'w1', name: 'Mur 1', mode: 'plan', x1: 80, y1: 80, x2: 560, y2: 80, lengthCm: 480, hLeftCm: 250, hRightCm: 250, profileId: 'prof-doublage-a', openings: [{ id: 'op1', type: 'fenetre', label: 'F1', distFromLeftCm: 110, widthCm: 120, heightCm: 125, sillHeightCm: 90 }] },
    { id: 'w2', name: 'Mur 2', mode: 'plan', x1: 560, y1: 80, x2: 560, y2: 430, lengthCm: 350, hLeftCm: 250, hRightCm: 250, profileId: 'prof-doublage-a', openings: [] },
    { id: 'w3', name: 'Mur 3', mode: 'plan', x1: 560, y1: 430, x2: 80, y2: 430, lengthCm: 480, hLeftCm: 250, hRightCm: 250, profileId: dbB.id, openings: [{ id: 'op2', type: 'porte', label: 'P1', distFromLeftCm: 95, widthCm: 93, heightCm: 204, sillHeightCm: 0 }] },
    { id: 'w4', name: 'Mur 4', mode: 'plan', x1: 80, y1: 430, x2: 80, y2: 80, lengthCm: 350, hLeftCm: 250, hRightCm: 250, profileId: 'prof-doublage-a', openings: [] },
    { id: 'w5', name: 'Cloison', mode: 'plan', x1: 360, y1: 80, x2: 360, y2: 430, lengthCm: 350, hLeftCm: 250, hRightCm: 250, profileId: 'prof-cloison-a', openings: [{ id: 'op3', type: 'porte', label: 'P2', distFromLeftCm: 130, widthCm: 83, heightCm: 204, sillHeightCm: 0 }] }
  ];
  proj.ceiling.enabled = true;
  proj.ceiling.profileId = 'prof-plafond-a';
  const res = Engine.calculateProject(proj);

  assert.strictEqual(res.planGeom.detectedClosed, true, 'La pièce test doit être détectée fermée');
  assert.strictEqual(res.planGeom.areaM2, 16.8, 'Pièce 4.80 m × 3.50 m = 16.80 m²');
  assert.ok(res.ceilingResult && res.ceilingResult.suspentesPerM2 >= 1.8 && res.ceilingResult.suspentesPerM2 <= 3.2,
    `Densité suspentes réaliste attendue, obtenu ${res.ceilingResult?.suspentesPerM2}`);
  assert.ok(res.summary.totalPlatesCount > 20, 'Total plaques cohérent pour 5 murs + plafond');

  // Vérifier que les 2 variantes (Std + Hydro) sont bien présentes dans la commande
  const plateGrp = res.orderGroups.find((g) => g.id === 'plaques');
  assert.ok(plateGrp.items.some((i) => i.id.startsWith('plate_std_')), 'Plaques BA13 Std présentes');
  assert.ok(plateGrp.items.some((i) => i.id.startsWith('plate_hydro_')), 'Plaques BA13 Hydro (Variante B) présentes');
});

test('Cases à cocher composants (décocher Rails / Face B / Bande résiliente / Mur non affecté)', () => {
  const proj = C.createBlankProject();
  const cloison = proj.profiles.find((p) => p.id === 'prof-cloison-a');
  cloison.components.rails = false;
  cloison.components.faceB = false;
  cloison.components.bandeResiliente = false;
  cloison.insulation.enabled = false;

  proj.walls = [
    { id: 'w1', name: 'Cloison partielle', mode: 'elevation', lengthCm: 240, hLeftCm: 250, hRightCm: 250, profileId: 'prof-cloison-a', openings: [] },
    { id: 'w2', name: 'Mur décoché', mode: 'elevation', lengthCm: 400, hLeftCm: 250, hRightCm: 250, profileId: null, openings: [] }
  ];

  const res = Engine.calculateProject(proj);
  assert.strictEqual(res.wallResults.length, 1, 'Le mur non affecté (profileId: null) est exclu du calcul');
  assert.strictEqual(res.summary.totalPlatesCount, 2, 'Seulement Face A (2 plaques sur 240 cm) car Face B est décochée');
  assert.strictEqual(res.summary.bandeResilienteMlTotal, 0, 'Bande résiliente à 0 car décochée');
  const ossGrp = res.orderGroups.find((g) => g.id === 'ossature');
  assert.ok(!ossGrp.items.some((i) => i.id.startsWith('rail_')), 'Aucun rail commandé quand Rails est décoché');
  assert.ok(ossGrp.items.some((i) => i.id.startsWith('montant_')), 'Montants toujours commandés');
  const insGrp = res.orderGroups.find((g) => g.id === 'isolation');
  assert.strictEqual(insGrp.items.length, 0, 'Aucun isolant commandé quand Isolant est décoché');
});

console.log(`\nRésultat : ${passed} tests exécutés.`);
