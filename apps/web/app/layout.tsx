import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  // Was pointing at a stale prototype-hosting domain from before this moved
  // to Vercel — every relative OG/Twitter image URL below was resolving
  // against the wrong host, which breaks the link-preview card wherever
  // this gets shared (LinkedIn included). This is read at build time, so
  // it must be the real production domain, not derived from a request.
  metadataBase: new URL('https://reprozero.vercel.app'),
  title: 'ReproZero — Turn incidents into executable reproductions',
  description: 'Compile tickets, logs, and repository context into a running failure, then prove the repair.',
  openGraph: {
    title: 'ReproZero',
    description: 'Turn production incidents into executable reproductions.',
    images: ['/og.png'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ReproZero',
    description: 'Turn production incidents into executable reproductions.',
    images: ['/og.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
