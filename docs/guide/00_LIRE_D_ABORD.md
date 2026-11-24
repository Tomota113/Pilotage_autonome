# F1-RL Lab — lire d’abord

## Le projet en dix lignes

1. F1-RL Lab est un projet de L3 sur le pilotage d’une monoplace en simulation 2D.
2. Le simulateur calcule le mouvement de la voiture et la géométrie de la piste.
3. L’agent reçoit des observations, par exemple la distance aux bords et sa vitesse.
4. Il choisit une commande de volant et une façon d’accélérer ou de freiner.
5. L’environnement attribue une récompense à chaque décision et vérifie si le tour est terminé.
6. À force d’essais, les agents d’apprentissage par renforcement ajustent leur façon de piloter.
7. Deux pilotes programmés à la main servent de références.
8. La série v1 utilise une voiture simplifiée et apprend sur des circuits générés.
9. La série v2 ajoute la puissance limitée et l’aérodynamique d’une F1. Elle apprend sur des circuits réels.
10. On mesure les tours bouclés sur des circuits réservés au test et à plusieurs niveaux d’adhérence.

## Ordre de lecture

| Chapitre | Ce que tu dois pouvoir expliquer en une phrase |
|---|---|
| [01 — Apprentissage par renforcement](01_apprentissage_par_renforcement.md) | Comment un agent apprend à freiner avant un virage. |
| [02 — Simulateur et voiture](02_simulateur_et_voiture.md) | Pourquoi une voiture peut élargir sa trajectoire malgré le braquage. |
| [03 — Environnement et MDP](03_environnement_mdp.md) | Ce que fait exactement un appel à `step()`. |
| [04 — Algorithmes](04_algorithmes.md) | Ce que prédit chaque famille et comment elle se corrige. |
| [05 — Protocole et résultats](05_protocole_et_resultats.md) | D’où vient un score et jusqu’où on peut l’interpréter. |
| [06 — Code et application](06_code_et_application.md) | Comment une expérience devient un résultat et un replay. |
| [07 — Questions du professeur](07_questions_du_professeur.md) | Comment répondre à l’oral avec un exemple ou une source. |
| [08 — Bilan de la série v2](08_bilan_serie_v2.md) | Ce que la série v2 a donné, circuit par circuit, et comment les agents échouent. |

## Vocabulaire minimal

| Mot | Sens dans le projet |
|---|---|
| Agent | Programme qui décide comment piloter. |
| Observation | Informations que l’environnement donne à l’agent. |
| Action | Commande que l’agent choisit. |
| Récompense | Score produit après une décision. |
| Épisode | Un essai, du départ à la fin ou à l’interruption. |
| Politique | Règle qui choisit les actions. |
| μ, « mu » | Dans les tableaux, facteur qui règle l’adhérence de la piste pour l’essai. |
| Graine | Valeur qui initialise les tirages pseudo-aléatoires. |
| Run | Un entraînement identifié par un `run_id`. |
| Checkpoint | Soit un point de passage sur la piste, soit une sauvegarde de l’agent. Le contexte indique lequel. |

## Ouvrir l’application

Depuis la racine du dépôt, active l’environnement Python du projet. Si `app/dist/index.html` manque, compile d’abord l’interface avec `npm --prefix app run build`, après installation des dépendances Node. Les étapes d’installation sont dans le [README.md](../../README.md).

```bash
source .venv/bin/activate
uvicorn server.app:app --port 8000
```

Ouvre ensuite [http://localhost:8000](http://localhost:8000). Dans **Race Simulator**, choisis une voiture, un circuit et un replay disponible. Fais pause à l’approche d’un virage et regarde les capteurs, la vitesse et le frein. Le bandeau **FIXTURE** signale les données synthétiques de développement. Pour la soutenance, utilise des replays expérimentaux chargés depuis le serveur. [Documentation du fonctionnement](06_code_et_application.md)
