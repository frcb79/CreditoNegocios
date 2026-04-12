import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import ClientList from "@/components/Clients/ClientList";
import ClientForm from "@/components/Clients/ClientForm";
import { Client } from "@shared/schema";

type ViewMode = "list" | "form";

export default function Clients() {
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [editingClient, setEditingClient] = useState<Client | null>(null);
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
    setEditingClient(null);
    setViewMode("form");
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
    <div className="min-h-screen flex bg-gray-50">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <Header 
          title="Gestión de Clientes"
          subtitle="Administra tu cartera completa de clientes"
          action={{
            label: "Nuevo Cliente",
            onClick: handleNewClient
          }}
        />
        
        <main className="flex-1 p-4 sm:p-6 lg:p-4 sm:p-6 lg:p-8 overflow-y-auto">
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
      </div>
    </div>
  );
}
