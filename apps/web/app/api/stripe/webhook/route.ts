const processedEvents = new Set<string>();

function timingSafeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return mismatch === 0;
}

async function sign(secret: string, payload: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function verifyStripeSignature(body: string, header: string, secret: string) {
  const parts = header.split(',').map((part) => part.split('='));
  const timestamp = parts.find(([key]) => key === 't')?.[1];
  const signatures = parts.filter(([key]) => key === 'v1').map(([, value]) => value);
  if (!timestamp || signatures.length === 0) return false;

  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > 300) return false;
  const expected = await sign(secret, `${timestamp}.${body}`);
  return signatures.some((candidate) => timingSafeEqual(candidate, expected));
}

export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return Response.json({ error: 'Stripe webhook is not configured.' }, { status: 503 });

  const signature = request.headers.get('stripe-signature');
  const body = await request.text();
  if (!signature || !(await verifyStripeSignature(body, signature, secret))) {
    return Response.json({ error: 'Invalid Stripe signature.' }, { status: 400 });
  }

  let event: { id?: string; type?: string };
  try {
    event = JSON.parse(body);
  } catch {
    return Response.json({ error: 'Invalid JSON payload.' }, { status: 400 });
  }

  if (!event.id || !event.type) return Response.json({ error: 'Malformed Stripe event.' }, { status: 400 });
  const duplicate = processedEvents.has(event.id);
  processedEvents.add(event.id);

  return Response.json({ received: true, duplicate, eventId: event.id, eventType: event.type });
}

export async function GET() {
  return Response.json({ service: 'ReproZero Stripe incident adapter', configured: Boolean(process.env.STRIPE_WEBHOOK_SECRET) });
}
