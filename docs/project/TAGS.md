# Tags des jeux — proposition

Statut : **proposition à valider**. La réalisation se fera dans le ticket [T-008](tickets/T-008-tags-filtres-recherche.md).

But : filtrer et rechercher les jeux depuis l'accueil. Certains tags ont un **effet** : quand on lance un jeu à partir du filtre, le réglage correspondant s'applique tout seul.

## Liste des tags

### Conditions de jeu (avec effet)

| Tag (FR / EN) | Sens | Effet au lancement depuis le filtre |
|---|---|---|
| `silencieux` / `silent` | Jouable sans son : on peut répondre sans rien entendre. | Mode de retour « silencieux », et son du jeu coupé s'il a cette option. |
| `sans micro` / `no mic` | Le micro n'est jamais nécessaire. | Pour les jeux qui proposent micro ou clavier : entrée « clavier ». |
| `casque conseillé` / `headphones` | Le son de l'exercice est indispensable ; le micro peut capter le haut-parleur. | Option « écouteurs » activée quand le jeu l'a (second-voice). |

### Façon de répondre (sans effet)

| Tag | Sens |
|---|---|
| `micro` | On répond en chantant ou en jouant de son instrument. |
| `clavier MIDI` | Un clavier MIDI peut servir. |
| `en rythme` | On répond en temps réel, sur une pulsation. |
| `libre` | Pas de bonne ou de mauvaise réponse : on crée. |

### Prérequis et public (sans effet)

| Tag | Sens |
|---|---|
| `premiers pas` | Le niveau 1 se joue sans savoir lire la musique ni connaître le nom des notes. |
| `portée` | Il faut lire des notes sur une portée. |
| `clé de fa`, `clés d'ut` | Le jeu utilise ces clés à certains niveaux. |
| `transposition` | Le jeu gère les instruments transpositeurs (si bémol, mi bémol, fa). |

### Fils pédagogiques (sans effet)

| Tag | Sens |
|---|---|
| `cinq notes` | Fait partie du fil pentatonique. |
| `tension-détente` | Fait partie du fil deuxième voix et cadences. |
| `jazz` | Les derniers niveaux vont jusqu'au jazz. |

Les domaines (écoute, chant, jeu, rythme, lecture, théorie) servent aussi de filtres. Ils existent déjà dans `taxonomy.js`, il n'y a pas à les dupliquer en tags.

## Attribution proposée

Légende : ✓ = oui, (✓) = seulement à certains niveaux ou avec une option, **?** = à vérifier lors de la réalisation.

| Jeu | silencieux | sans micro | casque | micro | MIDI | en rythme | libre | premiers pas | portée | transposition | fils |
|---|---|---|---|---|---|---|---|---|---|---|---|
| high-low | | ✓ | | | | | | ✓ | | | |
| echo-penta | | ✓ | | | ✓ | | | ✓ | | | cinq notes |
| ear-intervals | | ✓ | | | ✓ | | | | | | |
| ear-chords | | ✓ | | | | | | | | | |
| ear-cadences | | ✓ | | | | | | | | | tension-détente |
| ear-scales | | ✓ | | | | | | | | | |
| ear-progressions | | ✓ | | | | | | | | | jazz |
| ear-jazz | | ✓ | | | | | | | | | jazz |
| melody-dictation | | ✓ | | | ✓ | | | | ✓ | | |
| music-words | (✓) niv. 4–6 **?** | ✓ | | | | | | | | | |
| form | | ✓ | | | | | | | | | |
| two-voices | | ✓ | | | ✓ | | | | ✓ | | tension-détente |
| sing-match | | | | ✓ | | | | ✓ | | | cinq notes |
| second-voice | | | ✓ | ✓ | | | | | | | tension-détente, jazz |
| sight-sing | | | | ✓ | | | | | ✓ | | |
| penta-jam | | ✓ | | | **?** | ✓ | ✓ | ✓ | | | cinq notes, tension-détente, jazz |
| play-the-note | | (✓) | | (✓) | ✓ | | | | ✓ | ✓ | |
| known-tunes | | ✓ | | | ✓ | | | ✓ | | | cinq notes |
| compose | | ✓ | | | | | ✓ | ✓ | | | cinq notes |
| play-scales | | (✓) | | (✓) | ✓ | | | | | ✓ | |
| play-chords | | ✓ | | | ✓ | | | | | | |
| tap-rhythm | | ✓ | | | | ✓ | | ✓ | (✓) | | |
| rhythm-dictation | | ✓ | | | | | | | ✓ | | |
| two-hands | **?** | ✓ | | | | ✓ | | | | | |
| find-a-note | ✓ | ✓ | | | | | | | ✓ | | clé de fa, clés d'ut |
| read-melody | | ✓ | | | ✓ | ✓ | | | ✓ | | |
| key-signatures | ✓ | ✓ | | | ✓ | | | | ✓ | | |
| read-intervals | ✓ | ✓ | | | | | | | ✓ | | |
| read-chords | ✓ | ✓ | | | | | | | ✓ | | |
| score-reading | ✓ | ✓ | | | ✓ | | | | ✓ | ✓ | |
| build-scales | ✓ **?** | ✓ | | | ✓ | | | | | | |
| build-chords | ✓ **?** | ✓ | | | ✓ | | | | | | |
| circle-of-fifths | ✓ **?** | ✓ | | | | | | | ✓ | | |
| harmony-lab | ✓ **?** | ✓ | | | | | | | ✓ | | jazz |

Points à vérifier pendant la réalisation :
- **build-scales, build-chords, circle-of-fifths, harmony-lab** : le son n'y fait qu'illustrer, mais ces jeux n'ont pas d'option pour le couper. Il faudra l'ajouter.
- **two-hands** : un métronome sonore donne la pulsation. Le jeu ne devient silencieux que si une pulsation visuelle suffit à jouer.
- **music-words** : les niveaux 4 à 6 (lecture des termes) se jouent sans son. Les niveaux 1 à 3 (écoute) en ont besoin.
- **penta-jam** : vérifier si le jeu accepte un clavier MIDI.

## Règles de fonctionnement

- **Source unique** : un champ `tags` dans `GAMES` (`packages/core/taxonomy.js`). Les libellés FR/EN sont dans un dictionnaire `TAGS`.
- **Accueil** : des puces de filtre et un champ de recherche. Plusieurs filtres se combinent par **ET**. Le filtre est conservé dans l'URL (`?tags=silencieux,sans-micro`), on peut donc partager le lien.
- **Recherche** : elle porte sur le titre (FR et EN), les tags, le domaine et les noms des compétences. Elle ignore les accents et les majuscules (`ecoute` trouve « Écoute »). Elle tient compte de quelques synonymes : `muet` et `sans son` → silencieux, `chant` → chante, `casque` → écouteurs.
- **Effet au lancement** : le lien du jeu porte le paramètre, par exemple `?silent=1`, comme `?level=` aujourd'hui. Le réglage vaut **pour cette partie seulement** : il n'est pas enregistré, et les réglages du profil ne changent pas.
- **Contrôle** : le test de catalogue vérifie que chaque tag est connu et que chaque jeu marqué `silencieux` peut couper tout son.

## Décisions à prendre

1. Valider ou modifier la liste des tags et leur attribution.
2. Choisir si l'effet « silencieux » vaut pour la seule partie (proposé) ou s'enregistre dans le profil.
3. Faut-il d'autres tags ? Quelques idées : `court` (moins d'une minute par série), `à deux` (défi via l'export des résultats), `hors ligne` (tous les jeux le sont déjà, donc ce tag ne filtrerait rien).
