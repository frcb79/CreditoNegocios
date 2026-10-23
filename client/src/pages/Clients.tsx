import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import MainLayout from "@/components/MainLayout";
import Header from "@/components/Header";
import { ContextualHelpLink } from "@/components/Help/ContextualHelpLink";
import ClientList from "@/components/Clients/ClientList";
import ClientForm from "@/components/Clients/ClientForm";
import QuickClientForm from "@/components/Clients/QuickClientForm";
import ReceivedProspects, { type ReceivedMarketingLead } from "@/components/Clients/ReceivedProspects";
import NewOpportunityTypeModal from "@/components/Modals/NewOpportunityTypeModal";
import MortgageLeadModal from "@/components/Modals/MortgageLeadModal";
import LeasingLeadModal from "@/components/Modals/LeasingLeadModal";
import { Client } from "@shared/schema";

type ViewMode = "list" | "form";

export default function Clients() {
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [activeTab, setActiveTab] = useState(() => new URLSearchParams(window.location.search).get("tab") === "recibidos" ? "recibidos" : "cartera");
  const [incomingLead, setIncomingLead] = useState<ReceivedMarketingLead | null>(null);
  const { toast } = useToast();
  const { user } = useAuth();
  const canReceive = user?.role === "broker" || user?.role === "master_broker";
  const cache = useQueryClient();
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [isTypeModalOpen, setIsTypeModalOpen] = useState(false);
  const [isMortgageModalOpen, setIsMortgageModalOpen] = useState(false);
  const [isLeasingModalOpen, setIsLeasingModalOpen] = useState(false);
  const [, setLocation] = useLocation();
  
  // Check URL for edit query param
  const params = new URLSearchParams(window.location.search);
  const editClientId = params.get('edit');

  const { data: allClients } = useQuery<Client[]>({
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
    setIncomingLead(null);
    setIsTypeModalOpen(true);
  };

  const reviewIncoming = (lead: ReceivedMarketingLead) => {
    setIncomingLead(lead);
    setEditingClient(null);
    setViewMode("form");
  };

  const linkReviewedClient = async (clientId: string) => {
    if (!incomingLead) return;
    try {
      const res = await fetch("/api/commercial-resources/received/" + encodeURIComponent(incomingLead.id) + "/link-client", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId })
      });
      if (!res.ok) throw new Error("No se pudo vincular el registro recibido");
      await cache.invalidateQueries({ queryKey: ["/api/commercial-resources/received"] });
      await cache.invalidateQueries({ queryKey: ["/api/commercial-resources/overview"] });
    } catch {
      toast({
        title: "Cliente guardado, vinculación pendiente",
        description: "El registro de publicidad permanece en Prospectos recibidos.",
        variant: "destructive"
      });
    }
    setIncomingLead(null);
  };

  const handleSelectClient = (client: Client) => {
    // Navigate to client detail page
    setLocation(`/clientes/${client.id}`);
  };

  const handleFormSuccess = () => {
    setViewMode("list");
    setEditingClient(null);
    setIncomingLead(null);
  };

  return (
    <MainLayout>
      <Header 
        title="Gestión de Clientes"
        subtitle="Administra tu cartera completa de clientes"
      >
        <ContextualHelpLink slug="como-registro-un-cliente" variant="quick" label="Ayuda rápida: Clientes" />
      </Header>
      
      <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto">
        {viewMode === "list" && (
          <Tabs value={canReceive ? activeTab : "cartera"} onValueChange={setActiveTab} className="space-y-4">
            <TabsList className="flex flex-wrap w-fit">
              <TabsTrigger value="cartera" data-testid="tab-clients-list">Clientes</TabsTrigger>
              {canReceive && <TabsTrigger value="recibidos" data-testid="tab-received-prospects">Prospectos recibidos</TabsTrigger>}
            </TabsList>
            <TabsContent value="cartera">
              <ClientList onSelectClient={handleSelectClient} onNewClient={handleNewClient} />
            </TabsContent>
            {canReceive && <TabsContent value="recibidos">
              <ReceivedProspects onReview={reviewIncoming} onOpenClient={id => setLocation("/clientes/" + id)} />
            </TabsContent>}
          </Tabs>
        )}

        {viewMode === "form" && (
          editingClient ? (
            <ClientForm
              client={editingClient}
              onSuccess={handleFormSuccess}
            />
          ) : (
            <QuickClientForm
              key={incomingLead?.id || "new-client"}
              initialValues={incomingLead ? {
                type: "sin_sat",
                firstName: incomingLead.full_name,
                phone: incomingLead.phone,
                email: incomingLead.email || "",
                notes: [
                  "Captado desde Recursos Comerciales.",
                  incomingLead.product ? "Producto: " + incomingLead.product : "",
                  incomingLead.amount_range ? "Monto: " + incomingLead.amount_range : "",
                  incomingLead.message || ""
                ].filter(Boolean).join("\n")
              } : undefined}
              onSaved={async savedClient => {
                await linkReviewedClient(savedClient.id);
                setViewMode("list");
                setLocation(`/clientes/${savedClient.id}`);
              }}
              onExisting={async existingClientId => {
                await linkReviewedClient(existingClientId);
                setViewMode("list");
                setLocation(`/clientes/${existingClientId}`);
              }}
              onCancel={() => { setViewMode("list"); setIncomingLead(null); }}
            />
          )
        )}
      </main>

      {/* Opciones de alta: Crédito Empresarial / Hipotecario Vivienda / Arrendamiento */}
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
        onSelectArrendamiento={() => {
          setIsLeasingModalOpen(true);
        }}
      />

      <LeasingLeadModal
        isOpen={isLeasingModalOpen}
        onClose={() => setIsLeasingModalOpen(false)}
        onSuccess={() => setViewMode("list")}
      />

      {/* Modal unificado para Alta Ágil de Hipotecario Vivienda (Camino A) */}
      <MortgageLeadModal
        isOpen={isMortgageModalOpen}
        onClose={() => setIsMortgageModalOpen(false)}
        onSuccess={() => {
          setViewMode("list");
        }}
      />
    </MainLayout>
  );
}

