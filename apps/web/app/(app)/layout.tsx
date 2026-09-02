import { AppClerkProvider } from '../clerk-provider';
import { AppShell } from './app-shell';

export default function AppShellLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppClerkProvider>
      <AppShell>{children}</AppShell>
    </AppClerkProvider>
  );
}
