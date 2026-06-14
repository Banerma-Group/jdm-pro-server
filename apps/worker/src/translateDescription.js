import OpenAI from "openai";

const DEFAULT_MODEL = process.env.CRAWLER_OPENAI_MODEL || "gpt-5.4-nano";
const INSTRUCTIONS =
  "You are a professional automotive translator. Translate the given Japanese " +
  "car-listing description into natural, fluent English. Preserve every factual " +
  "detail (condition, scratches, dents, mileage, equipment, history). Do not add, " +
  "omit, or comment — reply with ONLY the English translation.";

let client = null;

function getClient() {
  if (!process.env.OPENAI_API_KEY) return null;
  if (!client) client = new OpenAI();
  return client;
}

/**
 * Translate a full Japanese listing description to English.
 * Returns the English text, or null when no API key / empty input.
 */
export async function translateDescription(text) {
  const source = typeof text === "string" ? text.trim() : "";
  if (!source) return null;

  const ai = getClient();
  if (!ai) return null;

  const res = await ai.responses.create({
    model: DEFAULT_MODEL,
    store: false,
    reasoning: { effort: "low" },
    text: { verbosity: "low" },
    input: [
      { role: "system", content: INSTRUCTIONS },
      { role: "user", content: source },
    ],
  });

  return res.output_text?.trim() || null;
}
