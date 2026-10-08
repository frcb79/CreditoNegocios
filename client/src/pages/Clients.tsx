import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import MainLayout from "@/components/MainLayout";
import Header from "@/components/Header";
import ClientList from "@/components/Clients/ClientList";
import ClientForm from "@/components/Clients/ClientForm";
import NewOpportunityTypeModal from "@/components/Modals/NewOpportunityTypeModal";
import MortgageLeadModal from "@/components/Modals/MortgageLeadModal";
import BrokerFormalizationDialog from "@/components/BrokerFormalizationDialog";
import { useAuth } from "@/hooks/useAuth";
import { buildApiUrl } from "@/lib/runtimeConfig";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AlertCircle, ShieldCheck } from "lucide-react";
import {
  isRoleSubjectToFormalization,
  FORMALIZATION_NOTICE_TEXT,
  type FormalizationStatusResult,
} from "@shared/legalDocuments";
import { Client } from "@shared/schema";

type ViewMode = "list" | "form";

export default function Clients() {
  const { user } = useAuth();
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [isTypeModalOpen, setIsTypeModalOpen] = useState(false);
  const [isMortgageModalOpen, setIsMortgageModalOpen] = useState(false);
  const [isFormalizationModalOpen, setIsFormalizationModalOpen] = useState(false);
  const [isBlockedModalOpen, setIsBlockedModalOpen] = useState(false);
  const [, setLocation] = useLocation();

  const isSubjectToFormalization = isRoleSubjectToFormalization(user?.role);

  const { data: formalizationStatus, refetch: refetchFormalization } = useQuery<FormalizationStatusResult>({
    queryKey: ["/api/legal/formalization/status", user?.id],
    enabled: Boolean(user?.id && isSubjectToFormalization),
    queryFn: async () => {
      const res = await fetch(buildApiUrl("/api/legal/formalization/status"), {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Error status");
      return res.json();
    },
    staleTime: 30000,
  });

  const isFormalized = !isSubjectToFormalization || formalizationStatus?.isFormalized === true;
  
  // Check URL for edit query param
  const params = new URLSearchParams(window.location.search);
  const editClientId = params.get('edit');

  const { data: allClients, refetch: refetchClients } = useQuery<Client[]>({
    queryKey: ["/api/clients"],
  });

  // Load client for editing from URL param
  useEffect(() => {
    if (editClientId && allClients) {
      const clientToEdit = allClients.find(c => c.id === editClientId);
      if (clientToEdit) {
        setEditingClient(clientToEdit);
        setViewMode("form");
        // Clear the URL param after loading
        window.history.replaceState({}, '', '/clientes');
      }
    }
  }, [editClientId, allClients]);

  const handleNewClient = () => {
    if (!isFormalized) {
      setIsBlockedModalOpen(true);
      return;
    }
    setIsTypeModalOpen(true);
  };

  const handleSelectClient = (client: Client) => {
    // Navigate to client detail page
    setLocation(`/clientes/${client.id}`);
  };

  const handleFormSuccess = () => {
    setViewMode("list");
    setEditingClient(null);
  };

  return (
    <MainLayout>
      <Header 
        title="Gestión de Clientes"
        subtitle="Administra tu cartera completa de clientes"
      />
      
      <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto">
        {!isFormalized && (
          <Alert
            className="mb-6 border-amber-300 bg-amber-50/90 text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200 shadow-2xs"
            data-testid="alert-clients-formalization-required"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 w-full">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                <div>
                  <AlertTitle className="font-semibold text-amber-900 dark:text-amber-100 text-sm">
                    Formalización de Convenio Requerida
                  </AlertTitle>
                  <AlertDescription className="text-xs sm:text-sm text-amber-800 dark:text-amber-300 mt-1 leading-relaxed">
                    {FORMALIZATION_NOTICE_TEXT}
                  </AlertDescription>
                </div>
              </div>
              <Button
                onClick={() => setIsFormalizationModalOpen(true)}
                className="bg-amber-600 hover:bg-amber-700 text-white shrink-0 self-start sm:self-center text-xs h-8"
                data-testid="button-formalize-from-clients"
              >
                Formalizar Convenio
              </Button>
            </div>
          </Alert>
        )}

        {viewMode === "list" && (
          <ClientList 
            onSelectClient={handleSelectClient}
            onNewClient={handleNewClient}
          />
        )}

        {viewMode === "form" && (
          <ClientForm 
            client={editingClient}
            onSuccess={handleFormSuccess}
          />
        )}
      </main>

      {/* Modal para bifurcación: Crédito Empresarial vs Hipotecario Vivienda */}
      <NewOpportunityTypeModal
        isOpen={isTypeModalOpen}
        onClose={() => setIsTypeModalOpen(false)}
        onSelectEmpresarial={() => {
          setEditingClient(null);
          setViewMode("form");
        }}
        onSelectHipotecario={() => {
          setIsMortgageModalOpen(true);
        }}
      />

      {/* Modal unificado para Alta Ágil de Hipotecario Vivienda (Camino A) */}
      <MortgageLeadModal
        isOpen={isMortgageModalOpen}
        onClose={() => setIsMortgageModalOpen(false)}
        onSuccess={() => {
          setViewMode("list");
        }}
      />

      {/* Modal de aviso para formalización obligatoria antes de crear clientes */}
      <Dialog open={isBlockedModalOpen} onOpenChange={setIsBlockedModalOpen}>
        <DialogContent className="sm:max-w-md" data-testid="dialog-formalization-blocked">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <div className="p-2 bg-amber-100 dark:bg-amber-900/40 rounded-lg text-amber-700 dark:text-amber-300">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="text-base font-semibold">
                  Formalización Requerida
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                  Requisito previo para el registro de clientes
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="py-2 text-xs sm:text-sm text-foreground/90 leading-relaxed">
            {FORMALIZATION_NOTICE_TEXT}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsBlockedModalOpen(false)}
              className="text-xs"
            >
              Entendido
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setIsBlockedModalOpen(false);
                setIsFormalizationModalOpen(true);
              }}
              className="bg-amber-600 hover:bg-amber-700 text-white text-xs gap-1.5"
              data-testid="button-start-formalization-from-dialog"
            >
              Comenzar Formalización
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal interactivo de formalización con OTP */}
      <BrokerFormalizationDialog
        open={isFormalizationModalOpen}
        onOpenChange={setIsFormalizationModalOpen}
        user={user}
        onCompleted={() => {
          refetchFormalization();
          refetchClients();
        }}
      />
    </MainLayout>
  );
}

