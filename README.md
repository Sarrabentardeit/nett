# Dashboard Automations

Trois scripts pour scraper Google Maps, nettoyer une liste d'emails, puis envoyer des emails personnalisés.

Le dépôt distant est [Sarrabentardeit/nett](https://github.com/Sarrabentardeit/nett).

## Prérequis

- [Node.js](https://nodejs.org/) 20 ou plus récent
- [Python](https://www.python.org/) 3.10 ou plus récent
- Google Chrome, utilisé par le scraping

Chaque script tourne dans son propre terminal et doit rester ouvert.

## Installation

```powershell
git clone https://github.com/Sarrabentardeit/nett.git
cd nett
```

### 1. Scraping Google Maps (port 4000)

```powershell
cd node_maps
npm install
npm start
```

Ouvre http://localhost:4000, saisis un mot-clé (par exemple `boulangerie Lyon`), puis lance le scraping. Une fenêtre Chrome s'ouvre : ne la ferme pas pendant le traitement. Le tableau peut ensuite être téléchargé en CSV.

Le port 4000 doit être libre. Si le terminal affiche `Le port 4000 est déjà utilisé`, ferme l'autre programme qui l'occupe, puis relance `npm start`.

### 2. Nettoyage des emails (port 5000)

Depuis la racine du projet :

```powershell
pip install -r requirements.txt
cd python_cleaning
python app.py
```

Le serveur écoute sur http://localhost:5000. La page est ouverte depuis le serveur d'envoi (étape 3) : http://localhost:3000/cleaning.html.

Le fichier Excel doit contenir une colonne dont le nom inclut `email`. Le script vérifie la syntaxe et l'enregistrement MX du domaine, puis renvoie un Excel des adresses retenues.

### 3. Envoi d'emails (port 3000)

Ce serveur sert aussi les pages du tableau de bord.

```powershell
cd python_email
npm install
copy .env.example .env
npm start
```

Dans `.env`, remplace la valeur par une clé API SendGrid :

```text
SENDGRID_API_KEY=ta_cle
```

Ne commite pas ce fichier. Ouvre ensuite http://localhost:3000.

La page d'envoi attend un Excel avec une colonne `Emails` ou `Email`. Une colonne `Prénom` est facultative. Le message peut utiliser `{{ prénom }}`.

## Lancer les trois ensemble

| Terminal | Dossier | Commande | Adresse |
| --- | --- | --- | --- |
| 1 | `node_maps` | `npm start` | http://localhost:4000 |
| 2 | `python_cleaning` | `python app.py` | http://localhost:5000 |
| 3 | `python_email` | `npm start` | http://localhost:3000 |

La page d'accueil est http://localhost:3000. Elle mène au scraping, au nettoyage et à l'envoi.
