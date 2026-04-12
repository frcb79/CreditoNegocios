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
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
      {/* Basic Information */}
      <Card>
        <CardHeader>
          <CardTitle>Información Básica</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="name">Nombre interno *</Label>
              <Input
                id="name"
                {...form.register("name")}
                placeholder="ej: monto_credito"
                data-testid="input-name"
              />
              {form.formState.errors.name && (
                <p className="text-sm text-red-600 mt-1">{form.formState.errors.name.message}</p>
              )}
            </div>

            <div>
              <Label htmlFor="displayName">Nombre para mostrar *</Label>
              <Input
                id="displayName"
                {...form.register("displayName")}
                placeholder="ej: Monto del Crédito"
                data-testid="input-display-name"
              />
              {form.formState.errors.displayName && (
                <p className="text-sm text-red-600 mt-1">{form.formState.errors.displayName.message}</p>
              )}
            </div>
          </div>

          <div>
            <Label htmlFor="description">Descripción</Label>
            <Textarea
              id="description"
              {...form.register("description")}
              placeholder="Descripción de la variable"
              data-testid="textarea-description"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="variableType">Tipo de Variable *</Label>
              <Select
                value={form.watch("dataType")}
                onValueChange={(value) => form.setValue("dataType", value)}
              >
                <SelectTrigger data-testid="select-variable-type">
                  <SelectValue placeholder="Selecciona tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="text">Texto</SelectItem>
                  <SelectItem value="number">Número</SelectItem>
                  <SelectItem value="select">Selección</SelectItem>
                  <SelectItem value="multiple_select">Multi-selección</SelectItem>
                  <SelectItem value="range">Rango</SelectItem>
                  <SelectItem value="date">Fecha</SelectItem>
                  <SelectItem value="boolean">Sí/No</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="category">Categoría *</Label>
              <Select
                value={form.watch("category")}
                onValueChange={(value) => form.setValue("category", value)}
              >
                <SelectTrigger data-testid="select-category">
                  <SelectValue placeholder="Selecciona categoría" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="basic">Básico</SelectItem>
                  <SelectItem value="financial">Financiero</SelectItem>
                  <SelectItem value="requirements">Requisitos</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Type-specific Configuration */}
      {(variableType === "select" || variableType === "multiple_select") && (
        <Card>
          <CardHeader>
            <CardTitle>Opciones de Selección</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex space-x-2">
                <Input
                  value={newOption}
                  onChange={(e) => setNewOption(e.target.value)}
                  placeholder="Nueva opción"
                  data-testid="input-new-option"
                  onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddOption())}
                />
                <Button type="button" onClick={handleAddOption} data-testid="button-add-option">
                  Agregar
                </Button>
              </div>
              
              <div className="flex flex-wrap gap-2">
                {options.map((option, index) => (
                  <Badge key={index} variant="outline" className="flex items-center space-x-2">
                    <span>{typeof option === 'string' ? option : (option.label || option.value || 'N/A')}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveOption(index)}
                      className="text-red-500 hover:text-red-700"
                      data-testid={`button-remove-option-${index}`}
                    >
                      ×
                    </button>
                  </Badge>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {variableType === "range" && (
        <Card>
          <CardHeader>
            <CardTitle>Configuración de Rango</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label htmlFor="min">Valor Mínimo</Label>
                <Input
                  id="min"
                  type="number"
                  step="any"
                  {...form.register("min")}
                  placeholder="0"
                  data-testid="input-min"
                />
              </div>
              <div>
                <Label htmlFor="max">Valor Máximo</Label>
                <Input
                  id="max"
                  type="number"
                  step="any"
                  {...form.register("max")}
                  placeholder="100"
                  data-testid="input-max"
                />
              </div>
              <div>
                <Label htmlFor="unit">Unidad</Label>
                <Input
                  id="unit"
                  {...form.register("unit")}
                  placeholder="ej: MXN, %, meses"
                  data-testid="input-unit"
                />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {variableType === "number" && (
        <Card>
          <CardHeader>
            <CardTitle>Configuración de Número</CardTitle>
          </CardHeader>
          <CardContent>
            <div>
              <Label htmlFor="unit">Unidad</Label>
              <Input
                id="unit"
                {...form.register("unit")}
                placeholder="ej: MXN, %, días"
                data-testid="input-number-unit"
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Action Buttons */}
      <div className="flex justify-end space-x-4 pt-6 border-t">
        <Button type="button" variant="outline" onClick={onCancel} data-testid="button-cancel">
          Cancelar
        </Button>
        <Button
          type="submit"
          disabled={saveMutation.isPending}
          data-testid="button-save"
        >
          {saveMutation.isPending ? "Guardando..." : isEditing ? "Actualizar" : "Crear"}
        </Button>
      </div>
    </form>
  );
}