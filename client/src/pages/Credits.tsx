import { useState } from "react";
import MainLayout from "@/components/MainLayout";
import Header from "@/components/Header";
import CreditList from "@/components/Credits/CreditList";
import CreditRequestModal from "@/components/Modals/CreditRequestModal";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { Send } from "lucide-react";

export default function Credits() {
  const [showRequestModal, setShowRequestModal] = useState(false);
  const { user } = useAuth();
  
  const canRequestCredit = user?.role === 'broker' || user?.role === 'master_broker' || user?.role === 'admin' || user?.role === 'super_admin';

  return (
    <MainLayout>
      <Header 
        title="Gestión de Créditos"
        subtitle="Administra el pipeline completo de créditos"
      >
        {/* Action button for brokers and admins */}
        {canRequestCredit && (
          <div className="flex space-x-2 ml-3">
            <Button
              onClick={() => setShowRequestModal(true)}
              className="bg-primary hover:bg-primary-dark text-primary-foreground"
              data-testid="button-request-credit"
            >
              <Send className="w-4 h-4 mr-2" />
              Solicitar Crédito
            </Button>
          </div>
        )}
      </Header>
      
      <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto">
        <CreditList />
      </main>

      {/* Credit Request Modal */}
      <CreditRequestModal
        isOpen={showRequestModal}
        onClose={() => setShowRequestModal(false)}
      />
    </MainLayout>
  );
}
