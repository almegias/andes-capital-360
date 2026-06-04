/**
 * Netlify Function: create-checkout-session
 * Creates a Stripe Checkout session for subscription.
 * Supports lookup_key (resolves via Stripe API) or direct STRIPE_PRICE_ID env.
 * After successful payment, user is redirected to /success.html which unlocks premium client-side.
 *
 * Required Netlify env vars:
 *   STRIPE_SECRET_KEY=sk_live_... (or sk_test_...)
 *   (Recommended) STRIPE_PRICE_ID=price_123abc...  (from your Stripe Product/Price)
 *
 * The client can also POST { lookup_key: "your_lookup" } and it will resolve it.
 */

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
  if (!STRIPE_SECRET_KEY) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Stripe is not configured. Please add STRIPE_SECRET_KEY in Netlify environment variables.' }),
    };
  }

  // Parse body (supports JSON from our JS or form-urlencoded from possible direct form post)
  let lookup_key = null;
  let body = {};
  try {
    if (event.body) {
      if (event.headers['content-type'] && event.headers['content-type'].includes('application/x-www-form-urlencoded')) {
        const params = new URLSearchParams(event.body);
        lookup_key = params.get('lookup_key');
      } else {
        body = JSON.parse(event.body);
        lookup_key = body.lookup_key || null;
      }
    }
  } catch (e) {
    // ignore parse errors, fall back to env
  }

  const siteUrl = process.env.URL || process.env.DEPLOY_URL || 'https://andescapital360.com';

  try {
    // Prefer STRIPE_PRICE_ID from Netlify env (recommended), then explicit price_id from client body (for convenience), then resolve via lookup_key
    let priceId = (process.env.STRIPE_PRICE_ID || body.price_id || '').trim().replace(/["“”]/g, '') || null;

    // If no direct price ID, try to resolve via lookup_key (Stripe best practice for prebuilt examples)
    if (!priceId && lookup_key) {
      const listUrl = `https://api.stripe.com/v1/prices?lookup_keys[]=${encodeURIComponent(lookup_key)}&active=true&limit=1`;
      const priceListRes = await fetch(listUrl, {
        headers: { 'Authorization': `Bearer ${STRIPE_SECRET_KEY}` },
      });
      if (!priceListRes.ok) {
        const errText = await priceListRes.text();
        throw new Error('Failed to resolve price by lookup_key: ' + errText);
      }
      const priceList = await priceListRes.json();
      if (priceList.data && priceList.data.length > 0) {
        priceId = priceList.data[0].id;
      }
    }

    if (!priceId) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: 'No price ID available. Set STRIPE_PRICE_ID (e.g. price_123...) in Netlify env, or pass a valid lookup_key that is configured on a Price in your Stripe dashboard.',
        }),
      };
    }

    // Build form body for Stripe Checkout Sessions create (Stripe prefers form-encoded for this)
    const form = new URLSearchParams();
    form.append('mode', 'subscription');
    form.append('line_items[0][price]', priceId);
    form.append('line_items[0][quantity]', '1');
    form.append('success_url', `${siteUrl}/success.html?session_id={CHECKOUT_SESSION_ID}`);
    form.append('cancel_url', `${siteUrl}/`);

    // Optional nice-to-haves
    form.append('allow_promotion_codes', 'true');

    const sessionRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
    });

    const session = await sessionRes.json();

    if (session.error) {
      throw new Error(session.error.message || JSON.stringify(session.error));
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: session.url, id: session.id }),
    };
  } catch (err) {
    console.error('create-checkout-session error', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message || 'Failed to create checkout session' }),
    };
  }
};
