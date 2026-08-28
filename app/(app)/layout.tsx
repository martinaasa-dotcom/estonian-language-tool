import { Sidebar } from "@/components/Sidebar";
import { Wash } from "@/components/ui";

/**
 * The signed-in shell: rail on the left, floating tab bar on mobile, pastel
 * wash behind everything. The marketing pages sit in their own route group and
 * deliberately get none of it.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <Wash />
      <Sidebar />
      <main className="flex-1 pb-28 md:pb-0">{children}</main>
    </div>
  );
}
