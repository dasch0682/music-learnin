# Principes de design des jeux

Règles communes à tous les jeux. Un nouveau jeu ou une modification doit les respecter. Chaque règle porte une marque :
- **[en place]** : la règle est faite et testée ;
- **[ticket]** : la règle est décidée, et un ticket la réalisera.

Détails des retours : [feedback-spec.md](../feedback-spec.md). Conventions de code : [AGENT.md](../AGENT.md).

## 1. Pédagogie

- La pratique avant la théorie. On entend, chante, joue ou construit d'abord ; les noms et les règles viennent aux niveaux supérieurs. [en place]
- Des défis de quelques secondes. [en place]
- Les questions les moins réussies reviennent plus souvent. Si le jeu a plus de 4 questions possibles, la même ne revient pas deux fois de suite. [en place]
- Après une série sans faute, un bouton propose de passer au niveau suivant. Le joueur choisit : rien ne se fait automatiquement. [en place]
- Deux fils traversent les jeux : cinq notes et tension-détente, jusqu'au jazz. [en place]

## 2. Démarrage

- Le premier tap débloque le son (exigé par les navigateurs) et lance la partie. [en place]
- **Un seul tap lance la partie.** Un double tap ne lance pas deux parties. Sur mobile, le tap ne « traverse » pas le bouton pour toucher ce qui apparaît dessous. [ticket T-010]
- Le lien d'un jeu peut fixer le niveau (`?level=`) et le silence (`?silent=1`). Ces réglages valent pour la partie seulement, ils ne sont pas enregistrés. [`?level=` en place ; `?silent=1` : ticket T-009]

## 3. Entrées du joueur

Une entrée n'est acceptée que **quand elle a un sens**. Sinon, elle n'a aucun effet : pas de son, pas d'enregistrement, pas de changement à l'écran. [ticket T-010]

| Phase | Ce qui se passe | Entrées acceptées |
|---|---|---|
| `listen` | La question se joue. | Aucune. La réécoute est ignorée tant que la question joue. |
| `answer` | Le jeu attend la réponse. | Réponses ; réécoute. |
| `feedback` | Retour, montrée de la réponse, transition. | Aucune, sauf « Niveau suivant » quand il s'affiche. |
| `free` | Jeu libre : improvisation, composition. | Toutes. |

- Les commandes inactives sont visiblement atténuées, et pas seulement par la couleur. [ticket T-010]
- Les pads et claviers ne jouent pas de son hors de la phase `answer`, sauf en jeu libre. [ticket T-010]
- Une commande ne déclenche son action qu'une fois, même en cas de double tap. Exemple : « Niveau suivant ». [ticket T-010]
- Seule la première réponse à une question est enregistrée. [en place]

## 4. Retours

- Il y a quatre modes de retour par profil : silencieux, discret, normal (le mode par défaut) et encourageant. [en place]
- Une erreur ne sonne jamais comme une sanction : pas de buzzer, pas de croix rouge. [en place]
- Les sons de retour n'ont pas de hauteur fixe, ils sont environ 4 fois moins forts que l'exercice, et ils se terminent avant la question suivante. [en place]
- Après deux erreurs, la bonne réponse est montrée. Le joueur doit quand même la donner. [en place]
- On félicite l'effort et les séries, jamais la vitesse. [en place]
- Le micro est coupé pendant les sons de retour. [en place]

## 5. Son et silence

- Un interrupteur commun « Son du jeu » coupe tout son de la machine. [ticket T-009]
- Un jeu, ou un niveau, est déclaré silencieux s'il se joue sans entendre. On cherche à en avoir le plus possible. [ticket T-009]
- Quand le son ne sert qu'à donner le temps ou à montrer un modèle, une alternative visuelle le remplace en mode silencieux. Quand entendre est le but de l'exercice, le jeu n'est pas silencieux. [ticket T-009]

## 6. Écran et accessibilité

- Le téléphone d'abord : 390 px de large, sans défilement horizontal. Les cibles sont grandes : au plus environ 12 touches blanches visibles. [en place]
- Les couleurs passent par les variables CSS ; thèmes clair et sombre. [en place]
- Aucune information ne passe par la couleur seule : symboles ✓ et ↺, texte pour les lecteurs d'écran. [en place]
- Les animations sont réduites quand l'appareil le demande. [en place]
- Peu de texte. Le titre est un verbe et un objet, en 22 caractères au plus, au tutoiement en français. [en place]
- Tout est bilingue français et anglais, avec les termes musicaux français. [en place]

## 7. Trouver un jeu

- L'accueil a des filtres par tags et une recherche sans accents, avec des synonymes. Le filtre est conservé dans l'URL. [ticket T-008]
- Un tag avec effet, comme `silencieux` ou `sans micro`, applique son réglage quand on lance un jeu depuis le filtre. [ticket T-008]
