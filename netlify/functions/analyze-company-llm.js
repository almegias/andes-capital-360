/**
 * Netlify Function: analyze-company-llm
 * 
 * Fetches recent news (where possible) and uses an LLM to generate:
 * - A 1-10 score focused on economic viability / asymmetric risk-reward
 * - A full Investment Thesis / Comment analysis
 * 
 * The LLM output can be used for:
 *   1. Mentions & News Sub-score (40% of total Score)
 *   2. The Comment / Investment Thesis column
 * 
 * Usage:
 *   /.netlify/functions/analyze-company-llm?name=Aya%20Gold%20Silver&ticker=AYASF
 */

const NEWS_API_KEY = process.env.NEWS_API_KEY; // Optional - NewsAPI.org
const LLM_API_KEY = process.env.LLM_API_KEY;     // Required - xAI Grok API Key
const LLM_PROVIDER = process.env.LLM_PROVIDER || 'xai'; // 'xai' (recommended) | 'openai'

const USER_PROMPT_TEMPLATE = (companyName) => 
  `Based on available news and sentiment, is ${companyName} a viable investment for an investor or speculator looking for asymmetric risk/reward opportunities? Consider pros and cons focusing in particular on news and sentiment related to economic viability such as high-grade resource potential, positive drill results, permitting milestones, financing announcements, excessive debt or dilution. Make a final recommendation and assign a score to the company from 1 to 10, with 10 being the best.`;

// Simple news fetcher (NewsAPI - free tier available)
async function fetchRecentNews(companyName, ticker) {
  if (!NEWS_API_KEY) {
    return { headlines: [], note: "No NEWS_API_KEY configured. Provide recent headlines manually in Admin tool." };
  }

  const query = encodeURIComponent(`${companyName} OR ${ticker} (mining OR gold OR silver OR copper OR drill OR resource OR financing)`);
  const url = `https://newsapi.org/v2/everything?q=${query}&language=en&sortBy=publishedAt&pageSize=12&apiKey=${NEWS_API_KEY}`;

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`NewsAPI error: ${res.status}`);
    const data = await res.json();

    const headlines = (data.articles || [])
      .slice(0, 10)
      .map(a => ({
        title: a.title,
        source: a.source?.name,
        published: a.publishedAt,
        url: a.url,
        description: a.description
      }));

    return { headlines, note: null };
  } catch (e) {
    return { headlines: [], note: `Failed to fetch news: ${e.message}` };
  }
}

// Call LLM (supports Grok/xAI and OpenAI-compatible APIs)
async function callLLM(newsContext, companyName) {
  if (!LLM_API_KEY) {
    throw new Error("LLM_API_KEY environment variable is not set");
  }

  const systemPrompt = `You are an expert junior mining analyst specializing in asymmetric risk/reward opportunities. 
Be direct, evidence-based, and balanced. Focus on economic viability from recent news and sentiment.
Always return valid JSON only with this exact structure:
{
  "score": number (1-10 with one decimal),
  "summary": "2-3 sentence overall assessment",
  "pros": ["bullet 1", "bullet 2"],
  "cons": ["bullet 1", "bullet 2"],
  "recommendation": "Clear buy/hold/speculative/avoid style recommendation with reasoning"
}`;

  const userMessage = `${USER_PROMPT_TEMPLATE(companyName)}

Recent news and public sentiment:
${newsContext}

Return ONLY the JSON object described above.`;

  let apiUrl, headers, body;

  // Default to xAI (Grok) as requested
  if (LLM_PROVIDER === 'xai' || LLM_PROVIDER === 'grok' || LLM_PROVIDER !== 'openai') {
    // xAI Grok API (recommended)
    apiUrl = 'https://api.x.ai/v1/chat/completions';
    headers = {
      'Authorization': `Bearer ${LLM_API_KEY}`,
      'Content-Type': 'application/json'
    };
    body = {
      model: 'grok-3', // or 'grok-2-latest' if grok-3 not available
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage }
      ],
      temperature: 0.3,
      max_tokens: 1400
    };
  } else {
    // OpenAI fallback
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

  if (!name) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Company name is required' }) };
  }

  try {
    // 1. Gather news context
    const newsResult = await fetchRecentNews(name, ticker);
    let newsContext = newsResult.headlines.length > 0
      ? newsResult.headlines.map(h => `- ${h.title} (${h.source})`).join('\n')
      : "No recent news found automatically.";

    // 2. Call LLM
    const llmResult = await callLLM(newsContext, name);

    // Structure the thesis nicely for storage
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
        news_sources: newsResult.headlines,
        news_note: newsResult.note,
        prompt_used: USER_PROMPT_TEMPLATE(name)
      })
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        error: error.message,
        note: "Make sure LLM_API_KEY is set in Netlify environment variables. NEWS_API_KEY is optional."
      })
    };
  }
};
