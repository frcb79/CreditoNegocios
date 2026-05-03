import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import { Card, CardContent } from "@/components/ui/card";
import { Bell } from "lucide-react";

export default function Notifications() {
  return (
    <div className="min-h-screen flex bg-gray-50">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <Header 
          title="Notificaciones"
          subtitle="Mantente al día con las actualizaciones de tus créditos"
        />
        
        <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto">
          <Card className="max-w-4xl mx-auto">
            <CardContent className="p-12 text-center">
              <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
                <Bell className="w-10 h-10 text-primary" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">
                No tienes notificaciones nuevas
              </h3>
              <p className="text-neutral">
                Te avisaremos cuando haya actualizaciones importantes en tus solicitudes de crédito.
              </p>
            </CardContent>
          </Card>
        </main>
      </div>
    </div>
  );
}
