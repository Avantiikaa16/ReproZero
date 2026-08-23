export async function GET() {
  return Response.json({
    status: 'ok',
    integrations: {
      openai: Boolean(process.env.OPENAI_API_KEY),
      greptile: Boolean(process.env.GREPTILE_API_KEY),
      github: Boolean(process.env.GITHUB_TOKEN),
      claudeMem: Boolean(process.env.CLAUDE_MEM_BASE_URL),
      stripe: Boolean(process.env.STRIPE_SECRET_KEY),
      stripeWebhook: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
      aws: Boolean(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY),
    },
  }, { headers: { 'Cache-Control': 'no-store' } });
}
