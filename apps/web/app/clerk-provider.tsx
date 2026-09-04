import { ClerkProvider } from '@clerk/nextjs';
import { dark } from '@clerk/themes';

const clerkAppearance = {
  baseTheme: dark,
  variables: {
    colorPrimary: '#c8ff5c',
    colorBackground: '#182635',
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
    // Matches .productFrame in globals.css: the rest of the product
    // separates panels from the page background mainly via this soft drop
    // shadow, not the (intentionally subtle) border alone — omitting it
    // made the auth card blend straight into the page background.
    card: {
      // Solid and deliberately a step lighter than --night/--panel (not a
      // near-black translucent copy of .productFrame) so the card reads as
      // a distinct surface against the page background, not just a shadow
      // outline around the same darkness.
      background: '#182635',
      border: '1px solid rgba(207,224,243,.16)',
      borderRadius: '21px',
      boxShadow: '0 35px 110px rgba(0,0,0,.36)',
    },
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
