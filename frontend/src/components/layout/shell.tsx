import { Sidebar } from './sidebar';
import { Topbar } from './topbar';

export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <div className="lg:pl-60">
        <Topbar />
        <main className="mx-auto w-full max-w-[1400px] px-6 py-6">{children}</main>
      </div>
    </div>
  );
}
