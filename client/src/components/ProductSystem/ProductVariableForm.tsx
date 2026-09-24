import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ProductVariable, insertProductVariableSchema } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { z } from "zod";

const formSchema = insertProductVariableSchema
  .omit({
    createdBy: true, // Will be set by backend from authenticated user
    options: true, // Will be transformed from state
    minValue: true, // Will be transformed from 'min' field
    maxValue: true, // Will be transformed from 'max' field
  })
  .extend({
    // Add helper fields for form handling (will be transformed before API call)
    min: z.string().optional(),
    max: z.string().optional(),
  });

type FormData = z.infer<typeof formSchema>;

interface ProductVariableFormProps {
  variable?: ProductVariable | null;
  onSuccess: () => void;
  onCancel: () => void;
}

export default function ProductVariableForm({ variable, onSuccess, onCancel }: ProductVariableFormProps) {
  const [options, setOptions] = useState<string[]>(() => {
    if (!variable?.options) return [];
    const variableOptions = variable.options as any;
    // Handle both string and object formats
    if (Array.isArray(variableOptions)) {
      return variableOptions.map((opt: any) => 
        typeof opt === 'string' ? opt : opt.label || opt.value || ''
      );
    }
    return [];
  });
  const [newOption, setNewOption] = useState("");

  const { toast } = useToast();
  const isEditing = !!variable;

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: variable?.name || "",
      displayName: variable?.displayName || "",
      description: variable?.description || "",
      category: variable?.category || "basic",
      dataType: variable?.dataType || "text",
      min: variable?.minValue?.toString() || "",
      max: variable?.maxValue?.toString() || "",
      unit: variable?.unit || "",
    },
  });

  const variableType = form.watch("dataType");

  const saveMutation = useMutation({
    mutationFn: async (data: FormData) => {
      const payload = {
        name: data.name,
        displayName: data.displayName,
        description: data.description,
        category: data.category,
        dataType: data.dataType,
        options: (data.dataType === 'select' || data.dataType === 'multiple_select') ? options : null,
        minValue: data.min ? parseFloat(data.min) : null,
        maxValue: data.max ? parseFloat(data.max) : null,
        unit: data.unit || null,
        // createdBy will be set by the backend from the authenticated user
      };

      if (isEditing) {
        const response = await apiRequest("PUT", `/api/product-variables/${variable.id}`, payload);
        return response.json();
      } else {
        const response = await apiRequest("POST", "/api/product-variables", payload);
        return response.json();
      }
    },
    onSuccess: () => {
      toast({
        title: isEditing ? "Variable actualizada" : "Variable creada",
        description: "La variable del producto se guardó correctamente",
      });
      onSuccess();
    },
    onError: (error: Error) => {
      toast({
        title: "Error al guardar",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleAddOption = () => {
    if (newOption.trim() && !options.includes(newOption.trim())) {
      setOptions([...options, newOption.trim()]);
      setNewOption("");
    }
  };

  const handleRemoveOption = (index: number) => {
    setOptions(options.filter((_, i) => i !== index));
  };

  const onSubmit = (data: FormData) => {
    saveMutation.mutate(data);
  };

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
      {/* Basic Information */}
      <div className="space-y-3.5 bg-muted/30 p-4 rounded-xl border border-border">
        <h4 className="text-xs font-bold text-foreground uppercase tracking-wider">Información Básica</h4>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          <div>
            <Label htmlFor="name" className="text-xs font-semibold text-foreground">Nombre interno *</Label>
            <Input
              id="name"
              {...form.register("name")}
              placeholder="ej: monto_credito"
              className="h-9 text-xs border-border rounded-lg bg-background mt-1"
              data-testid="input-name"
            />
            {form.formState.errors.name && (
              <p className="text-[11px] text-destructive mt-1">{form.formState.errors.name.message}</p>
            )}
          </div>

          <div>
            <Label htmlFor="displayName" className="text-xs font-semibold text-foreground">Nombre para mostrar *</Label>
            <Input
              id="displayName"
              {...form.register("displayName")}
              placeholder="ej: Monto del Crédito"
              className="h-9 text-xs border-border rounded-lg bg-background mt-1"
              data-testid="input-display-name"
            />
            {form.formState.errors.displayName && (
              <p className="text-[11px] text-destructive mt-1">{form.formState.errors.displayName.message}</p>
            )}
          </div>
        </div>

        <div>
          <Label htmlFor="description" className="text-xs font-semibold text-foreground">Descripción</Label>
          <Textarea
            id="description"
            {...form.register("description")}
            placeholder="Descripción del propósito de esta variable"
            className="text-xs border-border rounded-lg bg-background min-h-[64px] mt-1"
            data-testid="textarea-description"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          <div>
            <Label htmlFor="variableType" className="text-xs font-semibold text-foreground">Tipo de Variable *</Label>
            <Select
              value={form.watch("dataType")}
              onValueChange={(value) => form.setValue("dataType", value)}
            >
              <SelectTrigger data-testid="select-variable-type" className="h-9 text-xs border-border rounded-lg bg-background mt-1">
                <SelectValue placeholder="Selecciona tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="text" className="text-xs">Texto</SelectItem>
                <SelectItem value="number" className="text-xs">Número</SelectItem>
                <SelectItem value="select" className="text-xs">Selección</SelectItem>
                <SelectItem value="multiple_select" className="text-xs">Multi-selección</SelectItem>
                <SelectItem value="range" className="text-xs">Rango</SelectItem>
                <SelectItem value="date" className="text-xs">Fecha</SelectItem>
                <SelectItem value="boolean" className="text-xs">Sí/No</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="category" className="text-xs font-semibold text-foreground">Categoría *</Label>
            <Select
              value={form.watch("category")}
              onValueChange={(value) => form.setValue("category", value)}
            >
              <SelectTrigger data-testid="select-category" className="h-9 text-xs border-border rounded-lg bg-background mt-1">
                <SelectValue placeholder="Selecciona categoría" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="basic" className="text-xs">Básico</SelectItem>
                <SelectItem value="financial" className="text-xs">Financiero</SelectItem>
                <SelectItem value="requirements" className="text-xs">Requisitos</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Type-specific Configuration */}
      {(variableType === "select" || variableType === "multiple_select") && (
        <div className="space-y-3 bg-muted/30 p-4 rounded-xl border border-border">
          <h4 className="text-xs font-bold text-foreground uppercase tracking-wider">Opciones de Selección</h4>
          <div className="space-y-3">
            <div className="flex gap-2">
              <Input
                value={newOption}
                onChange={(e) => setNewOption(e.target.value)}
                placeholder="Nueva opción"
                data-testid="input-new-option"
                className="h-8 text-xs border-border rounded-lg bg-background flex-1"
                onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddOption())}
              />
              <Button 
                type="button" 
                onClick={handleAddOption} 
                data-testid="button-add-option"
                className="h-8 text-xs font-semibold bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg px-3"
              >
                Agregar
              </Button>
            </div>
            
            <div className="flex flex-wrap gap-1.5 min-h-[32px] p-2 bg-card rounded-lg border border-border">
              {options.length === 0 ? (
                <span className="text-[11px] text-muted-foreground italic">No hay opciones agregadas aún</span>
              ) : (
                options.map((option, index) => (
                  <Badge key={index} variant="outline" className="flex items-center gap-1.5 py-0.5 px-2 bg-muted text-foreground border-border text-xs">
                    <span>{option}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveOption(index)}
                      className="text-muted-foreground hover:text-destructive transition-colors"
                      data-testid={`button-remove-option-${index}`}
                    >
                      ×
                    </button>
                  </Badge>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {variableType === "range" && (
        <div className="space-y-3 bg-muted/30 p-4 rounded-xl border border-border">
          <h4 className="text-xs font-bold text-foreground uppercase tracking-wider">Configuración de Rango</h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <Label htmlFor="min" className="text-xs font-semibold text-foreground">Valor Mínimo</Label>
              <Input
                id="min"
                type="number"
                step="any"
                {...form.register("min")}
                placeholder="0"
                className="h-8 text-xs border-border rounded-lg bg-background mt-1"
                data-testid="input-min"
              />
            </div>
            <div>
              <Label htmlFor="max" className="text-xs font-semibold text-foreground">Valor Máximo</Label>
              <Input
                id="max"
                type="number"
                step="any"
                {...form.register("max")}
                placeholder="100"
                className="h-8 text-xs border-border rounded-lg bg-background mt-1"
                data-testid="input-max"
              />
            </div>
            <div>
              <Label htmlFor="unit" className="text-xs font-semibold text-foreground">Unidad</Label>
              <Input
                id="unit"
                {...form.register("unit")}
                placeholder="ej: MXN, %, meses"
                className="h-8 text-xs border-border rounded-lg bg-background mt-1"
                data-testid="input-unit"
              />
            </div>
          </div>
        </div>
      )}

      {variableType === "number" && (
        <div className="space-y-3 bg-muted/30 p-4 rounded-xl border border-border">
          <h4 className="text-xs font-bold text-foreground uppercase tracking-wider">Configuración de Número</h4>
          <div>
            <Label htmlFor="unit" className="text-xs font-semibold text-foreground">Unidad</Label>
            <Input
              id="unit"
              {...form.register("unit")}
              placeholder="ej: MXN, %, días"
              className="h-8 text-xs border-border rounded-lg bg-background mt-1"
              data-testid="input-number-unit"
            />
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex justify-end gap-2 pt-3 border-t border-border">
        <Button 
          type="button" 
          variant="outline" 
          onClick={onCancel} 
          data-testid="button-cancel"
          className="h-8 text-xs font-semibold rounded-lg border-border text-foreground hover:bg-muted"
        >
          Cancelar
        </Button>
        <Button
          type="submit"
          disabled={saveMutation.isPending}
          data-testid="button-save"
          className="h-8 text-xs font-semibold rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground"
        >
          {saveMutation.isPending ? "Guardando..." : isEditing ? "Actualizar" : "Crear"}
        </Button>
      </div>
    </form>
  );
}