import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AppShell as AppShellLayout } from '../app/(app)/app-shell';
import { navItems } from '../app/(app)/nav-items';

vi.mock('@clerk/nextjs', () => ({
  OrganizationSwitcher: () => <div data-testid="org-switcher" />,
  UserButton: () => <div data-testid="user-button" />,
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/overview',
}));

describe('AppShellLayout', () => {
  it('renders every workspace nav item', () => {
    render(
      <AppShellLayout>
        <div>content</div>
      </AppShellLayout>,
    );

    for (const item of navItems) {
      expect(screen.getByRole('link', { name: item.label })).toBeInTheDocument();
    }
  });

  it('marks the current route as active', () => {
    render(
      <AppShellLayout>
        <div>content</div>
      </AppShellLayout>,
    );

    expect(screen.getByRole('link', { name: 'Overview' })).toHaveClass('active');
    expect(screen.getByRole('link', { name: 'Incidents' })).not.toHaveClass('active');
  });
});
