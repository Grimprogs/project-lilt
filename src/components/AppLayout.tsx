import { ReactNode, useState } from "react";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

export function AppLayout({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex min-h-screen w-full bg-gradient-soft overflow-hidden">
      <Sidebar open={open} onClose={() => setOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col h-screen overflow-hidden">
        <Topbar onMenu={() => setOpen(true)} />
        <main className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:px-8 animate-fade-in custom-scrollbar">
          <div className="mx-auto w-full max-w-7xl pb-20">{children}</div>
        </main>
      </div>
    </div>
  );
}
