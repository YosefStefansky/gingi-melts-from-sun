# Home Pantry - Alexa Skill

A custom Alexa skill that talks to your Home Inventory server (see
`../server`) so you can manage your shopping list and check your pantry by
voice from an Echo device.

Alexa does not support Hebrew as a skill language, so this skill (and its
interaction model) is in English (`en-US`).

**Invocation name vs. display name**: what you say to Alexa is the
`invocationName` in `skill-package/interactionModels/custom/en-US.json`
(currently "shopping assistant") - changing it is a pure interaction-model
edit (JSON Editor -> Save -> Build Model), no Lambda code or re-upload
needed. That's separate from the skill's *display* name ("Home Pantry" in
`skill-package/skill.json` and this file's title) shown in the Alexa app and
spoken by the Lambda's welcome message (`SKILL_NAME` in `lambda/index.js`)
- those are cosmetic/branding and only need updating if you want everything
to match.

## What it can do

| Say...                                                              | Does |
|-----------------------------------------------------------------------|------|
| "Alexa, ask shopping assistant what's on my shopping list"                  | Reads your unchecked shopping list items |
| "Alexa, tell shopping assistant to add milk to my shopping list"            | Adds an item on demand |
| "Alexa, tell shopping assistant to remove milk from my shopping list"       | Removes an item |
| "Alexa, tell shopping assistant to clear my shopping list"                  | Clears items already checked off |
| "Alexa, ask shopping assistant how much chicken I have"                     | Reads back inventory quantities/locations |
| "Alexa, tell shopping assistant I bought two pounds of ground beef"         | Adds/increments inventory (defaults to Pantry if no location given) |
| "Alexa, tell shopping assistant we're out of eggs"                          | Decrements inventory |
| "Alexa, tell shopping assistant I'm planning to cook spaghetti bolognese"   | Looks up that recipe and adds whatever ingredients you're missing to the shopping list |

Run `Alexa, open shopping assistant` for the welcome message, or `Alexa, ask
shopping assistant for help` any time for a spoken list of things you can
say.

**The session stays open between commands** - every response ends with a
follow-up prompt (e.g. "anything else?") instead of closing, so you can keep
going without saying "Alexa, tell shopping assistant" again each time: "add
milk"... *(pause)* ..."add eggs"... *(pause)* ..."what's on my list". Say
"stop" or "cancel", or just stay quiet, to end the conversation.

## Architecture

```
Echo device --> Alexa service --> this skill's Lambda (lambda/index.js)
                                          |
                                          v
                          Home Inventory REST API (../server)
```

The Lambda is a thin translator: it turns Alexa intents into calls against
the same REST API the web UI uses (`server/src/routes/*`), and turns the
JSON responses back into speech. It holds no data of its own.

**This means your Home Inventory server has to be reachable from the
internet** (Lambda can't reach `localhost` on your machine). Options:

- Deploy `../server` to a small always-on host (a Raspberry Pi behind a
  reverse proxy with a domain, Fly.io, Railway, Render, a $5 VPS, etc).
- For quick testing only: run the server locally and expose it with a
  tunnel like `ngrok http 3000` - just know the URL changes every restart
  unless you're on a paid ngrok plan.

Whichever you choose, **set `API_KEY`** on the server once it's exposed to
the internet (see `../server/.env.example`) and give the Lambda the same
key, so random people can't hit your household's inventory API.

## Deploying

You'll need an [Amazon Developer account](https://developer.amazon.com/alexa/console/ask)
(free) and an AWS account for the Lambda. There's no `ask-cli` config
committed here, so the steps below use the consoles directly - swap in
`ask deploy` if you have the ASK CLI set up and prefer that.

### 1. Create the skill

1. Go to the [Alexa Developer Console](https://developer.amazon.com/alexa/console/ask) → **Create Skill**.
2. Name it (e.g. "Home Pantry"), choose **Custom** model, **Provision your own** backend.
3. On the **Interaction Model** → **JSON Editor** page, paste the contents of
   `skill-package/interactionModels/custom/en-US.json` and **Save Model** →
   **Build Model**.

### 2. Create the Lambda function

1. In the [AWS Lambda console](https://console.aws.amazon.com/lambda/), create a function:
   - Runtime: **Node.js 18.x** or later (needed for the built-in `fetch`).
   - Region: any is fine, but note it - you'll need the ARN.
2. Zip and upload the code:
   ```bash
   cd alexa-skill/lambda
   npm install --omit=dev
   zip -r function.zip index.js lib node_modules package.json
   ```
   Upload `function.zip` via the console (or `aws lambda update-function-code`).
3. Set environment variables on the function (Configuration → Environment variables):
   - `API_BASE_URL` - the public URL of your Home Inventory server, e.g. `https://pantry.example.com`
   - `API_KEY` - must match the server's `API_KEY` (leave both unset only for local testing)
4. Configuration → General configuration: bump the timeout to ~10s (default 3s
   can be tight for a cold start + an outbound HTTPS call).
5. Add an **Alexa Skills Kit** trigger to the function. Copy the function's ARN.

### 3. Connect the skill to the Lambda

Back in the developer console, under **Endpoint**, choose **AWS Lambda ARN**
and paste the ARN from step 2. Save.

### 4. Test it

Use the **Test** tab in the developer console (enable testing for
"Development"), or just talk to any Echo device signed into the same Amazon
account used to build the skill - it shows up automatically without needing
to publish it. Try: *"Alexa, ask shopping assistant what's on my shopping list"*
(see the note on launch phrasing below - lead with "ask"/"tell", not "open").

## Known limitations (v1)

- **Lead with "ask"/"tell", not "open"**: on at least one real device we saw
  *"Alexa, open shopping assistant"* fail with "Home Pantry is not supported on
  this device" while every setting (locale, marketplace, Availability,
  interfaces, build, enablement) checked out fine - and *"Alexa, ask home
  pantry what's on my shopping list"* worked immediately on the same device
  right after. That's consistent with Alexa's NLU occasionally
  mis-resolving a bare "open <generic word>" launch phrase (invocation
  names built around very common words like "home" are more prone to this)
  toward a different skill category instead of cleanly hitting this skill's
  `LaunchRequest`. Direct intent phrasing ("ask ... to ...", "tell ... to
  ...") sidesteps the ambiguity entirely and is what every example phrase
  and the Help response already use. If this bothers you, the fix is to
  pick a more distinctive invocation name (update
  `interactionModels/custom/en-US.json`'s `invocationName` and rebuild) -
  not a code change.
- **Item/location/unit vocabulary**: `ItemName`, `LOCATION_TYPE`, and
  `UNIT_TYPE` are custom slot types with a starter list of common grocery
  items, storage locations, and units
  (`skill-package/interactionModels/custom/en-US.json`). Alexa's speech
  recognition is much more reliable for words in that list. If you regularly
  buy something unusual, add it to the `ITEM_TYPE` values and rebuild the
  interaction model.
- **Recipe names** use `AMAZON.SearchQuery`, which is open vocabulary but
  only reliable when it's the only slot in the utterance (already the case
  here). The Lambda fuzzy-matches whatever Alexa heard against your saved
  recipe names server-side.
- **"Clear my shopping list"** only clears items already checked off, not
  everything on the list - a safety measure so a misheard command can't
  wipe out an active list. Delete individual items by name, or use the web
  UI to clear everything.
- No account linking / per-user data: this is designed for one household's
  shared inventory, protected by the shared `API_KEY` rather than individual
  logins.
