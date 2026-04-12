import React, { useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface CurrencyInputProps {
  value?: string;
  onChange?: (value: string, rawValue: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  "data-testid"?: string;
  name?: string;
}

// Formatear número como moneda mexicana
const formatCurrency = (value: string): string => {
  // Remover todo excepto números
  const numericValue = value.replace(/[^\d]/g, "");
  
  if (!numericValue) return "";
  
  // Convertir a número y formatear con comas
  const number = parseInt(numericValue, 10);
  const formatted = number.toLocaleString("es-MX");
  
  return `$${formatted}`;
};

// Obtener solo el valor numérico sin formato
const getNumericValue = (value: string): string => {
  return value.replace(/[^\d]/g, "");
};

export default function CurrencyInput({
  value = "",
  onChange,
  placeholder = "Ingresa un monto",
  className,
  disabled,
  "data-testid": testId,
  name
}: CurrencyInputProps) {
  const [displayValue, setDisplayValue] = useState(() => {
    return value ? formatCurrency(value) : "";
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value;
    
    // Si está vacío, limpiar todo
    if (!inputValue) {
      setDisplayValue("");
      onChange?.("", "");
      return;
    }
    
    // Obtener solo números
    const numericValue = getNumericValue(inputValue);
    
    // Si no hay números, no hacer nada
    if (!numericValue) {
      return;
    }
    
    // Formatear para mostrar
    const formatted = formatCurrency(numericValue);
    setDisplayValue(formatted);
    
    // Llamar onChange con valor formateado y valor numérico puro
    onChange?.(formatted, numericValue);
  };

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    // Al hacer foco, seleccionar todo el texto para fácil edición
    e.target.select();
  };

  // Actualizar displayValue cuando cambie el prop value
  React.useEffect(() => {
    if (value !== undefined) {
      const formatted = value ? formatCurrency(value) : "";
      setDisplayValue(formatted);
    }
  }, [value]);

  return (
    <Input
      value={displayValue}
      onChange={handleChange}
      onFocus={handleFocus}
      placeholder={placeholder}
      className={cn("text-left", className)}
      disabled={disabled}
      data-testid={testId}
      name={name}
      inputMode="numeric"
    />
  );
}

// Hook personalizado para manejar valores de moneda en formularios
export const useCurrencyValue = (initialValue?: string) => {
  const [value, setValue] = useState(initialValue || "");
  const [rawValue, setRawValue] = useState(() => getNumericValue(initialValue || ""));

  const handleChange = (formattedValue: string, numericValue: string) => {
    setValue(formattedValue);
    setRawValue(numericValue);
  };

  return {
    value,
    rawValue,
    onChange: handleChange,
    setValue,
    setRawValue
  };
};