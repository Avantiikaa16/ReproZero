'use client';

import { OrganizationSwitcher, UserButton } from '@clerk/nextjs';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { navItems } from './nav-items';

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="appShell">
      <aside className="appSidebar">
        <Link className="brand appBrand" href="/" title="Back to the public homepage">
          <span className="brandMark">R0</span>
          <span>ReproZero</span>
        </Link>

        <div className="orgSwitcher">
          <OrganizationSwitcher
            hidePersonal={false}
            afterSelectOrganizationUrl="/overview"
            afterSelectPersonalUrl="/overview"
            appearance={{ elements: { rootBox: { width: '100%' }, organizationSwitcherTrigger: { width: '100%', justifyContent: 'space-between' } } }}
          />
        </div>

        <nav className="appNav" aria-label="Workspace navigation">
          {navItems.map((item) => {
            const active = pathname === item.href || pathname?.startsWith(`${item.href}/`);
            return (
              <Link key={item.href} href={item.href} className={`appNavItem ${active ? 'active' : ''}`}>
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="profileMenu">
          <UserButton showName />
        </div>
      </aside>

      <div className="appMain">
        <header className="appTopbar">
          <span className="appTopbarWorkspace">Workspace</span>
          <div className="appTopbarStatus">
            <span className="appStatusPill demo">Demo simulation</span>
          </div>
        </header>
        <main className="appContent">{children}</main>
      </div>
    </div>
  );
}
