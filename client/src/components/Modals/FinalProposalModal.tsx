import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle 
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Credit } from "@shared/schema";
import { FileCheck, DollarSign, Percent } from "lucide-react";

interface FinalProposalModalProps {
  credit: Credit | null;
  isOpen: boolean;
  onClose: () => void;
}

interface FinancialInstitution {
  id: string;
  name: string;
  commissionRates?: {
    masterBroker?: {
      total?: string;
      apertura?: string;
      sobretasa?: string;
      renovacion?: string;
    };
    broker?: {
      total?: string;
      apertura?: string;
      sobretasa?: string;
      renovacion?: string;
    };
  };
}

const finalProposalSchema = z.object({
  approvedAmount: z.string().min(1, "El monto es requerido"),
  term: z.string().min(1, "El plazo es requerido"),
  interestRate: z.coerce.number().min(0, "Debe ser mayor o igual a 0").max(100, "Debe ser menor o igual a 100"),
  openingCommissionRate: z.coerce.number().min(0, "Debe ser mayor o igual a 0").max(100, "Debe ser menor o igual a 100"),
  description: z.string().optional(),
  masterBroker_apertura: z.string().min(1, "Campo requerido"),
  masterBroker_sobretasa: z.string().min(1, "Campo requerido"),
  masterBroker_renovacion: z.string().min(1, "Campo requerido"),
  broker_apertura: z.string().min(1, "Campo requerido"),
  broker_sobretasa: z.string().min(1, "Campo requerido"),
  broker_renovacion: z.string().min(1, "Campo requerido"),
  apply_masterBroker_apertura: z.boolean(),
  apply_masterBroker_sobretasa: z.boolean(),
  apply_masterBroker_renovacion: z.boolean(),
  apply_broker_apertura: z.boolean(),
  apply_broker_sobretasa: z.boolean(),
  apply_broker_renovacion: z.boolean(),
});

type FinalProposalForm = z.infer<typeof finalProposalSchema>;

export default function FinalProposalModal({ credit, isOpen, onClose }: FinalProposalModalProps) {
  const { toast } = useToast();
  const [masterBrokerTotal, setMasterBrokerTotal] = useState<string>("0");
  const [brokerTotal, setBrokerTotal] = useState<string>("0");
  const [openingCommissionAmount, setOpeningCommissionAmount] = useState<string>("0");

  // Fetch financiera data
  const { data: financierasData, isLoading: financieraLoading } = useQuery<FinancialInstitution[]>({
    queryKey: ['/api/financial-institutions'],
    enabled: !!credit?.financialInstitutionId,
  });

  // Find the specific financiera from the list
  const financiera = financierasData?.find(f => f.id === credit?.financialInstitutionId);

  const form = useForm<FinalProposalForm>({
    resolver: zodResolver(finalProposalSchema),
    defaultValues: {
      approvedAmount: "",
      term: "",
      interestRate: 0,
      openingCommissionRate: 0,
      description: "",
      masterBroker_apertura: "0",
      masterBroker_sobretasa: "0",
      masterBroker_renovacion: "0",
      broker_apertura: "0",
      broker_sobretasa: "0",
      broker_renovacion: "0",
      apply_masterBroker_apertura: false,
      apply_masterBroker_sobretasa: false,
      apply_masterBroker_renovacion: false,
      apply_broker_apertura: false,
      apply_broker_sobretasa: false,
      apply_broker_renovacion: false,
    },
  });

  // Update form when credit or financiera changes
  useEffect(() => {
    if (credit) {
      const finalProposal = credit.finalProposal as any;
      
      // Pre-fill from finalProposal if exists, then from financiera, then defaults
      const approvedAmount = finalProposal?.approvedAmount || credit.amount || 0;
      const openingRate = finalProposal?.openingCommissionRate || 0;
      
      form.reset({
        approvedAmount: approvedAmount.toString(),
        term: finalProposal?.term?.toString() || credit.term?.toString() || "",
        interestRate: finalProposal?.interestRate || 0,
        openingCommissionRate: openingRate,
        description: finalProposal?.description || "",
        masterBroker_apertura: finalProposal?.commissionRates?.masterBroker?.apertura || financiera?.commissionRates?.masterBroker?.apertura || "0",
        masterBroker_sobretasa: finalProposal?.commissionRates?.masterBroker?.sobretasa || financiera?.commissionRates?.masterBroker?.sobretasa || "0",
        masterBroker_renovacion: finalProposal?.commissionRates?.masterBroker?.renovacion || financiera?.commissionRates?.masterBroker?.renovacion || "0",
        broker_apertura: finalProposal?.commissionRates?.broker?.apertura || financiera?.commissionRates?.broker?.apertura || "0",
        broker_sobretasa: finalProposal?.commissionRates?.broker?.sobretasa || financiera?.commissionRates?.broker?.sobretasa || "0",
        broker_renovacion: finalProposal?.commissionRates?.broker?.renovacion || financiera?.commissionRates?.broker?.renovacion || "0",
        apply_masterBroker_apertura: finalProposal?.commissionsToApply?.includes('masterBroker_apertura') || false,
        apply_masterBroker_sobretasa: finalProposal?.commissionsToApply?.includes('masterBroker_sobretasa') || false,
        apply_masterBroker_renovacion: finalProposal?.commissionsToApply?.includes('masterBroker_renovacion') || false,
        apply_broker_apertura: finalProposal?.commissionsToApply?.includes('broker_apertura') || false,
        apply_broker_sobretasa: finalProposal?.commissionsToApply?.includes('broker_sobretasa') || false,
        apply_broker_renovacion: finalProposal?.commissionsToApply?.includes('broker_renovacion') || false,
      });
      
      // Initialize opening commission amount from loaded data
      const initialCommissionAmount = (parseFloat(approvedAmount.toString()) * parseFloat(openingRate.toString())) / 100;
      setOpeningCommissionAmount(initialCommissionAmount.toFixed(2));
    }
  }, [credit, financiera, form]);

  // Calculate totals when commission rates change
  useEffect(() => {
    const subscription = form.watch((value) => {
      const mbApertura = parseFloat(value.masterBroker_apertura || "0");
      const mbSobretasa = parseFloat(value.masterBroker_sobretasa || "0");
      const mbTotal = mbApertura + mbSobretasa;
      setMasterBrokerTotal(mbTotal.toFixed(2));

      const bApertura = parseFloat(value.broker_apertura || "0");
      const bSobretasa = parseFloat(value.broker_sobretasa || "0");
      const bTotal = bApertura + bSobretasa;
      setBrokerTotal(bTotal.toFixed(2));

      // Calculate opening commission amount
      const approvedAmt = parseFloat(value.approvedAmount || "0");
      const openingRate = typeof value.openingCommissionRate === 'number' 
        ? value.openingCommissionRate 
        : parseFloat(value.openingCommissionRate || "0");
      const openingAmt = (approvedAmt * openingRate) / 100;
      setOpeningCommissionAmount(openingAmt.toFixed(2));
    });
    return () => subscription.unsubscribe();
  }, [form]);

  const saveMutation = useMutation({
    mutationFn: async (data: FinalProposalForm) => {
      if (!credit) throw new Error("No credit selected");

      const commissionsToApply: string[] = [];
      if (data.apply_masterBroker_apertura) commissionsToApply.push('masterBroker_apertura');
      if (data.apply_masterBroker_sobretasa) commissionsToApply.push('masterBroker_sobretasa');
      if (data.apply_masterBroker_renovacion) commissionsToApply.push('masterBroker_renovacion');
      if (data.apply_broker_apertura) commissionsToApply.push('broker_apertura');
      if (data.apply_broker_sobretasa) commissionsToApply.push('broker_sobretasa');
      if (data.apply_broker_renovacion) commissionsToApply.push('broker_renovacion');

      // Calculate opening commission amount from current form values
      const approvedAmount = parseFloat(data.approvedAmount);
      const openingRate = data.openingCommissionRate;
      const calculatedOpeningCommissionAmount = (approvedAmount * openingRate) / 100;

      const finalProposal = {
        approvedAmount,
        term: parseInt(data.term),
        interestRate: data.interestRate,
        openingCommissionRate: openingRate,
        openingCommissionAmount: parseFloat(calculatedOpeningCommissionAmount.toFixed(2)),
        description: data.description || "",
        commissionRates: {
          masterBroker: {
            apertura: data.masterBroker_apertura,
            sobretasa: data.masterBroker_sobretasa,
            renovacion: data.masterBroker_renovacion,
            total: masterBrokerTotal,
          },
          broker: {
            apertura: data.broker_apertura,
            sobretasa: data.broker_sobretasa,
            renovacion: data.broker_renovacion,
            total: brokerTotal,
          },
        },
        commissionsToApply,
      };

      return apiRequest("PUT", `/api/credits/${credit.id}`, { finalProposal });
    },
    onSuccess: () => {
      toast({
        title: "Propuesta guardada",
        description: "La propuesta final se ha guardado exitosamente",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/credits'] });
      onClose();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "No se pudo guardar la propuesta",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: FinalProposalForm) => {
    saveMutation.mutate(data);
  };

  if (!credit) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <FileCheck className="w-5 h-5 text-green-600" />
            <span>Propuesta Final de Crédito</span>
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Basic Info */}
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="approvedAmount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Monto Final *</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                        <Input
                          {...field}
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="0.00"
                          className="pl-10"
                          data-testid="input-approved-amount"
                        />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="term"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Plazo (meses) *</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="number"
                        min="1"
                        placeholder="12"
                        data-testid="input-term"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Credit Details */}
            <div className="border rounded-lg p-4 bg-gray-50">
              <h3 className="font-semibold text-lg mb-4">Detalles del Crédito</h3>
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="interestRate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tasa de Interés *</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Percent className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                          <Input
                            {...field}
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder="12.5"
                            className="pl-10"
                            data-testid="input-interest-rate"
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="openingCommissionRate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Comisión por Apertura *</FormLabel>
                      <FormControl>
                        <div className="space-y-2">
                          <div className="relative">
                            <Percent className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                            <Input
                              {...field}
                              type="number"
                              step="0.01"
                              min="0"
                              placeholder="3.0"
                              className="pl-10"
                              data-testid="input-opening-commission-rate"
                            />
                          </div>
                          <div className="text-sm text-gray-600">
                            Monto: <span className="font-semibold text-gray-800" data-testid="text-opening-commission-amount">${openingCommissionAmount}</span>
                          </div>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem className="mt-4">
                    <FormLabel>Descripción</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        placeholder="Notas o detalles adicionales sobre la propuesta..."
                        className="min-h-[80px] resize-none"
                        data-testid="input-description"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Master Broker Commission Rates */}
            <div className="border rounded-lg p-4 bg-blue-50">
              <h3 className="font-semibold text-lg mb-4">Comisiones Master Broker</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-4">
                  <FormField
                    control={form.control}
                    name="masterBroker_apertura"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Apertura %</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            type="number"
                            step="0.01"
                            min="0"
                            data-testid="input-mb-apertura"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="masterBroker_sobretasa"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Sobretasa %</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            type="number"
                            step="0.01"
                            min="0"
                            data-testid="input-mb-sobretasa"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="masterBroker_renovacion"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Renovación %</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            type="number"
                            step="0.01"
                            min="0"
                            data-testid="input-mb-renovacion"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="pt-2 border-t">
                    <FormLabel>Total %</FormLabel>
                    <div className="text-2xl font-bold text-blue-600" data-testid="text-mb-total">
                      {masterBrokerTotal}%
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <FormField
                    control={form.control}
                    name="apply_masterBroker_apertura"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center space-x-3 space-y-0">
                        <FormControl>
                          <Checkbox
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            data-testid="checkbox-apply-mb-apertura"
                          />
                        </FormControl>
                        <FormLabel className="font-normal">
                          Aplica Comisión Apertura
                        </FormLabel>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="apply_masterBroker_sobretasa"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center space-x-3 space-y-0">
                        <FormControl>
                          <Checkbox
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            data-testid="checkbox-apply-mb-sobretasa"
                          />
                        </FormControl>
                        <FormLabel className="font-normal">
                          Aplica Comisión Sobretasa
                        </FormLabel>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="apply_masterBroker_renovacion"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center space-x-3 space-y-0">
                        <FormControl>
                          <Checkbox
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            data-testid="checkbox-apply-mb-renovacion"
                          />
                        </FormControl>
                        <FormLabel className="font-normal">
                          Aplica Comisión Renovación
                        </FormLabel>
                      </FormItem>
                    )}
                  />
                </div>
              </div>
            </div>

            {/* Broker Commission Rates */}
            <div className="border rounded-lg p-4 bg-green-50">
              <h3 className="font-semibold text-lg mb-4">Comisiones Broker</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-4">
                  <FormField
                    control={form.control}
                    name="broker_apertura"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Apertura %</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            type="number"
                            step="0.01"
                            min="0"
                            data-testid="input-broker-apertura"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="broker_sobretasa"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Sobretasa %</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            type="number"
                            step="0.01"
                            min="0"
                            data-testid="input-broker-sobretasa"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="broker_renovacion"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Renovación %</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            type="number"
                            step="0.01"
                            min="0"
                            data-testid="input-broker-renovacion"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="pt-2 border-t">
                    <FormLabel>Total %</FormLabel>
                    <div className="text-2xl font-bold text-green-600" data-testid="text-broker-total">
                      {brokerTotal}%
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <FormField
                    control={form.control}
                    name="apply_broker_apertura"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center space-x-3 space-y-0">
                        <FormControl>
                          <Checkbox
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            data-testid="checkbox-apply-broker-apertura"
                          />
                        </FormControl>
                        <FormLabel className="font-normal">
                          Aplica Comisión Apertura
                        </FormLabel>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="apply_broker_sobretasa"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center space-x-3 space-y-0">
                        <FormControl>
                          <Checkbox
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            data-testid="checkbox-apply-broker-sobretasa"
                          />
                        </FormControl>
                        <FormLabel className="font-normal">
                          Aplica Comisión Sobretasa
                        </FormLabel>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="apply_broker_renovacion"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center space-x-3 space-y-0">
                        <FormControl>
                          <Checkbox
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            data-testid="checkbox-apply-broker-renovacion"
                          />
                        </FormControl>
                        <FormLabel className="font-normal">
                          Aplica Comisión Renovación
                        </FormLabel>
                      </FormItem>
                    )}
                  />
                </div>
              </div>
            </div>

            {/* Submit Buttons */}
            <div className="flex justify-end space-x-3 pt-4 border-t">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                data-testid="button-cancel-proposal"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={saveMutation.isPending || financieraLoading}
                data-testid="button-submit-proposal"
              >
                {saveMutation.isPending ? (
                  <>
                    <i className="fas fa-spinner fa-spin mr-2"></i>
                    Guardando...
                  </>
                ) : (
                  <>
                    <FileCheck className="w-4 h-4 mr-2" />
                    Guardar Propuesta
                  </>
                )}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
