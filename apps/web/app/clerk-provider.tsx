import { ClerkProvider } from '@clerk/nextjs';

const clerkAppearance = {
  variables: {
    colorPrimary: '#c8ff5c',
    colorBackground: '#0d1924',
    colorInputBackground: '#071018',
    colorText: '#eef4ff',
    colorTextSecondary: '#8d99aa',
    colorDanger: '#ff846e',
    borderRadius: '10px',
    fontFamily: 'var(--font-geist-sans), Arial, sans-serif',
  },
  elements: {
    card: { border: '1px solid rgba(207,224,243,.13)', boxShadow: 'none' },
    footerActionLink: { color: '#63d9ff' },
  },
};

/**
 * Scoped to the (app) and (auth) route groups only — never the root layout.
 * ClerkProvider throws immediately if NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is
 * unset, and the public marketing page at `/` must keep working with zero
 * Clerk dependency until real keys are configured.
 */
export function AppClerkProvider({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider
      appearance={clerkAppearance}
      afterSignOutUrl="/"
      signInFallbackRedirectUrl="/overview"
      signUpFallbackRedirectUrl="/overview"
    >
      {children}
    </ClerkProvider>
  );
}
