import { Webhook } from 'svix';
import { db } from '../../../../db/client';
import { memberships, organizations, users } from '../../../../db/schema';
import { eq } from 'drizzle-orm';

type ClerkUserEvent = {
  type: string;
  data: {
    id: string;
    email_addresses?: Array<{ id: string; email_address: string }>;
    primary_email_address_id?: string;
    first_name?: string | null;
    last_name?: string | null;
    image_url?: string | null;
  };
};

type ClerkOrgEvent = {
  type: string;
  data: { id: string; slug: string; name: string };
};

type ClerkMembershipEvent = {
  type: string;
  data: {
    id: string;
    role: string;
    organization: { id: string };
    public_user_data: { user_id: string };
  };
};

function primaryEmail(data: ClerkUserEvent['data']): string {
  const match = data.email_addresses?.find((entry) => entry.id === data.primary_email_address_id);
  return match?.email_address ?? data.email_addresses?.[0]?.email_address ?? '';
}

function displayName(data: ClerkUserEvent['data']): string | null {
  const name = [data.first_name, data.last_name].filter(Boolean).join(' ').trim();
  return name.length > 0 ? name : null;
}

function normalizeRole(role: string): 'owner' | 'admin' | 'member' {
  if (role.includes('admin') || role.includes('owner')) {
    return role.includes('owner') ? 'owner' : 'admin';
  }
  return 'member';
}

export async function POST(request: Request) {
  const secret = process.env.CLERK_WEBHOOK_SECRET;
  if (!secret) {
    return Response.json({ error: 'Clerk webhook is not configured.' }, { status: 503 });
  }

  const body = await request.text();
  const svixId = request.headers.get('svix-id');
  const svixTimestamp = request.headers.get('svix-timestamp');
  const svixSignature = request.headers.get('svix-signature');
  if (!svixId || !svixTimestamp || !svixSignature) {
    return Response.json({ error: 'Missing Svix headers.' }, { status: 400 });
  }

  let event: ClerkUserEvent | ClerkOrgEvent | ClerkMembershipEvent;
  try {
    const webhook = new Webhook(secret);
    event = webhook.verify(body, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    }) as typeof event;
  } catch {
    return Response.json({ error: 'Invalid webhook signature.' }, { status: 400 });
  }

  try {
    switch (event.type) {
      case 'user.created':
      case 'user.updated': {
        const data = (event as ClerkUserEvent).data;
        await db
          .insert(users)
          .values({
            clerkUserId: data.id,
            email: primaryEmail(data),
            displayName: displayName(data),
            avatarUrl: data.image_url ?? null,
          })
          .onConflictDoUpdate({
            target: users.clerkUserId,
            set: {
              email: primaryEmail(data),
              displayName: displayName(data),
              avatarUrl: data.image_url ?? null,
              updatedAt: new Date(),
            },
          });
        break;
      }
      case 'organization.created':
      case 'organization.updated': {
        const data = (event as ClerkOrgEvent).data;
        await db
          .insert(organizations)
          .values({ clerkOrgId: data.id, slug: data.slug, name: data.name })
          .onConflictDoUpdate({
            target: organizations.clerkOrgId,
            set: { slug: data.slug, name: data.name, updatedAt: new Date() },
          });
        break;
      }
      case 'organizationMembership.created':
      case 'organizationMembership.updated': {
        const data = (event as ClerkMembershipEvent).data;
        const [org] = await db.select().from(organizations).where(eq(organizations.clerkOrgId, data.organization.id));
        const [user] = await db.select().from(users).where(eq(users.clerkUserId, data.public_user_data.user_id));
        if (org && user) {
          await db
            .insert(memberships)
            .values({
              clerkMembershipId: data.id,
              organizationId: org.id,
              userId: user.id,
              role: normalizeRole(data.role),
            })
            .onConflictDoUpdate({
              target: memberships.clerkMembershipId,
              set: { role: normalizeRole(data.role), updatedAt: new Date() },
            });
        }
        break;
      }
      case 'organizationMembership.deleted': {
        const data = (event as ClerkMembershipEvent).data;
        await db.delete(memberships).where(eq(memberships.clerkMembershipId, data.id));
        break;
      }
      default:
        break;
    }
  } catch (error) {
    console.error('Clerk webhook sync failed:', error);
    return Response.json({ error: 'Sync failed.' }, { status: 500 });
  }

  return Response.json({ received: true });
}
