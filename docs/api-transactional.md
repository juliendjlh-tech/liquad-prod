# API Transactional — Liquad

Documentation pour les intégrateurs côté AI company (consumer) qui souhaitent
acheter des licences d'accès à du contenu via Liquad. Couvre l'authentification,
la découverte des catalogues et URLs accessibles, l'achat de licences (HMAC
tokens), la recherche sémantique RAG, la gestion du solde et l'historique des
transactions.

> **Audience** : équipes techniques implémentant un crawler ou un agent qui
> consomme du contenu sous licence Liquad. Si vous êtes un publisher cherchant
> à monétiser votre contenu, voyez plutôt `/docs/sdk.md`.

> **Versioning** : toutes les routes sont préfixées par `/api/consumer/v1/`.
> Une route `/v2/` sera introduite pour tout changement de contrat
> incompatible. Tant que vous restez sur `/v1/`, le contrat ne casse pas.

---

## Table des matières

1. [Concepts fondamentaux](#1-concepts-fondamentaux)
2. [Modes d'onboarding](#2-modes-donboarding-mode-a-vs-mode-b)
3. [Authentification](#3-authentification)
4. [Découverte des catalogues — `GET /api/consumer/v1/catalogs`](#4-découverte-des-catalogues--get-apiconsumerv1catalogs)
5. [Découverte des URLs — `GET /api/consumer/v1/sources`](#5-découverte-des-urls--get-apiconsumerv1sources)
6. [Achat de licences — `POST /api/consumer/v1/licenses`](#6-achat-de-licences--post-apiconsumerv1licenses)
7. [Solde — `GET /api/consumer/v1/balance`](#7-solde--get-apiconsumerv1balance)
8. [Historique — `GET /api/consumer/v1/transactions`](#8-historique--get-apiconsumerv1transactions)
9. [Format des tokens HMAC et vérification gateway](#9-format-des-tokens-hmac-et-vérification-gateway)
10. [Catalogue d'erreurs](#10-catalogue-derreurs)
11. [Limites et quotas](#11-limites-et-quotas)

---

## 1. Concepts fondamentaux

### 1.1 Bot

Un **bot** représente une identité de crawler. Il est défini par :

- `ua_pattern` (string) : sous-chaîne du `User-Agent` HTTP envoyé par votre
  crawler (ex : `GPTBot`, `ClaudeBot`, `MyAIAgent/2.1`). Le matching côté
  publisher est une recherche `includes(...)` lower-case.
- `declared_ips` (CIDR[]) : plages d'IPs depuis lesquelles votre bot opère.
  **Au moins une IP est obligatoire** pour participer aux transactions
  payantes — c'est la garantie anti-usurpation.
- `name`, `description` : libre.
- `type` : `preset` (catalogue de bots curé par Liquad — GPTBot, ClaudeBot,
  PerplexityBot, etc.) ou `custom` (créé par votre workspace).

Une `bots` row est globale à la plateforme (déduplication par nom). Sa
présence dans un workspace est représentée par la table de jonction
`workspace_bots`.

### 1.2 Subscription

Une **subscription** est un compte prépayé **workspace-scoped et
bot-agnostique**. C'est un wallet pur :

- `balance_eur` — solde prépayé,
- `label` — libellé optionnel,
- `external_user_id` — identifiant optionnel pour le cas multi-tenant
  (ex : une subscription par end-user de votre produit). Unique par
  workspace.

L'accès aux catalogues ne se fait pas via la subscription mais via
l'**access settings** portée par la clé (cf. §1.5). Une même
subscription peut donc financer plusieurs access settings (et donc
plusieurs bots) en parallèle.

### 1.3 API key

Une **API key** est une paire immuable :

- `subscription_id` — la subscription débitée à chaque grant ;
- `access_settings_id` — l'**access settings** consommée (cf §1.5). Elle
  porte le bot, la liste de catalogues, et le `max_price_eur`. Le `bot_id`
  est dénormalisé sur la clé pour la lecture rapide ; un trigger DB
  garantit qu'il égale `access_settings.bot_id`.

Le caller n'envoie **jamais** `bot_id`, `network_id` ou `search_config_id`
dans le body des endpoints `/catalogs`, `/sources`, `/licenses` : tout est
résolu depuis la clé.

**Rotation** : `POST /api/internal/.../api-keys/:keyId/rotate` régénère le
secret en place. L'ancien secret est invalidé, la paire
`(subscription, access_settings)` reste la même.

Format : `lq_<random>` — préfixe sur 11 caractères + secret. Hashée en
base de données ; ne peut être révélée qu'au moment de la création ou
d'une rotation.

À utiliser dans le header `Authorization: Bearer lq_...`.

### 1.4 Catalog

Un **catalogue** est l'**unité de vente** d'un publisher. Il combine :

- des `filter_rules` (domaines + path rules) qui définissent quelles URLs
  il couvre,
- un `price_eur` par URL,
- un `ttl_minutes` (durée de validité des tokens émis),
- une liste de `bots` autorisés à l'utiliser (via `catalog_bots`).

Vous achetez un token **par URL**, au prix le moins cher parmi les
catalogues qui :
- couvrent l'URL (filter_rules match)
- sont liés à un bot dont l'`ua_pattern` est égal au vôtre
- partagent au moins une IP avec votre bot
- ont un `status = 'active'`
- (optionnellement) appartiennent à votre workspace si vous êtes en Mode B.

Un consumer raisonne **par catalogue** : c'est l'unité que vous
découvrez, que vous filtrez, et qui porte le pricing. Voir
[`/catalogs`](#4-découverte-des-catalogues--get-apiconsumerv1catalogs).

### 1.5 Access settings

Une **access settings** est le plan d'accès du consumer pour un de ses
bots. Elle bundle :

- `bot_id` — le bot (preset ou custom) que la clé impersonne au runtime ;
- une liste de **catalogues** parmi ceux disponibles sur la marketplace
  (`status = 'active'`) ou les catalogues privés du même workspace ;
- `max_price_eur` — un plafond par grant qui protège le consumer si un
  publisher remonte son prix : tout catalogue dont `catalog.price_eur >
  max_price_eur` est silencieusement filtré au moment de `/licenses`.

C'est la concentration des deux concepts historiques (network publisher +
search config). Une `access_settings` est créée depuis le dashboard
consumer : pour chaque bot, le consumer choisit ses catalogues et son
ceiling. Une API key référence exactement une access settings.

### 1.6 Indexed source

Une **indexed source** est une URL spécifique référencée dans la base
Liquad. Seules les URLs indexées peuvent être achetées. La découverte
(`/sources`) renvoie les indexed sources accessibles à votre bot.

---

## 2. Modes d'onboarding (Mode A vs Mode B)

Une clé API peut vivre dans **deux contextes** différents, selon que vous
êtes un consumer self-serve ou un partenaire d'un publisher. Les deux modes
utilisent **strictement les mêmes endpoints** ; la différence porte sur
**qui finance** et **quel access settings la clé porte**.

### 2.1 Mode A — Consumer self-serve (par défaut)

**Cas d'usage** : votre AI company crée un workspace Liquad, déclare son
bot (IPs, ua_pattern), top-up un wallet, construit ses access settings
(catalogues souhaités + max price) et utilise la clé API pour acheter
des licences chez **n'importe quel publisher** Liquad dont le contenu
vous intéresse.

| | |
|---|---|
| `workspace_bots.workspace_id` | votre workspace |
| `access_settings.workspace_id` | votre workspace |
| `subscription.workspace_id` | votre workspace |
| Catalogues visibles | ceux que vous avez ajoutés à l'access settings (marketplace) |
| Qui finance | vous (top-up sur votre wallet) |

Avantage : onboarding totalement self-serve, accès unifié à tout le catalogue
multi-publishers.

### 2.2 Mode B — Clé gérée par un publisher pour un partenaire

**Cas d'usage** : un publisher P travaille avec un partenaire qui n'a pas
de compte Liquad, mais à qui P veut donner un accès gratuit ou pré-payé à
**ses propres catalogues uniquement**. Le publisher crée la subscription,
construit une access settings **sur son propre workspace** qui inclut
**uniquement ses catalogues privés** (`catalog.status = 'inactive'`,
mêmes `workspace_id`), puis émet une clé liée à cette access settings.

| | |
|---|---|
| `workspace_bots.workspace_id` | workspace du **publisher** |
| `access_settings.workspace_id` | workspace du **publisher** |
| `subscription.workspace_id` | workspace du **publisher** |
| Catalogues visibles | **uniquement** ceux ajoutés à l'access settings (privés du publisher hôte) |
| Qui finance | le publisher (top-up sur son propre wallet) |

L'isolation est structurelle : un catalogue privé (`status = 'inactive'`)
ne peut être ajouté qu'à une access settings du même workspace — le
trigger `validate_access_settings_catalog` rejette toute autre tentative.

> **Note pour l'intégrateur** : du point de vue de votre code, **rien ne
> change** entre Mode A et Mode B. Vous appelez les mêmes endpoints avec
> la même clé API. La différence est dans le contenu de `/catalogs` et
> `/sources` (combien de catalogues / URLs et de quels publishers) et
> dans le wallet qui se vide.

---

## 3. Authentification

Toutes les routes `/api/consumer/v1/*` exigent le header :

```
Authorization: Bearer lq_<key>
```

Une clé absente, malformée, révoquée ou inconnue renvoie `401`.

```http
HTTP/1.1 401 Unauthorized
Content-Type: application/json

{ "error": "invalid_api_key" }
```

Le workspace de débit, la subscription, le bot et la liste des catalogues
accessibles sont **tous dérivés de la clé** via son `access_settings`.
Vous n'avez jamais à les fournir dans le query string ou le body.

---

## 4. Découverte des catalogues — `GET /api/consumer/v1/catalogs`

Liste les **catalogues** que votre bot peut acheter, à travers tous les
publishers (filtré par UA + IP intersection + scope éventuel).

C'est l'endpoint d'**onboarding** : vous l'appelez en premier pour savoir
ce que vous pouvez acheter, à quel prix, et de quels publishers. Les
catalogues sont peu nombreux (≪ URLs), donc pas de pagination.

Endpoint **idempotent et gratuit** : aucun token, aucun débit.

### Requête

```http
GET /api/consumer/v1/catalogs HTTP/1.1
Host: app.liquad.io
Authorization: Bearer lq_...
```

Aucun query param. Le bot, l'allowlist de catalogues et le `max_price_eur`
sont tous résolus depuis la clé via son `access_settings`.

### Réponse 200

```json
{
  "catalogs": [
    {
      "id": "8c2f7e1a-...",
      "name": "Premium articles",
      "description": "All paywalled long-form content",
      "publisher_workspace_id": "a31b...",
      "price_eur": 0.05,
      "ttl_minutes": 60,
      "source_count": 12473,
      "allowed_ips": ["203.0.113.0/24"]
    }
  ]
}
```

| Champ | Description |
|---|---|
| `id` | UUID du catalogue. Stable. À utiliser dans `?catalog_id=` sur `/sources`. |
| `name` | Nom commercial choisi par le publisher. |
| `description` | Description libre (peut être `null`). |
| `publisher_workspace_id` | UUID du workspace publisher propriétaire. Stable, sert d'identifiant publisher. |
| `price_eur` | Prix par URL achetée (EUR). |
| `ttl_minutes` | Durée de validité d'un token émis pour ce catalogue. |
| `source_count` | Nombre d'indexed sources liées au catalogue. Approximation de la taille. |
| `allowed_ips` | IPs (CIDR) depuis lesquelles le scrape sera autorisé. Union des intersections avec votre bot. |

Les catalogues sont triés par **prix croissant**, puis par nom alphabétique.

### Codes d'erreur

| Statut | Code | Cause |
|---|---|---|
| 401 | `invalid_api_key` | Clé absente, révoquée ou invalide. |
| 403 | `bot_not_in_workspace` | Le bot lié à la clé n'est plus actif pour le workspace. |
| 422 | `bot_missing_ips` | Le bot n'a aucune IP déclarée. |
| 500 | `internal_error` | Erreur serveur. Réessayer plus tard. |

---

## 5. Découverte des URLs — `GET /api/consumer/v1/sources`

Liste les **URLs indexées** accessibles à votre bot, à travers tous les
catalogues accessibles (filtre UA + IP intersection + scope éventuel).

Endpoint **idempotent et gratuit** : aucun token, aucun débit. À utiliser
pour planifier votre stratégie d'achat avant d'appeler `/licenses`.

Pagination par **cursor keyset** : performance constante, ordre stable.

### Requête

```http
GET /api/consumer/v1/sources?domain=example.com&path_prefix=/blog/&limit=2000 HTTP/1.1
Host: app.liquad.io
Authorization: Bearer lq_...
```

Le bot et l'allowlist viennent de la clé via son `access_settings`. Pas de
`bot_id` dans le query string.

| Paramètre | Type | Défaut | Description |
|---|---|---|---|
| `cursor` | UUID | (aucun) | Curseur opaque renvoyé par la réponse précédente (`next_cursor`). Omettre pour la première page. |
| `limit` | int | 1000 | Plage : 1–5000. Nombre max d'URLs renvoyées sur cette page. |
| `domain` | string | (aucun) | Filtre par hostname publisher (ex : `example.com`). Format : `[a-zA-Z0-9.-]+`, max 253 caractères. |
| `path_prefix` | string | (aucun) | Filtre par préfixe de path (ex : `/blog/`). Format : ASCII imprimable sans espaces, max 512 caractères. Match littéral via index B-tree. |
| `catalog_id` | UUID | (aucun) | **Répétable**. Restreint le résultat à un sous-ensemble de catalogues. Max 50 valeurs par requête. Les valeurs hors de votre ensemble accessible sont silencieusement ignorées. |

### Réponse 200

```json
{
  "sources": [
    {
      "id": "0a1b2c3d-...",
      "url": "https://example.com/blog/billing-guide",
      "path": "/blog/billing-guide",
      "domain": "example.com",
      "best_catalog": {
        "id": "8c2f...",
        "name": "Premium articles",
        "price_eur": 0.05,
        "ttl_minutes": 60
      },
      "allowed_ips": ["203.0.113.0/24"]
    }
  ],
  "next_cursor": "0a1b2c3d-..."
}
```

| Champ | Description |
|---|---|
| `sources[].id` | UUID stable de l'indexed source. C'est ce que `next_cursor` retourne. |
| `sources[].url` | URL normalisée de l'indexed source. |
| `sources[].path` | Path de l'URL (ex : `/blog/billing-guide`). Utile pour grouper côté client. |
| `sources[].domain` | Hostname dérivé de l'URL. |
| `sources[].best_catalog` | Catalogue **le moins cher** parmi tous les catalogues accessibles couvrant cette URL. C'est celui qui sera sélectionné par `/licenses` (sauf `max_price_eur` plus bas). |
| `sources[].allowed_ips` | IPs (CIDR) depuis lesquelles le scrape est autorisé pour ce catalogue. Union des intersections avec vos IPs déclarées. |
| `next_cursor` | UUID à passer en `?cursor=` pour la page suivante. `null` si c'est la dernière page. |

### Pagination

```text
1. Premier appel  : GET /sources?limit=5000             → next_cursor: "abc..."
2. Page suivante  : GET /sources?cursor=abc...&limit=5000 → next_cursor: "def..."
3. ...                                                    → next_cursor: "xyz..."
4. Dernière page  : GET /sources?cursor=xyz...&limit=5000 → next_cursor: null
```

L'ordre est par `id` ascendant (UUID v4) — donc arbitraire mais
**stable**. Une URL ne peut pas apparaître deux fois dans une boucle de
pagination, et l'ajout de nouvelles URLs entre deux pages ne réordonne
pas le passé.

> **Vue cohérente face aux mises à jour** : si vous voulez figer une vue
> sur une période donnée, ajoutez `path_prefix` ou `domain` qui restent
> stables. Les indexed sources évoluent à fréquence faible (re-scrape
> périodique des publishers), la dérive intra-pagination est négligeable.

### Codes d'erreur

| Statut | Code | Cause |
|---|---|---|
| 400 | `validation_error` | `limit` hors plage 1–5000, `cursor` pas un UUID, `domain` malformé, `path_prefix` invalide, ou trop de `catalog_id`. |
| 401 | `invalid_api_key` | Clé absente, révoquée ou invalide. |
| 403 | `bot_not_in_workspace` | Le bot lié à la clé n'est plus actif. |
| 422 | `bot_missing_ips` | Le bot n'a aucune IP déclarée. |
| 500 | `internal_error` | Erreur serveur. |

---

## 6. Achat de licences — `POST /api/consumer/v1/licenses`

Achète des tokens HMAC pré-signés pour un batch d'URLs. Chaque résultat
contient un `crawl_url` directement utilisable : si l'URL est licenciée,
`crawl_url` = URL d'origine + `?_lq=<token>` ; sinon `crawl_url` = URL
d'origine telle quelle (le SDK côté publisher bloquera la requête sans
token et émettra un événement de visibilité s'il est installé).

Avec ce contrat, un consommateur (ex. Custom GPT ChatGPT) peut toujours
fetch `results[].crawl_url` sans logique de fallback côté client.

### Requête

```http
POST /api/consumer/v1/licenses HTTP/1.1
Host: app.liquad.io
Authorization: Bearer lq_...
Content-Type: application/json

{
  "urls": [
    "https://example.com/articles/2026/billing-guide",
    "https://example.com/articles/2026/refund-policy"
  ]
}
```

| Champ | Type | Requis | Description |
|---|---|---|---|
| `urls` | string[] | oui | 1 à 100 URLs absolues (`http(s)://...`). Normalisation appliquée côté serveur (suppression du fragment, tri des query params). |

Le bot, la liste de catalogues accessibles et le plafond de prix
(`max_price_eur`) viennent **tous** de la clé via son `access_settings`.
Le caller n'envoie ni `bot_id`, ni `catalog_ids`, ni `network_id`, ni
`max_price_eur`. Pour ajuster le plafond, modifier l'access settings via
le dashboard ou `PATCH /api/internal/.../access-settings/:id`.

### Réponse 200

```json
{
  "results": [
    {
      "url": "https://example.com/articles/2026/billing-guide",
      "crawl_url": "https://example.com/articles/2026/billing-guide?_lq=abc123...",
      "reason": "granted",
      "token": "abc123...base64url...",
      "price_eur": 0.05,
      "catalog_id": "8c2f...",
      "expires_at": "2026-04-29T15:34:00.000Z",
      "cached": false,
      "allowed_ips": ["203.0.113.0/24"]
    },
    {
      "url": "https://example.com/articles/2026/refund-policy",
      "crawl_url": "https://example.com/articles/2026/refund-policy",
      "reason": "no_match"
    }
  ],
  "total_cost_eur": 0.05,
  "balance_remaining_eur": 12.45
}
```

| Champ | Description |
|---|---|
| `results[].url` | URL d'origine telle qu'envoyée par le caller (echo). |
| `results[].crawl_url` | **URL prête à fetch.** Pour `granted` : URL + `?_lq=<token>`. Pour toute autre `reason` : URL d'origine inchangée (sans token). |
| `results[].reason` | Statut par URL — voir tableau ci-dessous. |
| `results[].token` | (granted uniquement) Token base64url. Disponible aussi via `crawl_url`. |
| `results[].cached` | (granted uniquement) `true` si un grant actif existait déjà — aucun débit. Idempotence native dans la fenêtre TTL. |
| `results[].allowed_ips` | (granted uniquement) IPs depuis lesquelles le gateway acceptera le token. Toute IP source en dehors → rejet 403, même avec un token valide. |
| `total_cost_eur` | Somme des `price_eur` des résultats `granted` **non cachés**. `0` en cas de dégradation `insufficient_balance`. |
| `balance_remaining_eur` | Solde de votre subscription après ce débit (inchangé en cas de dégradation). |

### Valeurs de `reason`

| Code | Signification | Action recommandée |
|---|---|---|
| `granted` | Token émis et débité (ou cached). `crawl_url` contient le token. | Fetch `crawl_url`. |
| `no_match` | L'URL n'est indexée par aucun publisher Liquad. | Vérifier l'URL ; appeler `/sources` pour découvrir les URLs accessibles. |
| `no_catalog` | L'URL est indexée mais aucun catalogue de votre access settings ne la couvre, ou tous ceux qui la couvrent dépassent votre `max_price_eur` ou sont devenus inactifs sur la marketplace. | Ajouter le catalogue à votre plan ; augmenter le `max_price_eur` ; demander au publisher d'ajouter votre bot à un catalogue éligible. |
| `no_matching_ips` | Catalogue(s) UA-compatibles existent mais aucun ne partage d'IP avec votre bot. | Mettre à jour `declared_ips` de votre bot pour inclure les IPs réellement utilisées par votre crawler. |
| `domain_not_registered` | Aucun publisher Liquad n'opère ce hostname. | URL hors-système — le crawl direct passe en clair, aucune visibilité Liquad possible. |
| `insufficient_balance` | Solde insuffisant — **dégradation gracieuse** appliquée à toutes les URLs du batch. Aucun token émis, aucun débit. | Recharger la subscription puis réessayer. |

### Exemple minimal

```bash
curl -X POST https://app.liquad.io/api/consumer/v1/licenses \
  -H "Authorization: Bearer lq_..." \
  -H "Content-Type: application/json" \
  -d '{ "urls": ["https://example.com/articles/2026/billing-guide"] }'
```

### Idempotence

L'API est sûre à appeler plusieurs fois pour les mêmes URLs : si un grant
actif existe (TTL non expiré), `cached: true` est renvoyé sans nouveau
débit ni nouveau token. Vous pouvez donc bâtir un retry simple sans
risquer la double facturation.

### Codes d'erreur

| Statut | Code | Cause |
|---|---|---|
| 401 | `invalid_api_key` | Clé absente / invalide. **Strict** — jamais dégradé en 200. |
| 404 | `bot_not_found` | Le bot porté par l'access settings de la clé n'existe plus. |
| 404 | `access_settings_not_found` | L'access settings référencée par la clé a été supprimée. |
| 422 | `bot_missing_ips` | Le bot n'a aucune IP déclarée. |
| 422 | `invalid_url` | Une des URLs est malformée. |

> **Note** : `insufficient_balance` et `domain_not_registered` ne sont
> **plus** des erreurs HTTP. Elles remontent maintenant par-URL via
> `results[].reason` avec un statut 200, pour que l'appelant puisse
> traiter chaque URL de façon uniforme.
| 422 | `invalid_url` | URL malformée. Détails : `{ url }`. |
| 422 | `validation_error` | Body invalide (schéma Zod). |
| 500 | `internal_error` | |

---

## 7. Solde — `GET /api/consumer/v1/balance`

Retourne le solde et le résumé de dépense pour la subscription liée à la
clé API.

### Réponse 200

```json
{
  "workspace_id": "<uuid>",
  "subscription_id": "<uuid>",
  "balance_eur": 12.45,
  "total_spent_eur": 4.23,
  "transaction_count": 87
}
```

`total_spent_eur` est la somme des débits historiques (jamais reset).

---

## 8. Historique — `GET /api/consumer/v1/transactions`

Historique paginé des débits de la subscription liée à la clé.

### Requête

```http
GET /api/consumer/v1/transactions?limit=50&cursor=<opaque> HTTP/1.1
Authorization: Bearer lq_...
```

| Param | Type | Défaut | Description |
|---|---|---|---|
| `limit` | int | 50 | 1–100. |
| `cursor` | string | (aucun) | Curseur opaque renvoyé par la réponse précédente (`next_cursor`). Encode `(created_at, id)`. |

### Réponse 200

```json
{
  "items": [
    {
      "id": "<uuid>",
      "type": "debit",
      "amount_eur": -0.05,
      "content_url": "https://example.com/articles/2026/billing-guide",
      "publisher_workspace_id": "<uuid>",
      "created_at": "2026-04-29T14:34:00.000Z"
    }
  ],
  "next_cursor": "eyJjcmVhdGVkX2F0...",
  "has_more": true
}
```

Pagination : tant que `has_more=true`, repassez `next_cursor` dans le
prochain appel.

> Le format de cursor diffère de `/sources` (ici base64url
> `created_at|id`, là-bas UUID nu) car le tri n'est pas le même. Les deux
> sont opaques pour le client : ne les parsez pas.

---

## 9. Format des tokens HMAC et vérification gateway

### 10.1 Anatomie d'un token

Format : `base64url( grantId.uaPattern.expiryUnix.sigHex )`

Où la signature est :
```
sigHex = HMAC-SHA256(
  publisherSecret,
  grantId + "." + uaPattern + "." + normalizedUrl + "." + expiryUnix
)
```

- `grantId` : UUID retourné par Liquad (lié à votre achat).
- `uaPattern` : votre `ua_pattern` (encodé dans la signature → un token
  émis pour `GPTBot` ne peut pas être réutilisé par un autre bot).
- `normalizedUrl` : URL normalisée (fragment retiré, query params triés).
- `expiryUnix` : timestamp Unix d'expiration.

Vous n'avez **pas besoin** de manipuler le secret du publisher — Liquad
signe les tokens pour vous. Vous transmettez le token tel quel au scrape.

### 10.2 Comment l'utiliser dans le scrape

Le SDK publisher (déployé sur le serveur du publisher comme middleware
Express/Next.js/Cloudflare Worker) attend le token soit dans un header,
soit dans un query param :

```
GET /articles/2026/billing-guide HTTP/1.1
Host: example.com
User-Agent: GPTBot/1.0
X-Liquad-Token: <token>
```

ou :

```
GET /articles/2026/billing-guide?_lq=<token> HTTP/1.1
Host: example.com
User-Agent: GPTBot/1.0
```

(Le nom exact du header / param peut varier selon la config du publisher —
voir la doc SDK ou le `verified_domains` dans la réponse `/sources`.)

### 10.3 Garanties du gateway

Le SDK valide à chaque requête :

1. **HMAC** : signature recalculée localement avec le secret du publisher.
2. **Expiration** : `expiryUnix > now`.
3. **URL** : normalisation → match exact avec celle signée.
4. **UA** : `User-Agent` HTTP doit contenir `uaPattern` (case-insensitive).
5. **IP** : IP source de la requête doit appartenir à `allowed_ips`.

Si l'une de ces vérifications échoue → réponse HTTP 402 (ou 403 selon la
config publisher), votre crawler doit alors gérer le retry (souvent en
ré-appelant `/licenses`).

---

## 10. Catalogue d'erreurs

| HTTP | `error` code | Sens | Endpoints concernés |
|---|---|---|---|
| 400 | `validation_error` | Param ou body invalide (cursor, limit, domain, path_prefix, catalog_id). | `/sources`, `/transactions` |
| 401 | `invalid_api_key` | Clé absente / révoquée / inconnue. | tous |
| 404 | `bot_not_found` | Le bot porté par l'access settings n'existe plus. | `/catalogs`, `/sources`, `/licenses` |
| 404 | `access_settings_not_found` | L'access settings référencée par la clé a été supprimée. | `/catalogs`, `/sources`, `/licenses` |
| 422 | `bot_missing_ips` | Bot sans IP déclarée → impossible d'établir la confiance. | `/catalogs`, `/sources`, `/licenses` |
| 422 | `invalid_url` | URL malformée. | `/licenses` |
| 422 | `validation_error` | Body invalide (Zod) ou paramètre query invalide. | tous |
| 500 | `internal_error` | Erreur serveur. | tous |

> Pour `/licenses`, `insufficient_balance` et le hostname inconnu (anciennement `domain_not_found`) ne sont **plus** retournés en HTTP 4xx — ils remontent par-URL via `results[].reason` avec un statut 200.

Toutes les erreurs renvoient un body JSON `{ error: "<code>", message?: ..., details?: {...} }`.

---

## 11. Limites et quotas

| Limite | Valeur | Endpoint |
|---|---|---|
| URLs par appel `/licenses` | 100 | `/licenses` |
| URLs renvoyées par `/sources` (par page) | 5000 (max) | `/sources` |
| Plage de `limit` `/sources` | 1–5000 | `/sources` |
| `catalog_id` répétés par requête | 50 | `/sources` |
| Longueur de `path_prefix` | 512 caractères | `/sources` |
| Longueur de `domain` | 253 caractères | `/sources` |
| Résultats RAG par appel | 20 | `/query` |
| Longueur de la requête RAG | 2000 caractères | `/query` |
| Plage de `limit` `/transactions` | 1–100 | `/transactions` |
| Format token | base64url | toutes les réponses signées |

Aucun rate limit applicatif en MVP au-delà de ces caps. Liquad se réserve
le droit d'ajouter des quotas par workspace si nécessaire — à venir dans
les en-têtes de réponse (`X-RateLimit-*`).

---

## Annexe — Pattern d'intégration recommandé

```text
┌─────────────────────────────────────────────────────────────┐
│ 1. Onboarding (au démarrage du crawler) :                   │
│    GET /api/consumer/v1/catalogs                            │
│      → quels catalogues, à quel prix, de quels publishers   │
│    Choisir les catalog_ids qui vous intéressent             │
│                                                             │
│ 2. Discovery par catalogue :                                │
│    GET /api/consumer/v1/sources                             │
│        ?catalog_id=<a>&catalog_id=<b>&path_prefix=/blog/    │
│      → liste paginée des URLs accessibles                   │
│    Boucler tant que next_cursor != null                     │
│    Cacher localement (revalider ~1×/jour)                   │
│                                                             │
│ 3. Pour chaque batch d'URLs à crawler :                     │
│    POST /api/consumer/v1/licenses { urls: [...] }           │
│      → tokens HMAC + allowed_ips                            │
│    Envoyer chaque GET au publisher avec le token            │
│      depuis une IP ∈ allowed_ips                            │
│                                                             │
│ 4. Si erreur 402 / 403 sur le scrape :                      │
│    → ré-appeler /licenses (idempotent : cached=true si      │
│      grant encore valide)                                   │
│                                                             │
│ 5. Suivi du solde :                                         │
│    GET /api/consumer/v1/balance (ponctuel)                  │
│    GET /api/consumer/v1/transactions (audit)                │
└─────────────────────────────────────────────────────────────┘
```

### Bonnes pratiques

- **Démarrer par `/catalogs`** plutôt que par `/sources`. Vous obtenez la
  vue produit (publisher × prix × volume) en 1 appel court, et vous
  pouvez ensuite cibler vos appels `/sources` avec `?catalog_id=...`.
- **Cache `/sources` côté client** (TTL ~24h). Les indexed sources évoluent
  lentement (re-scrape périodique du publisher).
- **Cache les tokens** côté client jusqu'à `expires_at`. L'idempotence de
  `/licenses` couvre les ratés mais évitez les appels superflus.
- **Surveillez `results[].reason`** : un volume anormal de `no_match`
  signale que vos URLs sont obsolètes ; un volume de `no_matching_ips`
  signale qu'il faut mettre à jour vos `declared_ips`.
- **Top-up généreusement** : un solde à zéro renvoie 402 sur tout le
  batch, pas seulement les URLs en surplus.
- **Mode B (clé fournie par un publisher)** : ne supposez pas l'accès à
  d'autres publishers. Limitez votre cache `/catalogs` et `/sources` au
  publisher hôte.
