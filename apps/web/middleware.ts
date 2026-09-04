import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

const isProtectedRoute = createRouteMatcher([
  '/overview(.*)',
  '/incidents(.*)',
  '/reproductions(.*)',
  '/memory(.*)',
  '/integrations(.*)',
  '/settings(.*)',
]);

export default clerkMiddleware(async (auth, request) => {
  // Only page routes get the redirect-to-sign-in treatment. API routes
  // below are matched so Clerk's auth() has context to read at all (it
  // throws rather than resolving "signed out" for a request middleware
  // never touched), but they get a clean 401 JSON from their own
  // requireWorkspaceContext() call instead of a redirect.
  if (isProtectedRoute(request)) {
    await auth.protect();
  }
});

// `/`, `/sign-in`, `/sign-up`, and the always-public API routes (health,
// the demo reproduce endpoint, Stripe webhook, Clerk webhook) intentionally
// never pass through this middleware, so they keep working even before
// real Clerk keys are configured. Every workspace-owned API route (under
// /api/incidents and /api/integrations) IS matched, purely so auth() can
// resolve inside them — see the authz check they each still run themselves.
export const config = {
  matcher: [
    '/overview(.*)',
    '/incidents(.*)',
    '/reproductions(.*)',
    '/memory(.*)',
    '/integrations(.*)',
    '/settings(.*)',
    '/api/incidents(.*)',
    '/api/integrations(.*)',
  ],
};
