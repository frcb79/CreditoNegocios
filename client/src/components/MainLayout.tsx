import Sidebar from "@/components/Sidebar";
import { useActivityHeartbeat } from "@/hooks/useActivityHeartbeat";

interface MainLayoutProps {
  children: React.ReactNode;
}

export default function MainLayout({ children }: MainLayoutProps) {
  useActivityHeartbeat();

  return (
    <div className="min-h-screen flex bg-background">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 overflow-x-hidden">
        {children}
      </div>
    </div>
  );
}
