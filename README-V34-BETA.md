# Inventaires U V34 bêta — migration IndexedDB

- IndexedDB `inventaires-u-v34` devient la source de vérité pour les données applicatives.
- Au premier lancement, les clés Inventaires U de localStorage sont copiées vers IndexedDB; elles restent intactes dans localStorage.
- Les lectures applicatives passent par un cache mémoire initialisé depuis IndexedDB avant le démarrage des scripts.
- Les modifications sont écrites de manière asynchrone dans IndexedDB. En cas d’échec, un avertissement apparaît.
- Les comptes Supabase continuent à utiliser leur propre stockage de session.
- Ancienne copie IndexedDB V33 toujours consultable via le bouton de récupération.

**BÊTA — ne pas utiliser comme seule source pour un inventaire professionnel avant validation sur iPhone.**
Limite : les écritures IndexedDB sont asynchrones; une fermeture brutale avant la fin d'une transaction peut perdre la dernière opération. Une validation Safari et des tests de changement de compte sont indispensables.
