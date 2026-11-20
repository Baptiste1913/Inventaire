# Inventaires U — pilote Courses U en ligne (v41.23)

Le catalogue local DIGI et le scanner EAN restent disponibles dans Administrateur. Les anciennes interfaces de test d’étiquettes, de relevé manuel et de prix importés ne sont plus affichées. Le scanner OCR principal et les pesées restent inchangés.

Le pilote émet un **POST HTTPS par code reconnu**, affiche les temps et calcule le poids sans jamais l’enregistrer automatiquement. Il nécessite une passerelle de scraping **déployée séparément** ; aucune API privée ni jeton n’est intégré au dépôt.

1. Confirmer l'identifiant exact du Drive Saint-Germain et des correspondances entre PLU DIGI, préfixe interne, et ID de fiche Courses U.
2. Déployer une passerelle sécurisée (Cloudflare Worker, Supabase Edge Function, etc.) alimentée par un scraper autorisé, avec CORS pour l'origine GitHub Pages, quotas et clés API seulement côté serveur.
3. Dans Administrateur, saisir l'adresse HTTPS du POST sans paramètres ni secrets, enregistrer puis scanner une étiquette complète. Le temps indiqué inclut la requête en ligne. Timeout 12 secondes.

## Contrat API

Requête JSON : `{"type":"inventaires-u-price-lookup","storeId":"superu-saintgermain","code":"EAN13","eanPrefix":"1234567","plu":"PLU","name":"Nom DIGI"}`

Réponse JSON acceptée : `{"type":"inventaires-u-live-price","verified":true,"storeId":"superu-saintgermain","eanPrefix":"1234567","plu":"PLU","name":"Nom Courses U","pricePerKg":2.69,"pricePerKgUnit":"EUR/kg","checkedAt":"2026-11-20T10:00:00Z","sourceUrl":"https://www.coursesu.com/p/article/id.html"}`

La passerelle doit renvoyer une erreur si le produit, son magasin ou son prix **explicite en €/kg** sont incertains ; le prix à la pièce ne suffit pas. Les exemples de JSON ne sont **pas** des relevés réels. L'EAN de balance n'est pas l'EAN marchand. Le pilote n'a pas encore de scraper externe déployé : aucun résultat de prix en ligne n'est garanti tant que cette étape n'est pas terminée.

Le calcul repose sur digi-weight.js : `montant en centimes / tarif en centimes par kg`, avec intervalle lié à l'arrondi. Les valeurs estimées sont à vérifier sur l'étiquette.