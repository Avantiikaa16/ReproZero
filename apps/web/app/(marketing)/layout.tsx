import { AppClerkProvider } from '../clerk-provider';

/**
 * Only wraps in ClerkProvider when a publishable key is actually configured
 * — ClerkProvider throws immediately otherwise, and the public marketing
 * page must keep working with zero Clerk dependency when keys are absent
 * (e.g. a fresh local clone before .env.local is set up). When there's no
 * key, <SignedIn>/<SignedOut> in the page are skipped entirely (see the
 * clerkConfigured check there) so nothing tries to use missing context.
 */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
    return children;
  }
  return <AppClerkProvider>{children}</AppClerkProvider>;
}
