# Essai OpenAI pour les étiquettes DIGI — Inventaires U v42.24

Le navigateur peut choisir **Gemini (par défaut)** ou **OpenAI / GPT-6.1 Terra en mode Fast**.
Les images passent uniquement par le Worker Cloudflare du projet.
Le déploiement GitHub Pages ne déploie **pas** le Worker Cloudflare.

## Activation sécurisée

1. Créer une clé API pour un projet sur https://platform.openai.com/api-keys . L’abonnement ChatGPT ne fournit pas de crédit API.
2. Dans le Worker Cloudflare utilisé par Inventaires U (`inventaires-u-prix`), ajouter un **secret serveur** nommé `OPENAI_API_KEY` contenant la clé. Ne jamais mettre cette clé dans GitHub, dans `index.html`, dans `gemini-lab.js`, dans les préférences Safari ni dans le champ « Clé privée du pilote Cloudflare » de l’application.
3. Conserver `GEMINI_LAB_ENABLED=true`, `COURSESU_TEST_TOKEN` et, si Gemini doit rester disponible, `GEMINI_API_KEY`. Le jeton de pilote `COURSESU_TEST_TOKEN` est une clé d’accès au Worker distincte de la clé OpenAI.
4. Mettre à jour puis déployer le code du Worker Cloudflare depuis `workers/coursesu-live-worker.js` en vérifiant les autres routes existantes. **La publication de la v42.24 sur GitHub ne remplace pas automatiquement le Worker déployé.**
5. Sur l’application mise à jour, ouvrir **Pesée via IA → Accès Cloudflare**, choisir **ChatGPT · GPT-6.1 Terra Fast (essai)**. Le résultat affiche le **modèle réellement utilisé**. Si le Worker ancien répond, il peut encore utiliser Gemini (et le signaler).
6. Faire un petit essai avec les mêmes étiquettes photographiées sur les deux moteurs. Conserver une vérification visuelle avant validation des pesées. En cas de problème, sélectionner **Gemini · moteur actuel**.

## Contrôles et coût

- Une photo = une requête de lecture ; une relecture ciblée supplémentaire n’est possible que dans le parcours déjà présent, lorsqu’un seul champ manque.
- Le Worker vérifie l’EAN-13, la cohérence poids × prix, les unités, le format JSON et le jeton pilote ; aucune pesée n’est enregistrée automatiquement.
- `OPENAI_API_KEY` reste strictement sur Cloudflare. L’API OpenAI utilise `store:false`, `detail:'high'`, `service_tier:'fast'` et `reasoning.effort:'none'`.
- Le mode Fast a une tarification au token supérieure au mode standard. Vérifier la facturation dans le tableau de bord OpenAI et définir des limites/budgets.
- Test sans coût réel : `node tools/test_openai_scanner.mjs` ; vérifications GitHub Actions dans `.github/workflows/scan-quick-check.yml`.

Le code est **prêt pour configuration**, pas validé en conditions réelles tant que le secret et le déploiement Cloudflare ne sont pas opérationnels.
