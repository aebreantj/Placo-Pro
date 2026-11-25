/* ============================================================================
 * PLACO PRO — Constantes & Référentiel Technique DTU 25.41
 * ============================================================================ */
(function (global) {
  'use strict';

  const PLATE_WIDTH_CM = 120;
  const PLATE_HEIGHTS_CM = [250, 260, 280, 300];
  const BAR_LENGTH_CM = 300; // Barres standards 3,00 m
  const MIN_USABLE_OFFCUT_CM = 40; // Chute réutilisable uniquement si > 40 cm x > 40 cm

  const PLATE_TYPES = {
    std: {
      id: 'std',
      code: 'BA13 Std',
      name: 'BA13 Standard (Blanche)',
      shortName: 'BA13 Standard',
      color: '#CBD5E1',
      fill: 'rgba(226, 232, 240, 0.22)',
      stroke: '#E2E8F0',
      badgeBg: '#334155',
      badgeText: '#F8FAFC',
      usage: 'Pièces sèches courantes'
    },
    hydro: {
      id: 'hydro',
      code: 'BA13 Hydro H1',
      name: 'BA13 Hydrofuge H1 (Verte)',
      shortName: 'BA13 Hydro H1',
      color: '#22C55E',
      fill: 'rgba(34, 197, 94, 0.22)',
      stroke: '#22C55E',
      badgeBg: 'rgba(34, 197, 94, 0.18)',
      badgeText: '#4ADE80',
      usage: 'Pièces humides (SdB, cuisine, cellier)'
    },
    feu: {
      id: 'feu',
      code: 'BA13 Feu',
      name: 'BA13 Ignifugée / Feu (Rose/Rouge)',
      shortName: 'BA13 Feu (PPF)',
      color: '#F43F5E',
      fill: 'rgba(244, 63, 94, 0.22)',
      stroke: '#FB7185',
      badgeBg: 'rgba(244, 63, 94, 0.18)',
      badgeText: '#FDA4AF',
      usage: 'Protection incendie, poêle, garage'
    },
    acoustique: {
      id: 'acoustique',
      code: 'BA13 Phonique',
      name: 'BA13 Acoustique / Phonique (Bleue)',
      shortName: 'BA13 Phonique',
      color: '#38BDF8',
      fill: 'rgba(56, 189, 248, 0.22)',
      stroke: '#38BDF8',
      badgeBg: 'rgba(56, 189, 248, 0.18)',
      badgeText: '#7DD3FC',
      usage: 'Isolation phonique renforcée (+3 dB)'
    },
    haute_durete: {
      id: 'haute_durete',
      code: 'BA13 HD',
      name: 'BA13 Haute dureté (Jaune)',
      shortName: 'BA13 Haute Dureté',
      color: '#F5C518',
      fill: 'rgba(245, 197, 24, 0.22)',
      stroke: '#F5C518',
      badgeBg: 'rgba(245, 197, 24, 0.18)',
      badgeText: '#FDE047',
      usage: 'Zones de passage, charges lourdes, chocs'
    }
  };

  const FRAME_SECTIONS = {
    M48: { id: 'M48', rail: 'Rail R48', montant: 'Montant M48', widthMm: 48, defaultInsulMm: 45 },
    M70: { id: 'M70', rail: 'Rail R70', montant: 'Montant M70', widthMm: 70, defaultInsulMm: 60 },
    M90: { id: 'M90', rail: 'Rail R90', montant: 'Montant M90', widthMm: 90, defaultInsulMm: 80 },
    M100: { id: 'M100', rail: 'Rail R100', montant: 'Montant M100', widthMm: 100, defaultInsulMm: 100 }
  };

  const OPTIMA_RANGES = [
    { id: '15-45', label: '15–45 mm (isolant ≤ 45 mm)', maxInsulMm: 45 },
    { id: '45-75', label: '45–75 mm (isolant 50–75 mm)', maxInsulMm: 75 },
    { id: '75-120', label: '75–120 mm (isolant 80–120 mm)', maxInsulMm: 120 },
    { id: '120-160', label: '120–160 mm (isolant 120–160 mm)', maxInsulMm: 160 }
  ];

  const SUSPENTE_TYPES = {
    classique_bois: {
      id: 'classique_bois',
      label: 'Suspentes classiques F530 (solives bois)',
      shortLabel: 'Suspentes F530 bois'
    },
    classique_tige: {
      id: 'classique_tige',
      label: 'Pivots F530 + Tiges filetées M6 + Chevilles laiton/bascule',
      shortLabel: 'Pivots + Tiges M6'
    },
    integra2: {
      id: 'integra2',
      label: 'Suspentes à piquer spéciales isolation (type Integra 2)',
      shortLabel: 'Suspentes Integra 2'
    }
  };

  const INTEGRA2_LENGTHS = [
    { id: '160-200', label: 'Integra 2 — 160 à 200 mm (isolant ≤ 160 mm)', minInsul: 0, maxInsul: 160 },
    { id: '200-240', label: 'Integra 2 — 200 à 240 mm (isolant 160–200 mm)', minInsul: 161, maxInsul: 200 },
    { id: '240-300', label: 'Integra 2 — 240 à 300 mm (isolant > 200 mm)', minInsul: 201, maxInsul: 300 }
  ];

  const INSULATION_MATERIALS = {
    laine_coton: {
      id: 'laine_coton',
      name: 'Laine de coton biosourcée',
      priority: true,
      unitType: 'panneaux/rouleaux',
      packLabel: 'paquet(s)',
      // m² réalistes par paquet/rouleau selon épaisseur (ex: Métisse / Cotonwool)
      m2PerPack: { 45: 10.8, 50: 10.8, 60: 9.0, 75: 7.2, 80: 7.2, 100: 5.4, 120: 4.5, 145: 3.6, 200: 2.88 }
    },
    laine_verre: {
      id: 'laine_verre',
      name: 'Laine de verre',
      priority: false,
      unitType: 'rouleaux/panneaux',
      packLabel: 'rouleau(x)',
      m2PerPack: { 45: 15.0, 50: 14.4, 60: 12.0, 75: 10.8, 80: 9.6, 100: 7.2, 120: 6.48, 145: 5.4, 200: 4.32 }
    },
    laine_roche: {
      id: 'laine_roche',
      name: 'Laine de roche',
      priority: false,
      unitType: 'panneaux',
      packLabel: 'paquet(s)',
      m2PerPack: { 45: 11.52, 50: 10.8, 60: 8.64, 75: 7.2, 80: 6.48, 100: 5.4, 120: 4.32, 145: 3.6, 200: 2.88 }
    },
    fibre_bois: {
      id: 'fibre_bois',
      name: 'Fibre de bois',
      priority: false,
      unitType: 'panneaux',
      packLabel: 'paquet(s)',
      m2PerPack: { 45: 8.4, 50: 8.4, 60: 7.0, 75: 5.6, 80: 5.6, 100: 4.2, 120: 3.5, 145: 2.8, 200: 2.1 }
    }
  };

  const INSULATION_THICKNESSES_WALL = [45, 50, 60, 75, 80, 100, 120, 145];
  const INSULATION_THICKNESSES_CEILING = [45, 50, 60, 75, 80, 100, 120, 145, 200];

  const OPENING_TYPES = {
    porte: {
      id: 'porte',
      label: 'Bloc-porte',
      shortLabel: 'Porte',
      defaultWidthCm: 83,
      defaultHeightCm: 204,
      defaultSillCm: 0,
      color: '#F5C518',
      presets: [
        { label: '73 × 204', w: 73, h: 204, s: 0 },
        { label: '83 × 204', w: 83, h: 204, s: 0 },
        { label: '93 × 204 (PMR)', w: 93, h: 204, s: 0 }
      ]
    },
    fenetre: {
      id: 'fenetre',
      label: 'Fenêtre',
      shortLabel: 'Fenêtre',
      defaultWidthCm: 120,
      defaultHeightCm: 125,
      defaultSillCm: 90,
      color: '#38BDF8',
      presets: [
        { label: '60 × 75 (all. 140)', w: 60, h: 75, s: 140 },
        { label: '100 × 125 (all. 90)', w: 100, h: 125, s: 90 },
        { label: '120 × 125 (all. 90)', w: 120, h: 125, s: 90 },
        { label: '140 × 135 (all. 85)', w: 140, h: 135, s: 85 }
      ]
    },
    porte_fenetre: {
      id: 'porte_fenetre',
      label: 'Porte-fenêtre',
      shortLabel: 'P.-Fenêtre',
      defaultWidthCm: 120,
      defaultHeightCm: 215,
      defaultSillCm: 0,
      color: '#22D3EE',
      presets: [
        { label: '90 × 215', w: 90, h: 215, s: 0 },
        { label: '120 × 215', w: 120, h: 215, s: 0 },
        { label: '180 × 215 (Baie)', w: 180, h: 215, s: 0 },
        { label: '240 × 215 (Baie)', w: 240, h: 215, s: 0 }
      ]
    },
    baie: {
      id: 'baie',
      label: 'Baie libre',
      shortLabel: 'Baie',
      defaultWidthCm: 140,
      defaultHeightCm: 210,
      defaultSillCm: 0,
      color: '#A78BFA',
      presets: [
        { label: '90 × 210', w: 90, h: 210, s: 0 },
        { label: '140 × 210', w: 140, h: 210, s: 0 },
        { label: '200 × 215', w: 200, h: 215, s: 0 }
      ]
    }
  };

  // Profils d'ouvrages DTU 25.41 par défaut réutilisables sur le plan
  function createDefaultProfiles() {
    return [
      {
        id: 'prof-cloison-72-48',
        category: 'cloison',
        name: 'Cloison 72/48 — BA13 Std + Coton 50',
        color: '#E2E8F0',
        section: 'M48',
        entraxeCm: 60,
        montantType: 'simple',
        faceA: { skins: 1, plateType: 'std', plateHeight: 'auto' },
        faceB: { skins: 1, plateType: 'std', plateHeight: 'auto' },
        insulation: { enabled: true, material: 'laine_coton', thicknessMm: 50 }
      },
      {
        id: 'prof-cloison-98-70-phon',
        category: 'cloison',
        name: 'Cloison 98/70 — Acoustique / Hydro SdB',
        color: '#38BDF8',
        section: 'M70',
        entraxeCm: 60,
        montantType: 'simple',
        faceA: { skins: 1, plateType: 'acoustique', plateHeight: 'auto' },
        faceB: { skins: 1, plateType: 'hydro', plateHeight: 'auto' },
        insulation: { enabled: true, material: 'laine_coton', thicknessMm: 60 }
      },
      {
        id: 'prof-cloison-98-48-dp',
        category: 'cloison',
        name: 'Cloison 98/48 Double Peau — Phonique',
        color: '#818CF8',
        section: 'M48',
        entraxeCm: 60,
        montantType: 'double',
        faceA: { skins: 2, plateType: 'std', plateHeight: 'auto' },
        faceB: { skins: 2, plateType: 'std', plateHeight: 'auto' },
        insulation: { enabled: true, material: 'laine_coton', thicknessMm: 50 }
      },
      {
        id: 'prof-doublage-optima-100',
        category: 'doublage',
        name: 'Doublage Optima 2 — Coton 100 + BA13 Std',
        color: '#F5C518',
        doublageSystem: 'optima',
        section: 'M48',
        entraxeCm: 60,
        montantType: 'simple',
        optimaRange: '75-120',
        faceA: { skins: 1, plateType: 'std', plateHeight: 'auto' },
        insulation: { enabled: true, material: 'laine_coton', thicknessMm: 100 }
      },
      {
        id: 'prof-doublage-optima-hydro',
        category: 'doublage',
        name: 'Doublage Optima 2 — Coton 80 + BA13 Hydro',
        color: '#22C55E',
        doublageSystem: 'optima',
        section: 'M48',
        entraxeCm: 60,
        montantType: 'simple',
        optimaRange: '75-120',
        faceA: { skins: 1, plateType: 'hydro', plateHeight: 'auto' },
        insulation: { enabled: true, material: 'laine_coton', thicknessMm: 80 }
      },
      {
        id: 'prof-doublage-indep-70',
        category: 'doublage',
        name: 'Doublage Ossature M70 — Coton 80 + BA13 Std',
        color: '#FB923C',
        doublageSystem: 'independant',
        section: 'M70',
        entraxeCm: 60,
        montantType: 'simple',
        optimaRange: '75-120',
        faceA: { skins: 1, plateType: 'std', plateHeight: 'auto' },
        insulation: { enabled: true, material: 'laine_coton', thicknessMm: 80 }
      },
      {
        id: 'prof-plafond-integra',
        category: 'plafond',
        name: 'Faux Plafond F530 — Integra 2 + Coton 200',
        color: '#38BDF8',
        entraxeCm: 50,
        periphType: 'CR2',
        suspenteType: 'integra2',
        integraLength: '200-240',
        plenumCm: 25,
        faceA: { skins: 1, plateType: 'std', plateHeight: 'auto' },
        insulation: { enabled: true, material: 'laine_coton', thicknessMm: 200 }
      },
      {
        id: 'prof-plafond-classique',
        category: 'plafond',
        name: 'Faux Plafond F530 — Suspentes Bois + BA13 Hydro',
        color: '#22C55E',
        entraxeCm: 60,
        periphType: 'CR2',
        suspenteType: 'classique_bois',
        integraLength: '160-200',
        plenumCm: 15,
        faceA: { skins: 1, plateType: 'hydro', plateHeight: 'auto' },
        insulation: { enabled: true, material: 'laine_coton', thicknessMm: 100 }
      }
    ];
  }

  // Chantier totalement vierge (état initial systématique à l'ouverture)
  function createBlankProject() {
    return {
      id: 'draft-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6),
      savedId: null,
      clientName: '',
      address: '',
      date: '',
      defaultHeightCm: 250,
      consumablePrefs: {
        enduitUnit: 'sac25', // 'sac25' | 'seau20'
        ttpcBoxSize: 1000,   // 500 | 1000
        safetyMarginPct: 0   // 0 | 5 | 10
      },
      profiles: createDefaultProfiles(),
      walls: [],
      ceiling: {
        enabled: false,
        profileId: 'prof-plafond-integra',
        autoFromPlan: true,
        customLengthCm: 0,
        customWidthCm: 0
      },
      manualOverrides: {}
    };
  }

  function suggestPlateHeight(maxHeightCm) {
    const h = Math.max(10, Number(maxHeightCm) || 250);
    for (let i = 0; i < PLATE_HEIGHTS_CM.length; i++) {
      if (PLATE_HEIGHTS_CM[i] >= h) {
        return {
          heightCm: PLATE_HEIGHTS_CM[i],
          zeroHorizontalJoint: true,
          reason: `Hauteur ${Math.round(h)} cm ≤ ${PLATE_HEIGHTS_CM[i]} cm : pose toute hauteur sans joint horizontal.`
        };
      }
    }
    // > 300 cm : choisir la hauteur qui minimise les chutes sur 2 rangs
    let bestH = 250;
    let bestWaste = Infinity;
    PLATE_HEIGHTS_CM.forEach((ph) => {
      const courses = Math.ceil(h / ph);
      const waste = courses * ph - h;
      if (waste < bestWaste) {
        bestWaste = waste;
        bestH = ph;
      }
    });
    return {
      heightCm: bestH,
      zeroHorizontalJoint: false,
      reason: `Hauteur ${Math.round(h)} cm > 300 cm : plaques ${bestH} cm recommandées (joints horizontaux décalés).`
    };
  }

  function suggestOptimaRange(thicknessMm) {
    const t = Number(thicknessMm) || 80;
    if (t <= 45) return '15-45';
    if (t <= 75) return '45-75';
    if (t <= 120) return '75-120';
    return '120-160';
  }

  function suggestIntegraLength(thicknessMm) {
    const t = Number(thicknessMm) || 200;
    if (t <= 160) return '160-200';
    if (t <= 200) return '200-240';
    return '240-300';
  }

  global.PlacoConstants = {
    PLATE_WIDTH_CM,
    PLATE_HEIGHTS_CM,
    BAR_LENGTH_CM,
    MIN_USABLE_OFFCUT_CM,
    PLATE_TYPES,
    FRAME_SECTIONS,
    OPTIMA_RANGES,
    SUSPENTE_TYPES,
    INTEGRA2_LENGTHS,
    INSULATION_MATERIALS,
    INSULATION_THICKNESSES_WALL,
    INSULATION_THICKNESSES_CEILING,
    OPENING_TYPES,
    createDefaultProfiles,
    createBlankProject,
    suggestPlateHeight,
    suggestOptimaRange,
    suggestIntegraLength
  };
})(typeof window !== 'undefined' ? window : globalThis);
