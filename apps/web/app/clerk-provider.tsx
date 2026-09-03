import { ClerkProvider } from '@clerk/nextjs';
import { dark } from '@clerk/themes';

const clerkAppearance = {
  baseTheme: dark,
  variables: {
    colorPrimary: '#c8ff5c',
    colorBackground: '#0d1924',
    colorInputBackground: '#071018',
    // Both naming generations are set intentionally: this Clerk version's
    // typed token names (colorForeground/colorMutedForeground) coexist with
    // the older colorText/colorTextSecondary names some internals still
    // read. Redundant, but harmless, and avoids depending on exactly which
    // one a given component version resolves.
    colorForeground: '#eef4ff',
    colorMutedForeground: '#8d99aa',
    colorText: '#eef4ff',
    colorTextSecondary: '#8d99aa',
    colorInputForeground: '#eef4ff',
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
