/**
 * Klient LLM - kompatybilny z API OpenAI
 * Obsługuje: OpenAI, Azure OpenAI, Ollama, LM Studio, i inne kompatybilne endpointy
 */

interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
}

interface LlmOptions {
  maxTokens?: number;
  temperature?: number;
  responseFormat?: { type: string };
}

export async function callLlm(messages: LlmMessage[], options: LlmOptions = {}): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  const apiUrl = process.env.OPENAI_API_URL || 'https://api.openai.com/v1';
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';

  if (!apiKey) {
    throw new Error('OPENAI_API_KEY nie jest skonfigurowany. Ustaw klucz API w pliku .env');
  }

  const body: any = {
    model,
    messages,
    max_tokens: options.maxTokens ?? 4000,
    temperature: options.temperature ?? 0.1,
  };

  if (options.responseFormat) {
    body.response_format = options.responseFormat;
  }

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
    throw new Error(`LLM API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  return data?.choices?.[0]?.message?.content ?? '';
}
