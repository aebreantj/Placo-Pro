/* ============================================================================
 * PLACO PRO — Contrôleur Principal de l'Application
 * ============================================================================ */
(function (global) {
  'use strict';

  const Store = global.PlacoStore;
  const Engine = global.PlacoEngine;

  let toastTimer = null;

  function toast(message) {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
  }

  function requestBlankProject() {
    if (Store.hasWorkInProgress()) {
      const ok = confirm(
        'Un travail est en cours sur le chantier actuel.\n\nVoulez-vous tout remettre à zéro pour ouvrir un nouveau chantier vierge ?'
      );
      if (!ok) return false;
    }
    Store.resetToBlankProject();
    toast('Nouveau chantier vierge prêt (tout est à zéro)');
    return true;
  }

  function renderApp() {
    const state = Store.getState();
    const proj = Store.getActiveProject();
    const calc = Engine.calculateProject(proj);

    // Mise à jour header
    const nameEl = document.getElementById('header-project-name');
    if (nameEl) {
      nameEl.textContent = (proj.clientName || '').trim() || 'Chantier vierge';
    }

    const kpiPlates = document.getElementById('kpi-top-plates');
    const kpiArea = document.getElementById('kpi-top-area');
    const kpiWaste = document.getElementById('kpi-top-waste');
    if (kpiPlates) kpiPlates.textContent = `${calc.summary.totalPlatesCount} pl.`;
    if (kpiArea) kpiArea.textContent = `${calc.summary.totalNetSurfaceM2} m²`;
    if (kpiWaste) kpiWaste.textContent = `${calc.summary.globalWastePct} %`;

    const saveStatus = document.getElementById('save-status');
    if (saveStatus) {
      if (proj.savedId) {
        saveStatus.innerHTML = state.lastSavedAt
          ? `<span style="color:#4ADE80;">●</span> Sauvegardé ${state.lastSavedAt}`
          : `<span style="color:#4ADE80;">●</span> Chantier sauvegardé`;
      } else {
        saveStatus.innerHTML = `<span style="color:var(--yellow);">●</span> Chantier vierge (${(state.savedProjects || []).length} sauvegardé(s))`;
      }
    }

    // Onglets actifs (Desktop & Mobile)
    document.querySelectorAll('#desktop-tabs .nav-tab').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tab === state.activeTab);
    });
    document.querySelectorAll('#mobile-tabs .mobile-nav-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tab === state.activeTab);
    });

    // Rendu de l'onglet actif
    const main = document.getElementById('app-main');
    if (!main) return;

    const api = {
      toast,
      rerender: renderApp,
      requestBlankProject
    };

    if (state.activeTab === 'tab1') {
      global.PlacoTab1.render(main, state, calc, api);
    } else if (state.activeTab === 'tab2') {
      global.PlacoSketch.render(main, state, calc, api);
    } else if (state.activeTab === 'tab3') {
      global.PlacoCalepinage.render(main, state, calc, api);
    } else if (state.activeTab === 'tab4') {
      global.PlacoOrder.render(main, state, calc, api);
    }
  }

  function init() {
    // Navigation onglets desktop & mobile
    document.querySelectorAll('[data-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        Store.setActiveTab(btn.dataset.tab);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    });

    // Bouton visible "Nouveau chantier vierge" dans l'en-tête
    document.getElementById('btn-top-blank')?.addEventListener('click', () => {
      requestBlankProject();
    });

    // Actions globales header
    const fileInput = document.getElementById('global-import-json');
    document.getElementById('btn-top-import')?.addEventListener('click', () => {
      fileInput?.click();
    });

    fileInput?.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = JSON.parse(String(reader.result || '{}'));
          const imported = Store.importProjectObject(parsed);
          if (global.PlacoSketch) global.PlacoSketch.fitViewToPlan(imported.walls);
          toast(`Chantier "${imported.clientName}" importé avec succès !`);
        } catch (err) {
          toast(`Erreur import JSON : ${err.message}`);
        }
        fileInput.value = '';
      };
      reader.readAsText(file, 'UTF-8');
    });

    document.getElementById('btn-top-export')?.addEventListener('click', () => {
      global.PlacoOrder.exportProjectJson({ toast, rerender: renderApp });
    });

    document.getElementById('btn-top-pdf')?.addEventListener('click', () => {
      const proj = Store.getActiveProject();
      const calc = Engine.calculateProject(proj);
      global.PlacoOrder.printCleanPdf(proj, calc, { toast, rerender: renderApp });
    });

    // Raccourcis clavier PC (Ctrl+Z)
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.target.matches('input,textarea,select')) {
        if (Store.undoWalls()) {
          e.preventDefault();
          toast('Dernière modification annulée');
        }
      }
    });

    // Abonnement réactif au Store
    Store.subscribe(() => renderApp());

    // Centrer la vue initiale du croquis
    if (global.PlacoSketch) {
      global.PlacoSketch.fitViewToPlan(Store.getActiveProject().walls);
    }

    // Enregistrement PWA Service Worker (en HTTP/HTTPS uniquement)
    if ('serviceWorker' in navigator && /^https?:/.test(window.location.protocol)) {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    }

    renderApp();
  }

  document.addEventListener('DOMContentLoaded', init);
})(window);
