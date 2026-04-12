import Sidebar from "@/components/Sidebar";

interface MainLayoutProps {
  children: React.ReactNode;
}

export default function MainLayout({ children }: MainLayoutProps) {
  return (
    <div className="min-h-screen flex bg-gray-50">
      <Sidebar />
      <div className="flex-1 flex flex-col pt-16 lg:pt-0">
        {children}
      </div>
    </div>
  );
}
