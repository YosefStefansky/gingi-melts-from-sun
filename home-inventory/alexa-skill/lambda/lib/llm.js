// Turns whatever Alexa transcribed (raw, unconstrained English) into one
// structured action against the Home Inventory API, using Claude instead of
// Alexa's own slot-grammar NLU - which is what kept mis-hearing/misrouting
// perfectly reasonable phrasings ("add hot dogs to freezer", items outside a
// fixed vocabulary list, etc).
//
// This is a single non-agentic call per turn: Claude either picks exactly
// one tool (the household's intended action) or, when the utterance is
// genuinely ambiguous, returns plain text - which the caller speaks back as
// a clarifying question. There's no second round-trip to Claude to phrase
// the confirmation; the Lambda composes that itself from the tool result,
// to keep latency down (Alexa gives a skill about 8 seconds total, and
// Render's own cold start can already eat into that).

const Anthropic = require('@anthropic-ai/sdk');

const MODEL = 'claude-haiku-4-5';

// Bounds how much session history rides along on each call - both to keep
// latency/cost down and because a stale multi-turn thread from several
// commands ago is more likely to confuse a follow-up than help it.
const MAX_HISTORY_MESSAGES = 8;

const SYSTEM_PROMPT = `You are the natural-language interpreter for a household's voice-controlled kitchen inventory and shopping list assistant. You receive whatever the person said, transcribed by Alexa's speech recognition (so it may contain minor mis-transcriptions), and must translate it into exactly one action against the household's data - or, if it's genuinely unclear, ask a short clarifying question instead of guessing.

Rules:
- Call exactly one tool per turn when the request is clear. Never call more than one.
- Shopping list = things still to buy. Inventory = things already in stock (freezer, fridge, pantry, cabinet, etc).
- "add X to my list" / "we need X" / "buy X" -> add_to_shopping_list. "I bought X" / "put X in the freezer" / "we just got X" -> add_inventory_item.
- If quantity or unit isn't said, omit those fields - the system fills in sensible defaults. Don't guess a location for add_inventory_item unless one was actually said.
- Only ask a clarifying question when you genuinely cannot tell what the person wants (e.g. it's small talk, unrelated to shopping/inventory, or ambiguous between two very different actions). Do NOT ask for confirmation of details you're reasonably confident about (an unusual item name, a quantity, a location) - just proceed. Minor ASR transcription errors in an item name are normal; use your best judgement of what they meant rather than asking about it.
- When you do ask a clarifying question, keep it to one short sentence - this is spoken aloud, not read.`;

const TOOLS = [
  {
    name: 'add_to_shopping_list',
    description:
      "Add an item to the household shopping list (things still to buy). Use when the person wants to buy something later, not when they're describing something they already have.",
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'The item name, e.g. "milk" or "hot dogs".' },
        quantity: { type: 'number', description: 'How many/much. Omit if not said.' },
        unit: { type: 'string', description: 'Unit of measure, e.g. "pound", "box", "gallon". Omit if not said.' }
      },
      required: ['name'],
      additionalProperties: false
    }
  },
  {
    name: 'remove_from_shopping_list',
    description: 'Remove an item from the shopping list.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: { name: { type: 'string' } },
      required: ['name'],
      additionalProperties: false
    }
  },
  {
    name: 'read_shopping_list',
    description: 'Read back everything currently on the shopping list.',
    strict: true,
    input_schema: { type: 'object', properties: {}, required: [], additionalProperties: false }
  },
  {
    name: 'clear_checked_items',
    description: "Clear items already checked/bought off the shopping list - not the whole list.",
    strict: true,
    input_schema: { type: 'object', properties: {}, required: [], additionalProperties: false }
  },
  {
    name: 'check_inventory',
    description:
      'Look up how much of an item the household currently has in stock. Use for "how much/many X do I have" or "do we have any X" questions.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: { name: { type: 'string' } },
      required: ['name'],
      additionalProperties: false
    }
  },
  {
    name: 'add_inventory_item',
    description:
      "Record an item the household now physically has - just bought it, put it away somewhere. Use when the person says they bought something or is putting it away, not for something to buy later.",
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        quantity: { type: 'number', description: 'Omit if not said - defaults to 1.' },
        unit: { type: 'string', description: 'Omit if not said - defaults to "item".' },
        location: {
          type: 'string',
          description: 'Where it was put, e.g. "freezer", "fridge", "pantry", "cabinet". Omit if not said - defaults to "Pantry".'
        }
      },
      required: ['name'],
      additionalProperties: false
    }
  },
  {
    name: 'use_inventory_item',
    description:
      'Record that some quantity of an inventory item was used up, decrementing stock. Use for "we used X" / "we\'re out of X" / "I\'m out of X".',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        quantity: { type: 'number', description: 'How much was used. Omit if not said - defaults to 1.' }
      },
      required: ['name'],
      additionalProperties: false
    }
  },
  {
    name: 'build_shopping_list_from_recipe',
    description:
      "Look up a saved recipe by name and add whatever ingredients aren't already in stock to the shopping list. Use when the person says they're planning to cook or make something.",
    strict: true,
    input_schema: {
      type: 'object',
      properties: { recipe_name: { type: 'string' } },
      required: ['recipe_name'],
      additionalProperties: false
    }
  }
];

let client = null;
function getClient() {
  if (!client) client = new Anthropic();
  return client;
}

/**
 * @param {string} rawText - what Alexa heard, verbatim.
 * @param {Array<{role: string, content: unknown}>} history - prior turns
 *   this session (already capped), oldest first.
 * @returns {Promise<{
 *   toolUse: {name: string, input: Record<string, unknown>} | null,
 *   clarification: string | null,
 *   history: Array<{role: string, content: unknown}>
 * }>}
 */
async function interpretUtterance(rawText, history = []) {
  const messages = [...history, { role: 'user', content: rawText }].slice(
    -MAX_HISTORY_MESSAGES
  );

  const response = await getClient().messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    tools: TOOLS,
    messages
  });

  const toolUseBlock = response.content.find((b) => b.type === 'tool_use');

  if (toolUseBlock) {
    // A completed action ends the thread - no reason to carry this turn's
    // history into the next, unrelated command.
    return {
      toolUse: { name: toolUseBlock.name, input: toolUseBlock.input },
      clarification: null,
      history: []
    };
  }

  const textBlock = response.content.find((b) => b.type === 'text');
  const clarification = textBlock?.text?.trim() || "Sorry, I didn't quite catch that - could you say it differently?";

  // No tool call yet - keep the thread open so the person's answer to the
  // clarifying question has the original request as context.
  return {
    toolUse: null,
    clarification,
    history: [...messages, { role: 'assistant', content: response.content }].slice(
      -MAX_HISTORY_MESSAGES
    )
  };
}

module.exports = { interpretUtterance, MODEL };
