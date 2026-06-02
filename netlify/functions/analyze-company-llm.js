/**
 * Netlify Function: analyze-company-llm
 * 
 * Uses xAI (Grok) directly for sentiment and market analysis / investment thesis.
 * No external news fetch from NewsAPI (removed per request - sentiment and analysis come from Grok/xAI knowledge).
 * 
 * The LLM is prompted with the provided prompt (or default) and company name.
 * 
 * Usage:
 *   /.netlify/functions/analyze-company-llm?name=Aya%20Gold%20Silver&ticker=AYASF&prompt=... (optional custom prompt)
 */

const LLM_API_KEY = process.env.LLM_API_KEY;     // Required - xAI Grok API Key
const LLM_PROVIDER = process.env.LLM_PROVIDER || 'xai'; // 'xai' (recommended) | 'openai'

const DEFAULT_PROMPT_TEMPLATE = (companyName) => 
  `Based on available news and sentiment, is ${companyName} a viable investment for an investor or speculator looking for asymmetric risk/reward opportunities? Consider pros and cons and make a final recommendation and assign a score to the company from 1 to 10, with 10 being the best.`;

// Call LLM (Grok/xAI by default)
async function callLLM(companyName, prompt) {
  if (!LLM_API_KEY) {
    throw new Error("LLM_API_KEY environment variable is not set");
  }

  const systemPrompt = `You are an expert analyst specializing in asymmetric risk/reward opportunities. 
Be direct, evidence-based, and balanced. Focus on economic viability, market sentiment, and investment potential.
Always return valid JSON only with this exact structure:
{
  "score": number (1-10 with one decimal),
  "summary": "2-3 sentence overall assessment",
  "pros": ["bullet 1", "bullet 2"],
  "cons": ["bullet 1", "bullet 2"],
  "recommendation": "Clear buy/hold/speculative/avoid style recommendation with reasoning"
}`;

  const userMessage = `${prompt}

Return ONLY the JSON object described above.`;

  let apiUrl, headers, body;

  if (LLM_PROVIDER === 'xai' || LLM_PROVIDER === 'grok' || LLM_PROVIDER !== 'openai') {
    apiUrl = 'https://api.x.ai/v1/chat/completions';
    headers = {
      'Authorization': `Bearer ${LLM_API_KEY}`,
      'Content-Type': 'application/json'
    };
    body = {
      model: 'grok-3',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage }
      ],
      temperature: 0.3,
      max_tokens: 1400
    };
  } else {
    apiUrl = 'https://api.openai.com/v1/chat/completions';
    headers = {
      'Authorization': `Bearer ${LLM_API_KEY}`,
      'Content-Type': 'application/json'
    };
    body = {
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage }
      ],
      temperature: 0.3,
      response_format: { type: "json_object" },
      max_tokens: 1400
    };
  }

  const res = await fetch(apiUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`LLM API error: ${res.status} - ${err}`);
  }

  const json = await res.json();
  const content = json.choices?.[0]?.message?.content;

  try {
    return JSON.parse(content);
  } catch (e) {
    return { error: "Failed to parse LLM JSON", raw: content };
  }
}

exports.handler = async (event) => {
  const name = (event.queryStringParameters?.name || '').trim();
  const ticker = (event.queryStringParameters?.ticker || '').trim().toUpperCase();
  const customPrompt = event.queryStringParameters?.prompt;

  if (!name) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Company name is required' }) };
  }

  try {
    // No external news fetch - sentiment and analysis from xAI Grok directly
    const promptToUse = customPrompt || DEFAULT_PROMPT_TEMPLATE(name);

    const llmResult = await callLLM(name, promptToUse);

    const formattedThesis = llmResult.error ? null : 
      `${llmResult.summary || ''}

**Pros:**
${(llmResult.pros || []).map(p => `- ${p}`).join('\n')}

**Cons:**
${(llmResult.cons || []).map(c => `- ${c}`).join('\n')}

**Recommendation:** ${llmResult.recommendation || ''}`;

    return {
      statusCode: 200,
      body: JSON.stringify({
        company: { name, ticker },
        llm: llmResult,
        formatted_thesis: formattedThesis,
        prompt_used: promptToUse
      })
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        error: error.message,
        note: "Make sure LLM_API_KEY is set in Netlify environment variables."
      })
    };
  }
};
