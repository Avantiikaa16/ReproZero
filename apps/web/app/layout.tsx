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
  metadataBase: new URL('https://reprozero-incidents.avantika1610.chatgpt.site'),
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
