const Alexa = require('ask-sdk-core');
const apiClient = require('./lib/apiClient');
const { interpretUtterance } = require('./lib/llm');

const SKILL_NAME = 'Home Pantry';

function slotValue(handlerInput, slotName) {
  const value = Alexa.getSlotValue(handlerInput.requestEnvelope, slotName);
  return value ? value.trim() : null;
}

// Alexa hands back whatever the caller actually said (e.g. "pound" or
// "pounds"), so normalize to a singular key first and then pluralize off
// that, rather than trusting the form the slot happened to come back as.
const UNIT_SINGULAR = {
  pounds: 'pound', lb: 'pound', lbs: 'pound',
  ounces: 'ounce', oz: 'ounce',
  grams: 'gram', g: 'gram',
  kilograms: 'kilogram', kg: 'kilogram',
  liters: 'liter', litre: 'liter', litres: 'liter',
  gallons: 'gallon',
  boxes: 'box',
  bags: 'bag',
  cans: 'can',
  bottles: 'bottle',
  dozens: 'dozen',
  pieces: 'piece',
  cups: 'cup',
  packages: 'package', pack: 'package', packs: 'package',
  jars: 'jar',
  loaves: 'loaf',
  cartons: 'carton',
  rolls: 'roll',
  items: 'item'
};
const UNIT_PLURAL = {
  pound: 'pounds', ounce: 'ounces', gram: 'grams', kilogram: 'kilograms',
  liter: 'liters', gallon: 'gallons', box: 'boxes', bag: 'bags', can: 'cans',
  bottle: 'bottles', dozen: 'dozen', piece: 'pieces', cup: 'cups',
  package: 'packages', jar: 'jars', loaf: 'loaves', carton: 'cartons',
  roll: 'rolls', item: 'items'
};

function pluralize(quantity, unit) {
  const key = UNIT_SINGULAR[unit] || unit;
  if (quantity === 1) return key;
  return UNIT_PLURAL[key] || `${key}s`;
}

/** "I added {quantity} {unit(s)} of {name}" - or just the name when the
 * quantity is the default single "item", which reads more naturally. */
function describeQuantity(quantity, unit, name) {
  if (unit === 'item' && quantity === 1) return name;
  return `${quantity} ${pluralize(quantity, unit)} of ${name}`;
}

// Without an explicit reprompt, Alexa closes the session after a single
// exchange - you'd have to say "Alexa, tell shopping assistant..." again
// for every command. This keeps the mic open (shouldEndSession: false) with
// a reprompt so multiple commands can be chained in one conversation; pass
// a specific repromptOutput (usually the same question again) for
// clarification turns, otherwise it defaults to a generic "anything else?".
function respond(handlerInput, speakOutput, repromptOutput = 'Anything else?') {
  return handlerInput.responseBuilder
    .speak(speakOutput)
    .reprompt(repromptOutput)
    .withShouldEndSession(false)
    .getResponse();
}

// For turns that should end the conversation (goodbye, unrecoverable
// errors): no reprompt, and shouldEndSession explicit rather than relying
// on the SDK's default.
function respondAndEndSession(handlerInput, speakOutput) {
  return handlerInput.responseBuilder
    .speak(speakOutput)
    .withShouldEndSession(true)
    .getResponse();
}

// The backend (Render free tier) can be asleep and take 20-50s to wake -
// far longer than Alexa's ~8s response budget - so nothing here can just
// wait for it to fully come up. Instead this fires a short, bounded request
// that's enough to make the host start booting, gives up quickly, and lets
// the user's *next* utterance land on an already-warm (or at least warming)
// server.
async function pingHealth(timeoutMs) {
  const baseUrl = process.env.API_BASE_URL;
  if (!baseUrl) return false;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/api/health`, {
      signal: controller.signal
    });
    return res.ok;
  } catch {
    // Timed out or errored - the request still reached the host and kicked
    // off its wake-up, we just didn't wait around for the reply.
    return false;
  } finally {
    clearTimeout(timer);
  }
}

const LaunchRequestHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'LaunchRequest';
  },
  async handle(handlerInput) {
    // Fire-and-bounded-wait so "Alexa, open home pantry" also nudges a
    // sleeping server awake while the welcome message plays, without
    // risking Alexa's own response timeout if the server is slow.
    await pingHealth(2500);

    const speakOutput =
      `Welcome to ${SKILL_NAME}. You can ask what's on your shopping list, ` +
      "add or remove items, check what's in your pantry or freezer, or say " +
      "you're planning to cook a recipe to build a shopping list for it. " +
      'What would you like to do?';
    return respond(handlerInput, speakOutput, speakOutput);
  }
};

const WakeUpIntentHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
      Alexa.getIntentName(handlerInput.requestEnvelope) === 'WakeUpIntent'
    );
  },
  async handle(handlerInput) {
    const awake = await pingHealth(3000);
    const speakOutput = awake
      ? "The pantry server's already up and ready to go."
      : "Okay, waking up the pantry server now. Give it about thirty seconds, then try your request again.";
    // Deliberately ends the session rather than staying open: if it's still
    // waking up, there's nothing useful to say next until that finishes, and
    // an open mic here would just invite a too-early retry.
    return respondAndEndSession(handlerInput, speakOutput);
  }
};

// Runs the one action Claude decided on, against the same REST API the old
// slot-based handlers used, and composes the spoken confirmation. Kept as a
// second step (not folded into the LLM call) so confirmations are
// deterministic and don't cost a second round-trip to Claude.
async function executeToolUse(name, input) {
  switch (name) {
    case 'add_to_shopping_list': {
      const quantity = input.quantity ?? 1;
      const unit = input.unit || 'item';
      await apiClient.addShoppingListItem({ name: input.name, quantity, unit, source: 'manual' });
      return `I added ${describeQuantity(quantity, unit, input.name)} to your shopping list.`;
    }

    case 'remove_from_shopping_list': {
      const matches = await apiClient.findShoppingListItem(input.name);
      if (matches.length === 0) return `I couldn't find ${input.name} on your shopping list.`;
      await apiClient.removeShoppingListItem(matches[0].id);
      return `I removed ${input.name} from your shopping list.`;
    }

    case 'read_shopping_list': {
      const list = await apiClient.listShoppingList(false);
      if (list.length === 0) return 'Your shopping list is empty.';
      const MAX_SPOKEN = 15;
      const spokenItems = list
        .slice(0, MAX_SPOKEN)
        .map((i) => describeQuantity(i.quantity, i.unit, i.name))
        .join(', ');
      const remainder = list.length - MAX_SPOKEN;
      return (
        `You have ${list.length} ${list.length === 1 ? 'item' : 'items'} on your shopping list: ` +
        `${spokenItems}${remainder > 0 ? `, and ${remainder} more` : ''}.`
      );
    }

    case 'clear_checked_items': {
      await apiClient.clearCheckedItems();
      return "I've cleared the checked-off items from your shopping list.";
    }

    case 'check_inventory': {
      const matches = await apiClient.lookupInventory(input.name);
      if (matches.length === 0) return `You don't have any ${input.name} in your inventory.`;
      const byLocation = matches
        .map((i) => `${i.quantity} ${pluralize(i.quantity, i.unit)} in the ${i.location}`)
        .join(', and ');
      return `You have ${byLocation}.`;
    }

    case 'add_inventory_item': {
      const quantity = input.quantity ?? 1;
      const unit = input.unit || 'item';
      const location = input.location || 'Pantry';
      await apiClient.createInventoryItem({ name: input.name, quantity, unit, location });
      const locationNote = input.location
        ? ''
        : " I put it in the pantry since you didn't say where - you can move it in the app.";
      return `Got it, added ${describeQuantity(quantity, unit, input.name)} to the ${location}.${locationNote}`;
    }

    case 'use_inventory_item': {
      const matches = await apiClient.lookupInventory(input.name);
      if (matches.length === 0) return `I couldn't find ${input.name} in your inventory.`;
      // If it's stocked in more than one place, take it from wherever
      // there's the most of it - a reasonable guess without a follow-up.
      const target = matches.reduce((a, b) => (b.quantity > a.quantity ? b : a));
      const quantity = input.quantity ?? 1;
      const updated = await apiClient.adjustInventoryItem(target.id, -quantity);
      return updated.quantity === 0
        ? `Okay, you're all out of ${input.name} now.`
        : `Okay, you have ${updated.quantity} ${pluralize(updated.quantity, updated.unit)} of ${input.name} left in the ${updated.location}.`;
    }

    case 'build_shopping_list_from_recipe': {
      const matches = await apiClient.lookupRecipe(input.recipe_name);
      if (matches.length === 0) {
        return `I couldn't find a recipe called ${input.recipe_name}. You can add recipes from the Home Inventory website.`;
      }
      const recipe = matches[0];
      const result = await apiClient.submitMenu([recipe.id]);
      if (result.added.length === 0) {
        return `Good news - you already have everything you need for ${recipe.name}.`;
      }
      const MAX_SPOKEN = 12;
      const spokenItems = result.added
        .slice(0, MAX_SPOKEN)
        .map((i) => `${i.quantity} ${pluralize(i.quantity, i.unit)} of ${i.name}`)
        .join(', ');
      const remainder = result.added.length - MAX_SPOKEN;
      return (
        `I added what you're missing for ${recipe.name} to your shopping list: ` +
        `${spokenItems}${remainder > 0 ? `, and ${remainder} more` : ''}.`
      );
    }

    default:
      // Shouldn't happen - Claude can only call a tool from the list it was
      // given - but fail safely rather than crash into the ErrorHandler.
      return "Sorry, I'm not sure how to do that. Could you try rephrasing it?";
  }
}

// Catches whatever Alexa transcribed, verbatim (see interactionModels'
// NaturalLanguageIntent - a single AMAZON.SearchQuery slot with no carrier
// words), and hands it to Claude to figure out. This replaced eight
// separate slot-grammar intents that kept mis-hearing perfectly reasonable
// phrasings ("add hot dogs to freezer" without "the", items outside a fixed
// vocabulary list, ...) - Claude's language understanding doesn't need any
// of that tuning.
const NaturalLanguageIntentHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
      Alexa.getIntentName(handlerInput.requestEnvelope) === 'NaturalLanguageIntent'
    );
  },
  async handle(handlerInput) {
    const rawText = slotValue(handlerInput, 'RawText');
    if (!rawText) {
      const speakOutput = "Sorry, I didn't catch that - what would you like to do?";
      return respond(handlerInput, speakOutput, speakOutput);
    }

    // A short rolling history (capped in lib/llm.js) rides in session
    // attributes so a clarifying question ("did you mean the fridge or the
    // freezer?") and the person's answer stay connected to the original
    // request, without re-sending the whole conversation from scratch.
    const attributesManager = handlerInput.attributesManager;
    const sessionAttributes = attributesManager.getSessionAttributes();

    const { toolUse, clarification, history } = await interpretUtterance(
      rawText,
      sessionAttributes.llmHistory || []
    );

    sessionAttributes.llmHistory = history;
    attributesManager.setSessionAttributes(sessionAttributes);

    if (toolUse) {
      const speakOutput = await executeToolUse(toolUse.name, toolUse.input);
      return respond(handlerInput, speakOutput);
    }

    // Claude asked for clarification instead of acting - speak it and keep
    // listening for the answer.
    return respond(handlerInput, clarification, clarification);
  }
};

const HelpIntentHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
      Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.HelpIntent'
    );
  },
  handle(handlerInput) {
    const speakOutput =
      "Just tell me what you want in plain English - things like 'add milk " +
      "to my shopping list', 'how much chicken do I have', 'I bought two " +
      "pounds of ground beef', 'we're out of eggs', or 'I'm planning to " +
      "cook spaghetti bolognese' to build a shopping list from a recipe. " +
      "Say 'wake up' if the server's been asleep and you want to warm it up " +
      "before asking for anything else.";
    return respond(handlerInput, speakOutput, speakOutput);
  }
};

const CancelAndStopIntentHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
      (Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.CancelIntent' ||
        Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.StopIntent')
    );
  },
  handle(handlerInput) {
    return respondAndEndSession(handlerInput, 'Goodbye!');
  }
};

const FallbackIntentHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
      Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.FallbackIntent'
    );
  },
  handle(handlerInput) {
    // With NaturalLanguageIntent catching almost any utterance, Alexa's own
    // fallback is rare in practice - it means the platform couldn't match
    // *any* intent at all, not that Claude failed to understand something.
    const speakOutput =
      "Sorry, I didn't catch that at all. Try telling me what you want in " +
      'plain English, like "add milk to my shopping list."';
    return respond(handlerInput, speakOutput, speakOutput);
  }
};

const SessionEndedRequestHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'SessionEndedRequest';
  },
  handle(handlerInput) {
    return handlerInput.responseBuilder.getResponse();
  }
};

const ErrorHandler = {
  canHandle() {
    return true;
  },
  handle(handlerInput, error) {
    console.error(`Error handling request: ${error.stack || error}`);
    const speakOutput =
      "Sorry, I'm having trouble reaching your home inventory system right now. Please try again in a moment.";
    return respondAndEndSession(handlerInput, speakOutput);
  }
};

exports.handler = Alexa.SkillBuilders.custom()
  .addRequestHandlers(
    LaunchRequestHandler,
    WakeUpIntentHandler,
    NaturalLanguageIntentHandler,
    HelpIntentHandler,
    CancelAndStopIntentHandler,
    FallbackIntentHandler,
    SessionEndedRequestHandler
  )
  .addErrorHandlers(ErrorHandler)
  .lambda();
