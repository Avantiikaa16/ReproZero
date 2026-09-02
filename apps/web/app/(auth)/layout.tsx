import { AppClerkProvider } from '../clerk-provider';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <AppClerkProvider>{children}</AppClerkProvider>;
}
