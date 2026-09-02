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
  if (isProtectedRoute(request)) {
    await auth.protect();
  }
});

// Scoped to only the six protected app-shell routes. `/`, `/sign-in`,
// `/sign-up`, and every `/api/*` route (including the existing demo API and
// the Clerk webhook) intentionally never pass through this middleware, so
// they keep working even before real Clerk keys are configured.
export const config = {
  matcher: [
    '/overview(.*)',
    '/incidents(.*)',
    '/reproductions(.*)',
    '/memory(.*)',
    '/integrations(.*)',
    '/settings(.*)',
  ],
};
