/**
 * Klient LLM - kompatybilny z API OpenAI i Abacus AI
 * Priorytety:
 *   1. ABACUSAI_API_KEY → https://apps.abacus.ai/v1
 *   2. OPENAI_API_KEY + OPENAI_API_URL → customowy endpoint
 *   3. OPENAI_API_KEY → https://api.openai.com/v1
 */

interface LlmContentPart {
  type: string;
  text?: string;
  image_url?: { url: string };
  file?: { filename: string; file_data: string };
}

interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | LlmContentPart[];
}

interface LlmOptions {
  maxTokens?: number;
  temperature?: number;
  responseFormat?: { type: string };
}

export async function callLlm(messages: LlmMessage[], options: LlmOptions = {}): Promise<string> {
  // Próba 1: Abacus AI API
  const abacusKey = process.env.ABACUSAI_API_KEY;
  // Próba 2: OpenAI / kompatybilne
  const openaiKey = process.env.OPENAI_API_KEY;

  const apiKey = abacusKey || openaiKey;
  if (!apiKey) {
    throw new Error('Brak klucza API. Ustaw ABACUSAI_API_KEY lub OPENAI_API_KEY w pliku .env');
  }

  const apiUrl = abacusKey
    ? 'https://apps.abacus.ai/v1'
    : (process.env.OPENAI_API_URL || 'https://api.openai.com/v1');

  const model = process.env.LLM_MODEL || (abacusKey ? 'gpt-5.4-mini' : 'gpt-4o-mini');

  const body: any = {
    model,
    messages,
    max_tokens: options.maxTokens ?? 4000,
    temperature: options.temperature ?? 0.1,
  };

  if (options.responseFormat) {
    body.response_format = options.responseFormat;
  }

  console.log(`[LLM] Calling ${apiUrl}/chat/completions, model=${model}, key=${apiKey.substring(0, 6)}...`);

  const response = await fetch(`${apiUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`LLM API error (${response.status}): ${errorText.substring(0, 300)}`);
  }

  const data = await response.json();
  return data?.choices?.[0]?.message?.content ?? '';
}
