'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
  .map((m) => m[1])
  .filter((u) => !u.startsWith('http') && !u.startsWith('#'));

refs.forEach((r) => {
  const fp = path.join(root, r);
  if (!fs.existsSync(fp)) throw new Error('Fichier manquant référencé dans index.html : ' + r);
  console.log('  [OK] index.html ->', r, `(${fs.statSync(fp).size} octets)`);
});

JSON.parse(fs.readFileSync(path.join(root, 'manifest.webmanifest'), 'utf8'));
console.log('  [OK] manifest.webmanifest JSON valide');

const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
[...sw.matchAll(/'(\.\/[^']+)'/g)].map((m) => m[1]).forEach((r) => {
  const fp = path.join(root, r);
  if (!fs.existsSync(fp)) throw new Error('Fichier manquant dans sw.js : ' + r);
});
console.log('  [OK] Tous les assets sw.js existent');

const gsCode = fs.readFileSync(path.join(root, 'apps-script', 'Code.gs'), 'utf8');
new vm.Script(gsCode, { filename: 'Code.gs' });
console.log('  [OK] apps-script/Code.gs syntaxe JS valide');
