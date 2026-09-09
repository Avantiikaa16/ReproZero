import type { Metadata } from 'next';
import { eq } from 'drizzle-orm';
import { db } from '../../../../db/client';
import { incidents } from '../../../../db/schema';
import { ShowcaseClient } from './showcase-client';

type Props = { params: Promise<{ slug: string }> };

/**
 * A Server Component wrapper purely so this can set per-incident Open
 * Graph/Twitter metadata (title, description) — the actual page content
 * below is the existing client component, unchanged. This matters because
 * the whole point of a showcase link is being pasted somewhere (LinkedIn,
 * a resume, Slack) where the link-preview card is often the only thing a
 * viewer sees before deciding to click — the root layout's generic
 * site-wide metadata would show "ReproZero" for every incident's link
 * alike, indistinguishable from each other.
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  try {
    const [incident] = await db
      .select({ title: incidents.title, summary: incidents.summary })
      .from(incidents)
      .where(eq(incidents.publicSlug, slug));

    if (!incident) {
      return { title: 'Incident not found — ReproZero' };
    }

    const description =
      incident.summary?.slice(0, 200) ||
      'A real incident reproduced end to end with ReproZero — evidence, sandboxed execution, and a verified fix.';

    return {
      title: `${incident.title} — ReproZero`,
      description,
      openGraph: { title: incident.title, description, images: ['/og.png'] },
      twitter: { card: 'summary_large_image', title: incident.title, description, images: ['/og.png'] },
    };
  } catch (error) {
    // DB unreachable shouldn't break metadata generation (or the page) —
    // same fail-open philosophy as db/client.ts's lazy connection.
    console.error('Failed to generate showcase metadata.', error);
    return { title: 'ReproZero — Incident showcase' };
  }
}

export default async function ShowcasePage({ params }: Props) {
  const { slug } = await params;
  return <ShowcaseClient slug={slug} />;
}
