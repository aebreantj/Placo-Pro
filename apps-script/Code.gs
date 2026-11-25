/**
 * PLACO PRO — Webhook Google Apps Script (Synchronisation Google Drive)
 * Dossier cible par defaut : Mon Drive / GESTION APPLI / PLACO PRO
 *
 * Deploiement :
 *   1. Aller sur https://script.google.com > Nouveau projet
 *   2. Coller ce code dans Code.gs
 *   3. (Optionnel) Parametres du projet > Proprietes du script > APP_TOKEN = votre_secret
 *   4. Deployer > Nouveau deploiement > Application Web
 *      - Executer en tant que : Moi
 *      - Qui a acces : Tout le monde
 *   5. Copier l'URL /exec dans Placo Pro > Onglet 1 ou 4 > Synchronisation Google Drive.
 */

var CONFIG = {
  VERSION: '1.0.0',
  ROOT_PARENT_FOLDER: 'GESTION APPLI',
  APP_FOLDER: 'PLACO PRO'
};

function doGet(e) {
  var p = (e && e.parameter) || {};
  try {
    checkToken_(p.token);
    var action = p.action || 'ping';
    if (action === 'ping') {
      var folder = getOrCreateAppFolder_(p.folderPath);
      return json_({
        ok: true,
        service: 'PLACO PRO',
        version: CONFIG.VERSION,
        folderName: folder.getName(),
        folderId: folder.getId(),
        folderUrl: folder.getUrl()
      });
    }
    if (action === 'list') {
      return json_(listProjects_(p.folderPath));
    }
    if (action === 'get') {
      return json_(getProjectFile_(p.fileId));
    }
    return json_({ ok: false, error: 'Action inconnue : ' + action });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    var payload = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    checkToken_(payload.token);
    if (!lock.tryLock(20000)) {
      throw new Error('Serveur occupe, veuillez reessayer.');
    }
    var action = payload.action || 'saveProject';
    if (action === 'ping') {
      var folder = getOrCreateAppFolder_(payload.folderPath);
      return json_({ ok: true, service: 'PLACO PRO', version: CONFIG.VERSION, folderUrl: folder.getUrl() });
    }
    if (action === 'list') {
      return json_(listProjects_(payload.folderPath));
    }
    if (action === 'get') {
      return json_(getProjectFile_(payload.fileId));
    }
    if (action === 'saveProject') {
      return json_(saveProject_(payload));
    }
    return json_({ ok: false, error: 'Action POST inconnue : ' + action });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message ? err.message : err) });
  } finally {
    try { lock.releaseLock(); } catch (ignore) {}
  }
}

function checkToken_(provided) {
  var expected = PropertiesService.getScriptProperties().getProperty('APP_TOKEN');
  if (expected && String(provided || '') !== String(expected)) {
    throw new Error('Jeton de securite invalide (APP_TOKEN).');
  }
}

function getOrCreateChildFolder_(parent, name) {
  var it = parent.getFoldersByName(name);
  if (it.hasNext()) return it.next();
  return parent.createFolder(name);
}

function getOrCreateAppFolder_(customPath) {
  var raw = String(customPath || (CONFIG.ROOT_PARENT_FOLDER + ' / ' + CONFIG.APP_FOLDER));
  var parts = raw.split('/').map(function(s) { return s.trim(); }).filter(Boolean);
  if (!parts.length) parts = [CONFIG.ROOT_PARENT_FOLDER, CONFIG.APP_FOLDER];
  var current = DriveApp.getRootFolder();
  for (var i = 0; i < parts.length; i++) {
    current = getOrCreateChildFolder_(current, parts[i]);
  }
  return current;
}

function sanitizeFileName_(name) {
  return String(name || 'chantier-placo-pro')
    .replace(/[\\/:*?"<>|]+/g, '_')
    .replace(/\s+/g, '_')
    .substring(0, 80);
}

function upsertTextFile_(folder, filename, content, mimeType) {
  var existing = folder.getFilesByName(filename);
  if (existing.hasNext()) {
    var file = existing.next();
    file.setContent(content);
    return file;
  }
  return folder.createFile(filename, content, mimeType);
}

function saveProject_(payload) {
  var folder = getOrCreateAppFolder_(payload.folderPath);
  var project = payload.project || {};
  var baseName = sanitizeFileName_((project.clientName || 'Chantier') + '_' + (project.date || ''));
  var jsonName = baseName + '.placo.json';
  var jsonFile = upsertTextFile_(folder, jsonName, JSON.stringify(project, null, 2), 'application/json');

  var reportFile = null;
  if (payload.reportText) {
    var txtName = baseName + '_commande.csv';
    reportFile = upsertTextFile_(folder, txtName, String(payload.reportText), 'text/csv');
  }

  return {
    ok: true,
    fileId: jsonFile.getId(),
    fileName: jsonFile.getName(),
    fileUrl: jsonFile.getUrl(),
    reportUrl: reportFile ? reportFile.getUrl() : null,
    folderUrl: folder.getUrl(),
    updatedAt: new Date().toISOString()
  };
}

function listProjects_(folderPath) {
  var folder = getOrCreateAppFolder_(folderPath);
  var files = folder.getFiles();
  var list = [];
  while (files.hasNext()) {
    var f = files.next();
    var name = f.getName();
    if (name.toLowerCase().indexOf('.json') !== -1) {
      list.push({
        id: f.getId(),
        name: name,
        size: f.getSize(),
        updatedAt: f.getLastUpdated().toISOString(),
        url: f.getUrl()
      });
    }
  }
  list.sort(function(a, b) { return b.updatedAt.localeCompare(a.updatedAt); });
  return { ok: true, folderUrl: folder.getUrl(), files: list };
}

function getProjectFile_(fileId) {
  if (!fileId) throw new Error('fileId manquant.');
  var file = DriveApp.getFileById(fileId);
  var text = file.getBlob().getDataAsString('UTF-8');
  return {
    ok: true,
    fileId: file.getId(),
    fileName: file.getName(),
    project: JSON.parse(text)
  };
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
