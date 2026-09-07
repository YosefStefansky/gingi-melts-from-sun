const Alexa = require('ask-sdk-core');
const apiClient = require('./lib/apiClient');

const SKILL_NAME = 'Home Pantry';

function slotValue(handlerInput, slotName) {
  const value = Alexa.getSlotValue(handlerInput.requestEnvelope, slotName);
  return value ? value.trim() : null;
}

function slotNumber(handlerInput, slotName, fallback) {
  const raw = slotValue(handlerInput, slotName);
  const n = raw != null ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? n : fallback;
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

const AddToShoppingListIntentHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
      Alexa.getIntentName(handlerInput.requestEnvelope) === 'AddToShoppingListIntent'
    );
  },
  async handle(handlerInput) {
    const itemName = slotValue(handlerInput, 'ItemName');
    if (!itemName) {
      const speakOutput = "Sorry, I didn't catch what to add. What would you like to add to your shopping list?";
      return respond(handlerInput, speakOutput, speakOutput);
    }

    const quantity = slotNumber(handlerInput, 'Quantity', 1);
    const unit = slotValue(handlerInput, 'Unit') || 'item';

    await apiClient.addShoppingListItem({ name: itemName, quantity, unit, source: 'manual' });

    const speakOutput = `I added ${describeQuantity(quantity, unit, itemName)} to your shopping list.`;
    return respond(handlerInput, speakOutput);
  }
};

const ReadShoppingListIntentHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
      Alexa.getIntentName(handlerInput.requestEnvelope) === 'ReadShoppingListIntent'
    );
  },
  async handle(handlerInput) {
    const list = await apiClient.listShoppingList(false);

    if (list.length === 0) {
      return respond(handlerInput, 'Your shopping list is empty.');
    }

    const MAX_SPOKEN = 15;
    const spokenItems = list
      .slice(0, MAX_SPOKEN)
      .map((i) => describeQuantity(i.quantity, i.unit, i.name))
      .join(', ');
    const remainder = list.length - MAX_SPOKEN;

    const speakOutput =
      `You have ${list.length} ${list.length === 1 ? 'item' : 'items'} on your shopping list: ` +
      `${spokenItems}${remainder > 0 ? `, and ${remainder} more` : ''}.`;

    return respond(handlerInput, speakOutput);
  }
};

const RemoveFromShoppingListIntentHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
      Alexa.getIntentName(handlerInput.requestEnvelope) === 'RemoveFromShoppingListIntent'
    );
  },
  async handle(handlerInput) {
    const itemName = slotValue(handlerInput, 'ItemName');
    if (!itemName) {
      const speakOutput = "Sorry, which item should I remove from your shopping list?";
      return respond(handlerInput, speakOutput, speakOutput);
    }

    const matches = await apiClient.findShoppingListItem(itemName);
    if (matches.length === 0) {
      return respond(handlerInput, `I couldn't find ${itemName} on your shopping list.`);
    }

    await apiClient.removeShoppingListItem(matches[0].id);
    return respond(handlerInput, `I removed ${itemName} from your shopping list.`);
  }
};

const ClearShoppingListIntentHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
      Alexa.getIntentName(handlerInput.requestEnvelope) === 'ClearShoppingListIntent'
    );
  },
  async handle(handlerInput) {
    await apiClient.clearCheckedItems();
    return respond(handlerInput, "I've cleared the checked-off items from your shopping list.");
  }
};

const CheckInventoryIntentHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
      Alexa.getIntentName(handlerInput.requestEnvelope) === 'CheckInventoryIntent'
    );
  },
  async handle(handlerInput) {
    const itemName = slotValue(handlerInput, 'ItemName');
    if (!itemName) {
      const speakOutput = 'Sorry, what item did you want to check?';
      return respond(handlerInput, speakOutput, speakOutput);
    }

    const matches = await apiClient.lookupInventory(itemName);
    if (matches.length === 0) {
      return respond(handlerInput, `You don't have any ${itemName} in your inventory.`);
    }

    const byLocation = matches
      .map((i) => `${i.quantity} ${pluralize(i.quantity, i.unit)} in the ${i.location}`)
      .join(', and ');

    return respond(handlerInput, `You have ${byLocation}.`);
  }
};

const AddInventoryItemIntentHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
      Alexa.getIntentName(handlerInput.requestEnvelope) === 'AddInventoryItemIntent'
    );
  },
  async handle(handlerInput) {
    const itemName = slotValue(handlerInput, 'ItemName');
    if (!itemName) {
      const speakOutput = 'Sorry, what item did you want to add to your inventory?';
      return respond(handlerInput, speakOutput, speakOutput);
    }

    const quantity = slotNumber(handlerInput, 'Quantity', 1);
    const unit = slotValue(handlerInput, 'Unit') || 'item';
    const location = slotValue(handlerInput, 'Location') || 'Pantry';

    await apiClient.createInventoryItem({ name: itemName, quantity, unit, location });

    const locationNote = slotValue(handlerInput, 'Location')
      ? ''
      : " I put it in the pantry since you didn't say where - you can move it in the app.";
    const speakOutput = `Got it, added ${describeQuantity(quantity, unit, itemName)} to the ${location}.${locationNote}`;

    return respond(handlerInput, speakOutput);
  }
};

const UseInventoryItemIntentHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
      Alexa.getIntentName(handlerInput.requestEnvelope) === 'UseInventoryItemIntent'
    );
  },
  async handle(handlerInput) {
    const itemName = slotValue(handlerInput, 'ItemName');
    if (!itemName) {
      const speakOutput = 'Sorry, which item did you use?';
      return respond(handlerInput, speakOutput, speakOutput);
    }

    const matches = await apiClient.lookupInventory(itemName);
    if (matches.length === 0) {
      return respond(handlerInput, `I couldn't find ${itemName} in your inventory.`);
    }

    // If it's stocked in more than one place, take it from wherever there's
    // the most of it - a reasonable guess without asking a follow-up question.
    const target = matches.reduce((a, b) => (b.quantity > a.quantity ? b : a));
    const quantity = slotNumber(handlerInput, 'Quantity', 1);

    const updated = await apiClient.adjustInventoryItem(target.id, -quantity);

    const speakOutput =
      updated.quantity === 0
        ? `Okay, you're all out of ${itemName} now.`
        : `Okay, you have ${updated.quantity} ${pluralize(updated.quantity, updated.unit)} of ${itemName} left in the ${updated.location}.`;

    return respond(handlerInput, speakOutput);
  }
};

const GenerateShoppingListFromMenuIntentHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
      Alexa.getIntentName(handlerInput.requestEnvelope) === 'GenerateShoppingListFromMenuIntent'
    );
  },
  async handle(handlerInput) {
    const recipeName = slotValue(handlerInput, 'RecipeName');
    if (!recipeName) {
      const speakOutput = 'Sorry, what recipe are you planning to make?';
      return respond(handlerInput, speakOutput, speakOutput);
    }

    const matches = await apiClient.lookupRecipe(recipeName);
    if (matches.length === 0) {
      return respond(
        handlerInput,
        `I couldn't find a recipe called ${recipeName}. You can add recipes from the Home Inventory website.`
      );
    }

    const recipe = matches[0];
    const result = await apiClient.submitMenu([recipe.id]);

    if (result.added.length === 0) {
      return respond(handlerInput, `Good news - you already have everything you need for ${recipe.name}.`);
    }

    const MAX_SPOKEN = 12;
    const spokenItems = result.added
      .slice(0, MAX_SPOKEN)
      .map((i) => `${i.quantity} ${pluralize(i.quantity, i.unit)} of ${i.name}`)
      .join(', ');
    const remainder = result.added.length - MAX_SPOKEN;

    const speakOutput =
      `I added what you're missing for ${recipe.name} to your shopping list: ` +
      `${spokenItems}${remainder > 0 ? `, and ${remainder} more` : ''}.`;

    return respond(handlerInput, speakOutput);
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
      "Here's what you can ask me: 'add milk to my shopping list', " +
      "'what's on my shopping list', 'how much chicken do I have', " +
      "'I bought two pounds of ground beef', 'we're out of eggs', " +
      "'I'm planning to cook spaghetti bolognese' to build a shopping list " +
      "from a recipe, or 'wake up' if the server's been asleep and you want " +
      "to warm it up before asking for anything else.";
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
    const speakOutput =
      "Sorry, I didn't understand that. You can ask what's on your shopping list, " +
      'add an item, or check what you have in stock.';
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
    AddToShoppingListIntentHandler,
    ReadShoppingListIntentHandler,
    RemoveFromShoppingListIntentHandler,
    ClearShoppingListIntentHandler,
    CheckInventoryIntentHandler,
    AddInventoryItemIntentHandler,
    UseInventoryItemIntentHandler,
    GenerateShoppingListFromMenuIntentHandler,
    HelpIntentHandler,
    CancelAndStopIntentHandler,
    FallbackIntentHandler,
    SessionEndedRequestHandler
  )
  .addErrorHandlers(ErrorHandler)
  .lambda();
