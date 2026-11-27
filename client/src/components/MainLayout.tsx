import Sidebar from "@/components/Sidebar";

interface MainLayoutProps {
  children: React.ReactNode;
}

export default function MainLayout({ children }: MainLayoutProps) {
  return (
    <div className="cn-workspace min-h-screen flex bg-background">
      <Sidebar />
      <div className="cn-workspace-content flex-1 flex flex-col min-w-0">
        {children}
      </div>
    </div>
  );
}
