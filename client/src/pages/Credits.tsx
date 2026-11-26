import { useState } from "react";
import MainLayout from "@/components/MainLayout";
import Header from "@/components/Header";
import { ContextualHelpLink } from "@/components/Help/ContextualHelpLink";
import CreditList from "@/components/Credits/CreditList";
import CreditRequestModal from "@/components/Modals/CreditRequestModal";
import HistoricalCreditIntakeModal from "@/components/Modals/HistoricalCreditIntakeModal";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { Plus } from "lucide-react";

export default function Credits() {
  const [showRequestModal, setShowRequestModal] = useState(false);
  const { user } = useAuth();
  const [showHistorical,setShowHistorical]=useState(false);
  const canRecordHistory=user?.role==='admin'||user?.role==='super_admin';
  
  const canRequestCredit = user?.role === 'broker' || user?.role === 'master_broker' || user?.role === 'admin' || user?.role === 'super_admin';

  return (
    <MainLayout>
      <Header 
        title="Gestión de Créditos"
        subtitle="Supervisión de operaciones, solicitudes y dispersiones activas"
      >
        <ContextualHelpLink slug="donde-reviso-mis-oportunidades" variant="quick" label="Ayuda rápida: Gestión de Créditos" />
        {/* Action button for brokers and admins */}
        {canRequestCredit && (
          <div className="flex flex-wrap gap-2 ml-3">
            {canRecordHistory&&<Button variant="outline" onClick={()=>setShowHistorical(true)} data-testid="button-historical-credit">Registrar operación histórica</Button>}
            <Button
              onClick={() => setShowRequestModal(true)}
              className="bg-primary hover:bg-primary-dark text-primary-foreground text-sm font-medium h-9 shadow-sm"
              data-testid="button-request-credit"
            >
              <Plus className="w-4 h-4 mr-1.5" />
              <span>Nueva Solicitud</span>
              <span className="sr-only">Solicitar Crédito</span>
            </Button>
          </div>
        )}
      </Header>
      
      <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto">
        <CreditList />
      </main>

      {canRecordHistory&&<HistoricalCreditIntakeModal isOpen={showHistorical} onClose={()=>setShowHistorical(false)}/>}
      {/* Credit Request Modal */}
      <CreditRequestModal
        isOpen={showRequestModal}
        onClose={() => setShowRequestModal(false)}
      />
    </MainLayout>
  );
}
