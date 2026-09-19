import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Building2, Home, ArrowRight, ShieldCheck } from "lucide-react";

interface NewOpportunityTypeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectEmpresarial: () => void;
  onSelectHipotecario: () => void;
}

export default function NewOpportunityTypeModal({
  isOpen,
  onClose,
  onSelectEmpresarial,
  onSelectHipotecario,
}: NewOpportunityTypeModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-xl p-6">
        <DialogHeader className="text-center sm:text-left">
          <div className="flex items-center space-x-2">
            <div className="p-2 bg-blue-100 rounded-lg text-primary">
              <ShieldCheck className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <DialogTitle className="text-xl font-bold text-gray-900">
                Nuevo Cliente / Prospecto
              </DialogTitle>
              <DialogDescription className="text-sm text-gray-500 mt-0.5">
                Selecciona el tipo de operación que deseas registrar
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
          {/* Opción A: Crédito Empresarial */}
          <Card
            onClick={() => {
              onClose();
              onSelectEmpresarial();
            }}
            data-testid="option-select-empresarial"
            className="group cursor-pointer border-2 border-gray-200 hover:border-blue-500 hover:shadow-md transition-all duration-200 bg-white hover:bg-blue-50/20"
          >
            <CardContent className="p-5 flex flex-col justify-between h-full">
              <div className="space-y-3">
                <div className="w-12 h-12 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center group-hover:scale-105 transition-transform">
                  <Building2 className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 group-hover:text-blue-700 text-base flex items-center justify-between">
                    Crédito Empresarial
                  </h3>
                  <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">
                    Personas Morales, PFAE y negocios. Capital de trabajo, liquidez comercial, maquinaria o arrendamiento.
                  </p>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between text-xs font-medium text-blue-600">
                <span>Alta empresarial</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </div>
            </CardContent>
          </Card>

          {/* Opción B: Hipotecario Vivienda */}
          <Card
            onClick={() => {
              onClose();
              onSelectHipotecario();
            }}
            data-testid="option-select-hipotecario"
            className="group cursor-pointer border-2 border-amber-200 hover:border-amber-500 hover:shadow-md transition-all duration-200 bg-gradient-to-b from-amber-50/30 to-white"
          >
            <CardContent className="p-5 flex flex-col justify-between h-full">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="w-12 h-12 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center group-hover:scale-105 transition-transform">
                    <Home className="w-6 h-6" />
                  </div>
                  <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-300 text-xs font-semibold">
                    Ágil
                  </Badge>
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 group-hover:text-amber-800 text-base flex items-center justify-between">
                    Hipotecario Vivienda
                  </h3>
                  <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">
                    Para personas físicas que buscan adquirir casa o departamento. Registro simplificado de contacto y operación.
                  </p>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-amber-100 flex items-center justify-between text-xs font-medium text-amber-700">
                <span>Alta hipotecaria</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </div>
            </CardContent>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
}
