# Tags des jeux — proposition

Statut : **proposition à valider**. La réalisation se fera dans le ticket [T-008](tickets/T-008-tags-filtres-recherche.md).

But : filtrer et rechercher les jeux depuis l'accueil. Certains tags ont un **effet** : quand on lance un jeu à partir du filtre, le réglage correspondant s'applique tout seul.

Le vocabulaire est établi à partir du code de chacun des 34 jeux (niveaux, réglages, ce qui est joué, montré et demandé). L'attribution jeu par jeu, avec les niveaux concernés, est dans le ticket, section [Tags par jeu](tickets/T-008-tags-filtres-recherche.md#tags-par-jeu).

Un tag peut ne valoir que pour certains niveaux d'un jeu (par exemple `clé de fa (niv. 3–4)`). Le jeu porte alors le tag, et les niveaux sont gardés pour l'affichage et la recherche fine.

## Vocabulaire

57 tags en 7 familles. Les domaines (écoute, chant, jeu, rythme, lecture, théorie) servent aussi de filtres. Ils existent déjà dans `taxonomy.js` : `chant` n'est donc pas un tag. `rythme` en est un, car il couvre aussi la lecture (read-melody).

### 1. Conditions de jeu (avec effet) — 3 tags

Un tag de cette famille veut dire : « on peut jouer ainsi, sur les niveaux indiqués ».

| Tag (FR / EN) | Sens | Effet au lancement depuis le filtre |
|---|---|---|
| `silencieux` / `silent` | On peut répondre sans rien entendre : tout ce qu'il faut pour répondre est écrit ou dessiné. Le son n'illustre que la réponse. | Mode de retour « silencieux », et son du jeu coupé. |
| `sans micro` / `no mic` | Le micro n'est jamais nécessaire. | Pour les jeux qui proposent micro ou clavier : entrée « clavier ». |
| `casque conseillé` / `headphones` | Le son de l'exercice est indispensable et le micro peut le capter. | Option « écouteurs » activée quand le jeu l'a (second-voice). |

### 2. Façon de répondre (sans effet) — 4 tags

| Tag | Sens |
|---|---|
| `micro` / `mic` | Le micro sert à répondre : en chantant, ou en jouant de son instrument. « (option) » dans le ticket : le jeu marche aussi au clavier. |
| `clavier MIDI` / `MIDI keyboard` | Un clavier MIDI branché joue à la place du clavier à l'écran. Vrai pour tout jeu qui utilise `createKeyboard` ou `createPads` du cœur. |
| `en rythme` / `in time` | On répond en temps réel, sur une pulsation. |
| `libre` / `free play` | Pas de bonne ou de mauvaise réponse : on crée. |

### 3. Public et prérequis (sans effet) — 5 tags

| Tag | Sens |
|---|---|
| `premiers pas` / `first steps` | Le niveau 1 se joue sans lire la musique, sans nom de notes et sans vocabulaire : on écoute, chante, tape ou joue sur des touches. |
| `nom des notes` / `note names` | Les noms de notes (do, ré… ou C, D…) sont lus ou demandés : on nomme une note, on lit un nom d'accord, de gamme ou de tonalité. |
| `noms en option` / `names optional` | Un réglage affiche les noms sur les touches. Désactivé au départ. |
| `sans nom de notes` / `no note names` | Aucun nom de note n'est nécessaire (au besoin, il suffit de laisser le réglage « noms » éteint). |
| `instrument transpositeur` / `transposing instrument` | Le jeu gère les instruments en si bémol, mi bémol ou fa. |

### 4. Clés (sans effet) — 3 tags

| Tag | Sens |
|---|---|
| `clé de sol` / `treble clef` | Une portée en clé de sol est montrée. |
| `clé de fa` / `bass clef` | Une portée en clé de fa est montrée. |
| `clés d'ut` / `C clefs` | Clés d'ut 3 et ut 4 (alto, ténor). |

### 5. Notions (sans effet) — 29 tags

| Tag | Sens |
|---|---|
| `notes` | Une note à la fois : la trouver, la jouer, la chanter. |
| `aigu-grave` / `high-low` | Comparer des hauteurs : plus aigu, plus grave. |
| `intervalles` / `intervals` | Entendre, lire, chanter ou construire des intervalles. |
| `accords` / `chords` | Accords de trois sons et de quatre sons, entendus, lus ou construits. |
| `renversements` / `inversions` | Accords renversés. |
| `gammes` / `scales` | Gammes entendues, jouées ou construites. |
| `modes` | Les modes (dorien, lydien…). |
| `mineur` / `minor` | Gammes, tonalités ou accords mineurs. |
| `blues` | Gamme blues. |
| `altérations` / `accidentals` | Dièses, bémols, bécarres sur la portée. |
| `armures` / `key signatures` | Armures lues, trouvées ou utilisées. |
| `tonalités` / `keys` | Plusieurs tonalités : on change de tonalité, on les compare, on les place sur le cycle des quintes. |
| `cadences` | Cadences parfaite, demi, plagale, rompue, jazz. |
| `enchaînements d'accords` / `chord progressions` | Suites d'accords. |
| `mélodie` / `melody` | Airs, mélodies, phrases : écoutées, lues, rejouées, inventées. |
| `rythme` / `rhythm` | Durées et rythmes. |
| `pulsation` / `beat` | Garder le battement. |
| `soupirs` / `rests` | Silences écrits : soupir, demi-soupir. |
| `notes pointées` / `dotted notes` | Rythmes pointés. |
| `syncopes` / `syncopation` | Syncopes. |
| `triolets` / `triplets` | Triolets et swing. |
| `mesures composées` / `compound time` | 6/8. |
| `mesures irrégulières` / `odd meters` | 5/8, 7/8, 5/4. |
| `polyrythmie` / `polyrhythm` | Deux rythmes en même temps (3 contre 2…). |
| `nuances et termes` / `dynamics and terms` | Nuances, tempos, articulations, termes italiens. |
| `forme` / `form` | Phrases, reprises, formes (AABA, rondo…). |
| `question-réponse` / `call and response` | Phrase qui questionne, phrase qui répond. |
| `deux voix` / `two voices` | Deux lignes en même temps : écrire, chanter, suivre. |
| `basse` / `bass line` | Une voix de basse est jouée ou écrite. |

### 6. Activités (sans effet) — 10 tags

| Tag | Sens |
|---|---|
| `dictée` / `dictation` | On entend, puis on écrit ou on reconstruit (mélodie, rythme, accords, deux voix). |
| `lecture de notes` / `note reading` | On lit des notes sur une portée pour les nommer, les jouer ou les chanter. |
| `lecture rythmique` / `rhythm reading` | On lit un rythme écrit pour le frapper. |
| `déchiffrage` / `sight-reading` | On joue ou on chante une mélodie lue à vue, sur une pulsation. |
| `justesse` / `intonation` | Le jeu mesure si la voix est juste (réglage de précision). |
| `improvisation` | On invente en direct sur un accompagnement. |
| `composition` | On écrit une mélodie à soi. |
| `transposition` | On déplace un motif ou un air dans une autre tonalité, ou on joue le son réel d'une note écrite pour un instrument transpositeur. |
| `mémoire` / `memory` | On rejoue ce qu'on vient d'entendre (écho). |
| `oreille relative` / `relative pitch` | On reconnaît ou on chante par rapport à une tonique ou à une autre note : intervalles, degrés, fonctions. |

### 7. Fils pédagogiques (sans effet) — 3 tags

| Tag | Sens |
|---|---|
| `cinq notes` / `five notes` | Gamme de cinq notes au programme (fil pentatonique de `taxonomy.js` et niveaux qui s'y appuient). |
| `tension-détente` / `tension and release` | Fil deuxième voix et cadences. |
| `jazz` | Niveaux qui vont jusqu'au jazz. |

### Changements par rapport à la première proposition

- `portée` est supprimé : trop vague. Il est remplacé par `lecture de notes` (activité) et les trois tags de clés.
- `clé de fa` et `clés d'ut` restent. `clé de sol` est ajouté.
- `transposition` est coupé en deux : `instrument transpositeur` (prérequis) et `transposition` (activité). L'ancien tag mélangeait les deux.
- `premiers pas` est précisé : niveau 1 sans lecture, sans noms de notes et sans vocabulaire. Il passe de 7 à 15 jeux, d'après le code de chaque niveau 1.
- `fils` : `cinq notes` s'applique aussi aux niveaux qui s'appuient sur la gamme de cinq notes (melody-dictation 1, sight-sing 2, ear-scales 2, compose…).
- `micro` indique maintenant aussi les jeux où le micro est une option.

## Attribution

Voir le ticket T-008, section « Tags par jeu » : un tableau, une ligne par jeu, avec les niveaux quand un tag ne vaut que pour une partie des niveaux.

### Les points « ? » de la première proposition, vérifiés dans le code

- **music-words** : seul le niveau 4 se joue sans son. Les niveaux 1 à 3 (écoute) en ont besoin. Au niveau 5, la moitié des questions fait écouter un tempo ; l'autre (« range les termes ») est muette. Au niveau 6, la moitié fait écouter un terme ; l'autre montre le signe. Donc `silencieux (niv. 4)`, et non 4 à 6 comme supposé.
- **build-scales, build-chords, circle-of-fifths, harmony-lab** : aucun n'a d'option pour couper le son (aucun réglage `sound`). Le son n'illustre que la réponse sur : build-scales niv. 3–6 (les niveaux 1–2 se font à l'oreille), build-chords niv. 4–6 (les niveaux 1–3 mélangent des questions à l'oreille), circle-of-fifths tous niveaux, harmony-lab tous niveaux. Il faudra ajouter l'option pour ces plages.
- **two-hands** : un clic joue la pulsation, mais un curseur qui descend, des barres pour les coups attendus et un décompte chiffré donnent la même information, sur les six niveaux. Le jeu se joue donc sans son. Il n'a pas d'option pour couper le son : à ajouter.
- **penta-jam** : pas de clavier MIDI. Ses touches sont ses propres pads (événements `pointerdown`), sans `onMidi`. Même constat pour compose. Les autres jeux à clavier ou à pads du cœur ont le MIDI.

### Autres corrections trouvées en lisant le code

- Des jeux n'ont pas d'option pour couper le son, mais n'ont pas besoin d'entendre pour répondre : tap-rhythm (niv. 3–9, curseur sur la partition), read-melody (tous niveaux, même principe), play-scales (le modèle est optionnel ; les touches sonnent toujours), play-chords (niv. 2–7, le nom de l'accord est donné). Ils sont ajoutés à `silencieux` avec leurs niveaux.
- Le MIDI manquait à build-scales, build-chords, key-signatures (niv. 1–2) et score-reading (niv. 1–2, 4–6).
- Les jeux qui ont déjà une option son (nom du réglage) : find-a-note, key-signatures, read-intervals, read-chords (`sound`), play-the-note, score-reading (`hear`).
- score-reading niv. 4 montre deux clés tirées parmi sol, fa, alto et ténor : clés d'ut comprises.
- sight-sing choisit la clé de fa quand la voix est grave (réglage « voix »).

## Règles de fonctionnement

- **Source unique** : un champ `tags` dans `GAMES` (`packages/core/taxonomy.js`). Les libellés FR/EN sont dans un dictionnaire `TAGS`. Quand un tag ne vaut que pour certains niveaux, la plage de niveaux est gardée avec le tag (par exemple `['cle-de-fa', 3, 4]`).
- **Accueil** : des puces de filtre, regroupées par famille, et un champ de recherche. Plusieurs filtres se combinent par **ET**. Le filtre est conservé dans l'URL (`?tags=silencieux,sans-micro`), on peut donc partager le lien. Un jeu qui porte un tag sur une partie de ses niveaux reste dans le filtre.
- **Recherche** : elle porte sur le titre (FR et EN), les tags, le domaine et les noms des compétences. Elle ignore les accents et les majuscules (`ecoute` trouve « Écoute »). Elle tient compte de quelques synonymes : `muet` et `sans son` → silencieux, `chant` → chante, `casque` → écouteurs, `solfège` → lecture de notes, `sol`/`treble` → clé de sol.
- **Effet au lancement** : le lien du jeu porte le paramètre, par exemple `?silent=1`, comme `?level=` aujourd'hui. Le réglage vaut **pour cette partie seulement** : il n'est pas enregistré, et les réglages du profil ne changent pas. Pour un jeu silencieux seulement sur certains niveaux (music-words, build-scales, build-chords, tap-rhythm), le lien ouvre aussi le premier niveau silencieux (`?level=`).
- **Contrôle** : le test de catalogue vérifie que chaque tag est connu et que chaque jeu marqué `silencieux` peut couper tout son, au moins sur les niveaux indiqués.

## Décisions à prendre

1. Valider ou modifier la liste des tags (57) et leur attribution.
2. Choisir si l'effet « silencieux » vaut pour la seule partie (proposé) ou s'enregistre dans le profil.
3. Faut-il d'autres tags ? Quelques idées : `court` (moins d'une minute par série), `à deux` (défi via l'export des résultats), `hors ligne` (tous les jeux le sont déjà, donc ce tag ne filtrerait rien).
4. Garder les plages de niveaux dans les données (proposé), ou seulement le tag par jeu ? Sans plage, `silencieux` sur music-words dirait à tort que tous les niveaux se jouent sans son.
5. Pour les jeux silencieux sur une partie des niveaux, ouvrir directement le premier niveau silencieux avec `?silent=1` (proposé), ou laisser le niveau du profil ?
6. Ajouter une option pour couper le son à tap-rhythm, two-hands, read-melody, play-scales et play-chords, qui n'en ont pas mais sont silencieux (en plus des quatre jeux du ticket) ? Proposé : oui, sinon `silencieux` ne s'appliquerait pas vraiment.
7. Brancher le MIDI sur penta-jam et compose (hors ticket) ?
