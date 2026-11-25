# Placo Pro — Relevé, Calepinage Réel & Chiffrage DTU 25.41

Application web professionnelle **100 % hors-ligne (PWA)** conçue en Responsive Design (tactile terrain sur smartphone Android/iOS et précis à la souris sur PC) pour les plaquistes et constructeurs.

## Démarrage rapide
- **Sur PC Windows :** Double-cliquez sur `lancer-placo-pro.bat` ou ouvrez `index.html` dans votre navigateur.
- **Sur Mobile (Android / iOS) :** Déployez le dossier `placo-pro` sur GitHub Pages / Netlify / serveur local HTTPS, puis « Ajouter à l'écran d'accueil » pour l'utiliser hors-ligne sur chantier.

## Les 4 onglets principaux
1. **Chantier & Paramètres (DTU 25.41)** : Gestion multi-chantiers (créer, sauvegarder, charger, dupliquer), hauteur sous plafond par défaut avec suggestion automatique de hauteur de plaque optimale, et bibliothèque de profils réutilisables (Cloisons M48/M70/M90/M100 Face A & Face B indépendantes, Doublages ossature indépendante ou Optima 2, Faux plafonds F530 suspentes classiques ou Integra 2, Isolation prioritaire Laine de coton biosourcée).
2. **Croquis & Ouvertures** : Vue en plan (dessus) + Vue de face (mur seul / rampant-pignon), tracé **Main Levée** (terrain) et **Traits Droits magnétiques** (0°/45°/90°), **pavé numérique flottant** immédiat en cm/m, bouton **Redresser le croquis** respectant strictement les cotes saisies, et implantation par glisser-déposer ou clic des Portes, Fenêtres, Porte-fenêtres et Baies libres.
3. **Calepinage & Détails** : Simulation réelle plaque par plaque (120 cm, décalage 60 cm en 2e peau, découpes L/U en plaque entière, réutilisation des chutes uniquement > 40 cm), schéma visuel par mur & faux plafond, renforts automatiques d'ouvertures et alertes DTU 25.41.
4. **Liste de Commande & Synchronisation** : Tableau par famille avec ajustement manuel et marge globale (+5 % / +10 %), export/import `.placo.json`, copie tableau devis (Costructor/Excel), export PDF propre avec croquis coté, et synchronisation Google Drive via Webhook Apps Script (`apps-script/Code.gs` → `GESTION APPLI / PLACO PRO`).
