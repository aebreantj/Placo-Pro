/* ============================================================================
 * PLACO PRO — Gestionnaire d'État, Chantier Vierge & Mes Chantiers Sauvegardés
 * Règle stricte : l'application s'ouvre TOUJOURS sur un chantier totalement vierge.
 * Un chantier sauvegardé ne s'ouvre que sur sélection explicite ou import .json.
 * ============================================================================ */
(function (global) {
  'use strict';

  const C = global.PlacoConstants;
  const STORAGE_KEY_SAVED = 'placo_pro_saved_projects_v2';
  const STORAGE_KEY_SYNC = 'placo_pro_sync_settings_v1';

  const listeners = new Set();

  let state = {
    savedProjects: [],
    currentProject: null,
    activeTab: 'tab1', // 'tab1' | 'tab2' | 'tab3' | 'tab4'
    selectedWallId: null,
    syncSettings: {
      webhookUrl: '',
      token: '',
      folderPath: 'GESTION APPLI / PLACO PRO'
    },
    lastSavedAt: null,
    undoStack: [],
    redoStack: []
  };

  function uid(prefix) {
    return `${prefix || 'id'}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  }

  function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function loadFromStorage() {
    try {
      const rawSync = localStorage.getItem(STORAGE_KEY_SYNC);
      if (rawSync) {
        const parsedSync = JSON.parse(rawSync);
        state.syncSettings = {
          webhookUrl: parsedSync.webhookUrl || '',
          token: parsedSync.token || '',
          folderPath: parsedSync.folderPath || 'GESTION APPLI / PLACO PRO'
        };
      }
    } catch (e) {}

    try {
      const raw = localStorage.getItem(STORAGE_KEY_SAVED);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          state.savedProjects = parsed;
        }
      }
    } catch (e) {}

    // TOUJOURS démarrer sur un chantier totalement vierge
    state.currentProject = C.createBlankProject();
    state.selectedWallId = null;
    state.undoStack = [];
    state.redoStack = [];
  }

  function persistSavedProjects() {
    try {
      localStorage.setItem(STORAGE_KEY_SAVED, JSON.stringify(state.savedProjects));
      localStorage.setItem(STORAGE_KEY_SYNC, JSON.stringify(state.syncSettings));
      state.lastSavedAt = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch (e) {
      console.warn('Placo Pro : erreur sauvegarde localStorage', e);
    }
  }

  function notify(reason) {
    // Si le chantier actif est déjà un chantier sauvegardé ouvert volontairement, on met à jour sa copie sauvegardée
    if (state.currentProject && state.currentProject.savedId) {
      const idx = state.savedProjects.findIndex((p) => p.id === state.currentProject.savedId);
      if (idx >= 0) {
        state.savedProjects[idx] = deepClone(state.currentProject);
        state.savedProjects[idx].updatedAt = new Date().toISOString();
      }
    }
    persistSavedProjects();
    listeners.forEach((fn) => {
      try { fn(state, reason); } catch (e) { console.error(e); }
    });
  }

  function subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  function getState() {
    return state;
  }

  function getActiveProject() {
    if (!state.currentProject) {
      state.currentProject = C.createBlankProject();
    }
    return state.currentProject;
  }

  /**
   * Indique si un travail est en cours sur le chantier actif (pour demander confirmation avant remise à zéro).
   */
  function hasWorkInProgress() {
    const p = getActiveProject();
    if (!p) return false;
    if ((p.walls || []).length > 0) return true;
    if (String(p.clientName || '').trim().length > 0) return true;
    if (String(p.address || '').trim().length > 0) return true;
    if (String(p.date || '').trim().length > 0) return true;
    if (p.ceiling && p.ceiling.enabled) return true;
    if (p.manualOverrides && Object.keys(p.manualOverrides).length > 0) return true;
    return false;
  }

  /**
   * Remet immédiatement l'application sur un chantier totalement vierge.
   */
  function resetToBlankProject() {
    state.currentProject = C.createBlankProject();
    state.selectedWallId = null;
    state.undoStack = [];
    state.redoStack = [];
    if (global.PlacoSketch && global.PlacoSketch.fitViewToPlan) {
      global.PlacoSketch.fitViewToPlan([]);
    }
    listeners.forEach((fn) => fn(state, 'reset-blank'));
    return state.currentProject;
  }

  /**
   * Enregistre explicitement le chantier actif dans "Mes chantiers sauvegardés".
   */
  function saveCurrentProject(customName) {
    const proj = getActiveProject();
    const finalName = String(customName != null ? customName : proj.clientName).trim();
    proj.clientName = finalName || `Chantier du ${new Date().toLocaleDateString('fr-FR')}`;
    if (!proj.date) {
      proj.date = new Date().toISOString().slice(0, 10);
    }
    if (!proj.savedId) {
      const newId = uid('proj');
      proj.id = newId;
      proj.savedId = newId;
      const copy = deepClone(proj);
      copy.updatedAt = new Date().toISOString();
      state.savedProjects.unshift(copy);
    } else {
      const idx = state.savedProjects.findIndex((p) => p.id === proj.savedId);
      const copy = deepClone(proj);
      copy.updatedAt = new Date().toISOString();
      if (idx >= 0) {
        state.savedProjects[idx] = copy;
      } else {
        state.savedProjects.unshift(copy);
      }
    }
    persistSavedProjects();
    listeners.forEach((fn) => fn(state, 'project-save'));
    return proj;
  }

  /**
   * Ouvre volontairement un chantier depuis "Mes chantiers sauvegardés".
   */
  function openSavedProject(savedId) {
    const found = state.savedProjects.find((p) => p.id === savedId);
    if (!found) return null;
    const loaded = deepClone(found);
    loaded.savedId = found.id;
    state.currentProject = loaded;
    state.undoStack = [];
    state.redoStack = [];
    state.selectedWallId = loaded.walls && loaded.walls.length ? loaded.walls[0].id : null;
    if (global.PlacoSketch && global.PlacoSketch.fitViewToPlan) {
      global.PlacoSketch.fitViewToPlan(loaded.walls || []);
    }
    listeners.forEach((fn) => fn(state, 'project-open'));
    return loaded;
  }

  function duplicateActiveProject() {
    const src = getActiveProject();
    const copy = deepClone(src);
    const newId = uid('proj');
    copy.id = newId;
    copy.savedId = newId;
    copy.clientName = `${(src.clientName || 'Chantier').trim()} (Copie)`;
    copy.date = new Date().toISOString().slice(0, 10);
    copy.updatedAt = new Date().toISOString();
    state.savedProjects.unshift(deepClone(copy));
    state.currentProject = copy;
    state.undoStack = [];
    state.redoStack = [];
    persistSavedProjects();
    listeners.forEach((fn) => fn(state, 'project-duplicate'));
    return copy;
  }

  function deleteSavedProject(savedId) {
    const existed = state.savedProjects.some((p) => p.id === savedId);
    if (!existed) return false;
    state.savedProjects = state.savedProjects.filter((p) => p.id !== savedId);
    if (state.currentProject && state.currentProject.savedId === savedId) {
      state.currentProject = C.createBlankProject();
      state.selectedWallId = null;
      state.undoStack = [];
      state.redoStack = [];
    }
    persistSavedProjects();
    listeners.forEach((fn) => fn(state, 'project-delete'));
    return true;
  }

  function importProjectObject(rawObj) {
    if (!rawObj || typeof rawObj !== 'object') {
      throw new Error('Fichier JSON invalide.');
    }
    const proj = deepClone(rawObj);
    proj.id = uid('import');
    proj.savedId = null; // Importé en session active ; l'utilisateur peut cliquer "Sauvegarder" pour l'ajouter à sa liste
    if (typeof proj.clientName !== 'string') proj.clientName = 'Chantier importé';
    if (typeof proj.address !== 'string') proj.address = '';
    if (typeof proj.date !== 'string') proj.date = '';
    if (!proj.defaultHeightCm) proj.defaultHeightCm = 250;
    if (!Array.isArray(proj.profiles) || !proj.profiles.length) {
      proj.profiles = C.createDefaultProfiles();
    }
    if (!Array.isArray(proj.walls)) proj.walls = [];
    if (!proj.ceiling) {
      proj.ceiling = {
        enabled: false,
        profileId: proj.profiles.find((p) => p.category === 'plafond')?.id || 'prof-plafond-a',
        autoFromPlan: true,
        customLengthCm: 0,
        customWidthCm: 0
      };
    }
    if (!proj.consumablePrefs) {
      proj.consumablePrefs = { enduitUnit: 'sac25', ttpcBoxSize: 1000, safetyMarginPct: 0 };
    }
    if (!proj.manualOverrides) proj.manualOverrides = {};

    state.currentProject = proj;
    state.selectedWallId = proj.walls[0] ? proj.walls[0].id : null;
    state.undoStack = [];
    state.redoStack = [];
    listeners.forEach((fn) => fn(state, 'project-import'));
    return proj;
  }

  function pushUndoSnapshot() {
    const proj = getActiveProject();
    if (!proj) return;
    state.undoStack.push(deepClone(proj.walls));
    if (state.undoStack.length > 30) state.undoStack.shift();
    state.redoStack = [];
  }

  function undoWalls() {
    const proj = getActiveProject();
    if (!proj || !state.undoStack.length) return false;
    state.redoStack.push(deepClone(proj.walls));
    proj.walls = state.undoStack.pop();
    if (proj.walls.length && !proj.walls.some((w) => w.id === state.selectedWallId)) {
      state.selectedWallId = proj.walls[0].id;
    } else if (!proj.walls.length) {
      state.selectedWallId = null;
    }
    notify('undo');
    return true;
  }

  function redoWalls() {
    const proj = getActiveProject();
    if (!proj || !state.redoStack.length) return false;
    state.undoStack.push(deepClone(proj.walls));
    proj.walls = state.redoStack.pop();
    notify('redo');
    return true;
  }

  function setActiveTab(tabId) {
    state.activeTab = tabId;
    listeners.forEach((fn) => fn(state, 'tab'));
  }

  function setSelectedWallId(wallId) {
    state.selectedWallId = wallId;
    listeners.forEach((fn) => fn(state, 'selection'));
  }

  function updateProjectMeta(patch) {
    const proj = getActiveProject();
    if (!proj) return;
    Object.assign(proj, patch);
    notify('project-meta');
  }

  function updateConsumablePrefs(patch) {
    const proj = getActiveProject();
    if (!proj) return;
    proj.consumablePrefs = Object.assign({}, proj.consumablePrefs || {}, patch);
    notify('prefs');
  }

  function updateCeiling(patch) {
    const proj = getActiveProject();
    if (!proj) return;
    proj.ceiling = Object.assign({}, proj.ceiling || {}, patch);
    notify('ceiling');
  }

  function upsertProfile(profile) {
    const proj = getActiveProject();
    if (!proj) return;
    const idx = proj.profiles.findIndex((p) => p.id === profile.id);
    if (idx >= 0) {
      proj.profiles[idx] = deepClone(profile);
    } else {
      const copy = deepClone(profile);
      if (!copy.id) copy.id = uid('prof');
      proj.profiles.push(copy);
    }
    notify('profile-upsert');
  }

  function deleteProfile(profileId) {
    const proj = getActiveProject();
    if (!proj) return false;
    const target = proj.profiles.find((p) => p.id === profileId);
    if (!target) return false;
    const sameCat = proj.profiles.filter((p) => p.category === target.category);
    if (sameCat.length <= 1) return false;
    proj.profiles = proj.profiles.filter((p) => p.id !== profileId);
    const fallback = proj.profiles.find((p) => p.category === target.category) || proj.profiles[0];
    proj.walls.forEach((w) => {
      if (w.profileId === profileId && fallback) w.profileId = fallback.id;
    });
    if (proj.ceiling && proj.ceiling.profileId === profileId && fallback) {
      proj.ceiling.profileId = fallback.id;
    }
    notify('profile-delete');
    return true;
  }

  function addWall(wallData, skipUndo) {
    const proj = getActiveProject();
    if (!proj) return null;
    if (!skipUndo) pushUndoSnapshot();
    const defaultProf = proj.profiles.find((p) => p.category === 'doublage') || proj.profiles[0];
    const h = Number(proj.defaultHeightCm) || 250;
    const wall = Object.assign({
      id: uid('w'),
      name: `Mur ${proj.walls.length + 1}`,
      mode: 'plan',
      x1: 100, y1: 100, x2: 400, y2: 100,
      lengthCm: 300,
      hLeftCm: h,
      hRightCm: h,
      profileId: defaultProf ? defaultProf.id : '',
      openings: []
    }, wallData);
    proj.walls.push(wall);
    state.selectedWallId = wall.id;
    notify('wall-add');
    return wall;
  }

  function updateWall(wallId, patch, recordUndo) {
    const proj = getActiveProject();
    if (!proj) return;
    const w = proj.walls.find((x) => x.id === wallId);
    if (!w) return;
    if (recordUndo) pushUndoSnapshot();
    Object.assign(w, patch);
    notify('wall-update');
  }

  function deleteWall(wallId) {
    const proj = getActiveProject();
    if (!proj) return;
    pushUndoSnapshot();
    proj.walls = proj.walls.filter((w) => w.id !== wallId);
    if (state.selectedWallId === wallId) {
      state.selectedWallId = proj.walls[0] ? proj.walls[0].id : null;
    }
    notify('wall-delete');
  }

  function replaceAllWalls(newWalls) {
    const proj = getActiveProject();
    if (!proj) return;
    pushUndoSnapshot();
    proj.walls = newWalls;
    if (proj.walls.length && !proj.walls.some((w) => w.id === state.selectedWallId)) {
      state.selectedWallId = proj.walls[0].id;
    } else if (!proj.walls.length) {
      state.selectedWallId = null;
    }
    notify('walls-replace');
  }

  function addOpening(wallId, openingData) {
    const proj = getActiveProject();
    if (!proj) return null;
    const w = proj.walls.find((x) => x.id === wallId);
    if (!w) return null;
    pushUndoSnapshot();
    const spec = C.OPENING_TYPES[openingData.type] || C.OPENING_TYPES.porte;
    const op = Object.assign({
      id: uid('op'),
      type: spec.id,
      label: `${spec.shortLabel} ${(w.openings || []).length + 1}`,
      distFromLeftCm: 60,
      widthCm: spec.defaultWidthCm,
      heightCm: spec.defaultHeightCm,
      sillHeightCm: spec.defaultSillCm
    }, openingData);
    op.widthCm = Math.min(Math.max(20, Number(op.widthCm) || spec.defaultWidthCm), Math.max(20, w.lengthCm - 10));
    op.distFromLeftCm = Math.max(0, Math.min(Number(op.distFromLeftCm) || 0, Math.max(0, w.lengthCm - op.widthCm)));
    if (!Array.isArray(w.openings)) w.openings = [];
    w.openings.push(op);
    notify('opening-add');
    return op;
  }

  function updateOpening(wallId, openingId, patch) {
    const proj = getActiveProject();
    if (!proj) return;
    const w = proj.walls.find((x) => x.id === wallId);
    if (!w || !w.openings) return;
    const op = w.openings.find((o) => o.id === openingId);
    if (!op) return;
    Object.assign(op, patch);
    notify('opening-update');
  }

  function deleteOpening(wallId, openingId) {
    const proj = getActiveProject();
    if (!proj) return;
    const w = proj.walls.find((x) => x.id === wallId);
    if (!w || !w.openings) return;
    pushUndoSnapshot();
    w.openings = w.openings.filter((o) => o.id !== openingId);
    notify('opening-delete');
  }

  function setManualOverride(itemId, value) {
    const proj = getActiveProject();
    if (!proj) return;
    if (!proj.manualOverrides) proj.manualOverrides = {};
    if (value === null || value === '' || isNaN(Number(value))) {
      delete proj.manualOverrides[itemId];
    } else {
      proj.manualOverrides[itemId] = Math.max(0, Math.round(Number(value)));
    }
    notify('override');
  }

  function clearAllOverrides() {
    const proj = getActiveProject();
    if (!proj) return;
    proj.manualOverrides = {};
    notify('override-clear');
  }

  function updateSyncSettings(patch) {
    state.syncSettings = Object.assign({}, state.syncSettings, patch);
    persistSavedProjects();
    listeners.forEach((fn) => fn(state, 'sync-settings'));
  }

  loadFromStorage();

  global.PlacoStore = {
    uid,
    deepClone,
    subscribe,
    getState,
    getActiveProject,
    hasWorkInProgress,
    resetToBlankProject,
    saveCurrentProject,
    openSavedProject,
    duplicateActiveProject,
    deleteSavedProject,
    importProjectObject,
    setActiveTab,
    setSelectedWallId,
    updateProjectMeta,
    updateConsumablePrefs,
    updateCeiling,
    upsertProfile,
    deleteProfile,
    addWall,
    updateWall,
    deleteWall,
    replaceAllWalls,
    addOpening,
    updateOpening,
    deleteOpening,
    setManualOverride,
    clearAllOverrides,
    updateSyncSettings,
    undoWalls,
    redoWalls
  };
})(window);
