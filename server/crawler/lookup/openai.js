const OpenAI = require('openai');

const DEFAULT_MODEL = process.env.CRAWLER_OPENAI_MODEL || 'gpt-5.4-nano';
const INSTRUCTIONS =
  'Translate the given Japanese car-listing value to a short English term. Reply with ONLY the English term, lowercase, no punctuation.';

function createOpenAiTranslator(apiKey = process.env.OPENAI_API_KEY) {
  if (!apiKey) return null;
  const client = new OpenAI({ apiKey });

  return {
    async translate(field, text) {
      const res = await client.responses.create({
        model: DEFAULT_MODEL,
        store: false,
        reasoning: { effort: 'low' },
        text: { verbosity: 'low' },
        input: [
          { role: 'system', content: INSTRUCTIONS },
          { role: 'user', content: `Field: ${field}\nValue: ${text}` },
        ],
      });
      return res.output_text?.trim().toLowerCase() || null;
    },
  };
}

module.exports = {
  createOpenAiTranslator,
};
