# Home Inventory & Shopping List

Track what you have in your freezer, fridge, pantry, and cabinets; save
recipes/menus and submit them to auto-generate a shopping list for whatever
you're missing; add items to the shopping list on demand; and do all of it
by voice through an Alexa skill, as well as from a web UI.

This app is independent of the wine-store demo (`AlcoSmart`) at the repo
root - it's its own server, its own web UI, and its own Alexa skill.

## Structure

```
home-inventory/
  server/         Node/Express REST API + JSON data store (the source of truth)
  web/            Plain HTML/CSS/JS front end (served by the same server)
  alexa-skill/    Alexa custom skill: interaction model + Lambda function
```

## Quick start (web app)

```bash
cd home-inventory/server
npm install
cp .env.example .env   # optional: set PORT / API_KEY
npm start
```

Then open http://localhost:3000 - the dashboard, inventory, recipes/menus,
and shopping list pages are all there. Data is stored in
`server/data/db.json` (created automatically, gitignored).

## How the "menu → shopping list" flow works

1. Add what you actually have to **Inventory** (name, quantity, unit, and
   which freezer/fridge/pantry/cabinet it's in).
2. Save a few **Recipes** with their ingredients and quantities.
3. On the **Recipes & Menus** page, check off the recipes you're planning to
   cook and click **Submit menu**. The server totals up every ingredient
   across the chosen recipes, subtracts what you already have in inventory,
   and adds only the shortfall to your shopping list (merging into existing
   unchecked lines rather than duplicating).
4. You can also skip all that and just **add anything to the shopping list
   directly**, any time, from the Shopping List page (or by voice - see
   below).
5. Checking an item off the shopping list can optionally fold it straight
   back into inventory (it asks which location) - so buying something closes
   the loop back to "what do I have".

## Alexa

See [`alexa-skill/README.md`](alexa-skill/README.md) for the full voice
command list and deployment steps (Alexa Developer Console + AWS Lambda).
Short version: Alexa doesn't support Hebrew, so the skill - and the whole
app, per your choice - is in English. The skill is a thin Lambda that calls
the same REST API as the web UI, so your server needs to be reachable from
the internet (with `API_KEY` set) for Alexa to reach it; it's not something
that works purely over your home LAN.

## API

The server exposes a small REST API under `/api` - inventory, locations,
recipes, shopping-list, and a `/api/menu/submit` endpoint that runs the
matching described above. See the route files under `server/src/routes/`
for the exact request/response shapes; each one is short and documents
itself.

## Notes / v1 limitations

- Single shared dataset (one household), no user accounts - protect it with
  `API_KEY` once it's exposed to the internet.
- Ingredient/inventory name matching is case/plural-insensitive but not a
  full synonym system (e.g. "scallion" won't match "green onion"). Keep
  naming reasonably consistent between recipes and inventory for the best
  matches.
- No unit conversion - "2 lb" of something won't match "32 oz" of the same
  thing. Pick one unit per item and stick with it.
- Data lives in one JSON file (`server/data/db.json`). Fine for a household;
  back it up like any other file you care about.
