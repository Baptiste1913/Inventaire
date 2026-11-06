# Inventaires U

Application web mobile de calcul de tare, prête pour GitHub Pages.

## Mise à jour du site

Remplacer les fichiers à la racine du dépôt GitHub par ceux du ZIP (les fichiers doivent être à la racine, pas dans un sous-dossier). Conserver le dépôt existant pour garder l'adresse GitHub Pages pendant la transition. La nouvelle version reprend automatiquement les paniers sauvegardés avec la clé locale `tare-paniettes-v1` **uniquement sur la même origine (protocole + domaine + port)**. Les valeurs sont enregistrées en grammes en interne, affichées et saisies en kilogrammes à 3 décimales.

## Domaine inventaires-u.com

1. Acheter/posséder le domaine et accéder à sa zone DNS. Le fichier `CNAME` fourni indique le domaine à GitHub Pages.
2. GitHub → dépôt → Settings → Pages → Custom domain → saisir `inventaires-u.com`, enregistrer.
3. Chez le registrar, créer les quatre enregistrements A du domaine racine pointant vers les adresses IPv4 GitHub Pages officielles : `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`. Supprimer les enregistrements A/AAAA contradictoires. Pour `www`, créer un CNAME vers `<utilisateur>.github.io` (remplacer `<utilisateur>` par le compte GitHub exact, sans chemin).
4. Attendre la propagation et la validation HTTPS dans GitHub Pages, puis activer `Enforce HTTPS` quand proposé. Vérifier la documentation GitHub Pages si l'interface change.
5. **Avant de changer de domaine**, ouvrir l'ancienne adresse dans Safari, exporter les paniers JSON. Sur `https://inventaires-u.com`, importer le fichier JSON. Le stockage local ne suit pas le changement de domaine.

## Utilisation

- Saisir `1.230` ou `1,230` dans Poids affiché sur la balance.
- Sélectionner le panier : le résultat s'affiche en gros et peut être copié.
- Réorganiser la liste en glissant la poignée ⠿ ; les flèches ▲ ▼ sont également disponibles.
- Ajouter, modifier, supprimer, exporter et importer les paniers.
- Depuis Safari iPhone : Partager → Sur l'écran d'accueil.

## Remarque

Ce site est un outil indépendant, non affilié officiellement à la Coopérative U. L'identité visuelle est inspirée de son univers rouge/blanc, sans reprendre ses ressources graphiques officielles.

## Version graphique turquoise et violet
Cette version reprend les couleurs turquoise, violet, blanc et noir du site de référence fourni, avec le logo fourni par l'utilisateur. Le projet est personnel et indépendant, non affilié à Coopérative U. Remplacer les fichiers du dépôt à la racine, y compris `logo-u.png`. Les paniers existants restent stockés sous les mêmes clés de navigateur et ne sont pas effacés par cette mise à jour.


## Mise à jour V5
Titre OUTIL D’INVENTAIRE, retrait de la balance, poignée à six points centrés et réorganisation par appui long sur toute la ligne (hors boutons d’action). Les paniers déjà enregistrés sont conservés.
