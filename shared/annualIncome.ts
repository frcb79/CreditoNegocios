/** Rangos anuales en MXN: nunca tratar una banda como una cifra exacta. */
export type AnnualIncomeInterval = {value: string;label:string;min:number;max:number};
export const ANNUAL_INCOME_OPTIONS: Record<"persona_moral"|"fisica_empresarial"|"fisica"|"sin_sat",AnnualIncomeInterval[]> = {
  "persona_moral": [
    {
      "value": "hasta-1000000",
      "label": "Hasta $1,000,000",
      "min": 0,
      "max": 1000000
    },
    {
      "value": "1000000-2000000",
      "label": "$1,000,000 a $2,000,000",
      "min": 1000000,
      "max": 2000000
    },
    {
      "value": "2000000-5000000",
      "label": "$2,000,000 a $5,000,000",
      "min": 2000000,
      "max": 5000000
    },
    {
      "value": "5000000-15000000",
      "label": "$5,000,000 a $15,000,000",
      "min": 5000000,
      "max": 15000000
    },
    {
      "value": "15000000-30000000",
      "label": "$15,000,000 a $30,000,000",
      "min": 15000000,
      "max": 30000000
    },
    {
      "value": "30000000-50000000",
      "label": "$30,000,000 a $50,000,000",
      "min": 30000000,
      "max": 50000000
    },
    {
      "value": "50000000-75000000",
      "label": "$50,000,000 a $75,000,000",
      "min": 50000000,
      "max": 75000000
    },
    {
      "value": "75000000-100000000",
      "label": "$75,000,000 a $100,000,000",
      "min": 75000000,
      "max": 100000000
    },
    {
      "value": "arriba-100000000",
      "label": "Más de $100,000,000",
      "min": 100000000,
      "max": 9007199254740991
    },
    {
      "value": "no-disponible",
      "label": "No disponible / Por confirmar",
      "min": 0,
      "max": 0
    }
  ],
  "fisica_empresarial": [
    {
      "value": "hasta-500000",
      "label": "Hasta $500,000",
      "min": 0,
      "max": 500000
    },
    {
      "value": "500000-1000000",
      "label": "$500,000 a $1,000,000",
      "min": 500000,
      "max": 1000000
    },
    {
      "value": "1000000-2000000",
      "label": "$1,000,000 a $2,000,000",
      "min": 1000000,
      "max": 2000000
    },
    {
      "value": "2000000-3000000",
      "label": "$2,000,000 a $3,000,000",
      "min": 2000000,
      "max": 3000000
    },
    {
      "value": "3000000-5000000",
      "label": "$3,000,000 a $5,000,000",
      "min": 3000000,
      "max": 5000000
    },
    {
      "value": "5000000-10000000",
      "label": "$5,000,000 a $10,000,000",
      "min": 5000000,
      "max": 10000000
    },
    {
      "value": "10000000-15000000",
      "label": "$10,000,000 a $15,000,000",
      "min": 10000000,
      "max": 15000000
    },
    {
      "value": "15000000-30000000",
      "label": "$15,000,000 a $30,000,000",
      "min": 15000000,
      "max": 30000000
    },
    {
      "value": "arriba-30000000",
      "label": "Más de $30,000,000",
      "min": 30000000,
      "max": 9007199254740991
    },
    {
      "value": "no-disponible",
      "label": "No disponible / Por confirmar",
      "min": 0,
      "max": 0
    }
  ],
  "fisica": [
    {
      "value": "hasta-250000",
      "label": "Hasta $250,000",
      "min": 0,
      "max": 250000
    },
    {
      "value": "250000-500000",
      "label": "$250,000 a $500,000",
      "min": 250000,
      "max": 500000
    },
    {
      "value": "500000-1000000",
      "label": "$500,000 a $1,000,000",
      "min": 500000,
      "max": 1000000
    },
    {
      "value": "1000000-2000000",
      "label": "$1,000,000 a $2,000,000",
      "min": 1000000,
      "max": 2000000
    },
    {
      "value": "2000000-3000000",
      "label": "$2,000,000 a $3,000,000",
      "min": 2000000,
      "max": 3000000
    },
    {
      "value": "3000000-5000000",
      "label": "$3,000,000 a $5,000,000",
      "min": 3000000,
      "max": 5000000
    },
    {
      "value": "5000000-10000000",
      "label": "$5,000,000 a $10,000,000",
      "min": 5000000,
      "max": 10000000
    },
    {
      "value": "arriba-10000000",
      "label": "Más de $10,000,000",
      "min": 10000000,
      "max": 9007199254740991
    },
    {
      "value": "no-disponible",
      "label": "No disponible / Por confirmar",
      "min": 0,
      "max": 0
    }
  ],
  "sin_sat": [
    {
      "value": "hasta-250000",
      "label": "Hasta $250,000",
      "min": 0,
      "max": 250000
    },
    {
      "value": "250000-500000",
      "label": "$250,000 a $500,000",
      "min": 250000,
      "max": 500000
    },
    {
      "value": "500000-1000000",
      "label": "$500,000 a $1,000,000",
      "min": 500000,
      "max": 1000000
    },
    {
      "value": "1000000-2000000",
      "label": "$1,000,000 a $2,000,000",
      "min": 1000000,
      "max": 2000000
    },
    {
      "value": "2000000-3000000",
      "label": "$2,000,000 a $3,000,000",
      "min": 2000000,
      "max": 3000000
    },
    {
      "value": "3000000-5000000",
      "label": "$3,000,000 a $5,000,000",
      "min": 3000000,
      "max": 5000000
    },
    {
      "value": "5000000-10000000",
      "label": "$5,000,000 a $10,000,000",
      "min": 5000000,
      "max": 10000000
    },
    {
      "value": "arriba-10000000",
      "label": "Más de $10,000,000",
      "min": 10000000,
      "max": 9007199254740991
    },
    {
      "value": "no-disponible",
      "label": "No disponible / Por confirmar",
      "min": 0,
      "max": 0
    }
  ]
};
export const LEGACY_ANNUAL_INCOME_OPTIONS: AnnualIncomeInterval[] = [
  {
    "value": "menor-100000",
    "label": "Menor a $100,000 (anterior)",
    "min": 0,
    "max": 100000
  },
  {
    "value": "100000-250000",
    "label": "$100,000 a $250,000 (anterior)",
    "min": 100000,
    "max": 250000
  },
  {
    "value": "250000-500000",
    "label": "$250,000 a $500,000 (anterior)",
    "min": 250000,
    "max": 500000
  },
  {
    "value": "500000-1000000",
    "label": "$500,000 a $1,000,000",
    "min": 500000,
    "max": 1000000
  },
  {
    "value": "1000000-2500000",
    "label": "$1,000,000 a $2,500,000 (anterior)",
    "min": 1000000,
    "max": 2500000
  },
  {
    "value": "2500000-5000000",
    "label": "$2,500,000 a $5,000,000 (anterior)",
    "min": 2500000,
    "max": 5000000
  },
  {
    "value": "arriba-5000000",
    "label": "Más de $5,000,000 (anterior)",
    "min": 5000000,
    "max": 9007199254740991
  }
];
export const ALL_ANNUAL_INCOME_RANGES: AnnualIncomeInterval[] = Object.values(ANNUAL_INCOME_OPTIONS).flat().concat(LEGACY_ANNUAL_INCOME_OPTIONS);
export function getAnnualIncomeRange(raw: unknown): AnnualIncomeInterval | null {
  if (typeof raw !== "string" && typeof raw !== "number") return null;
  const input = String(raw).trim().toLowerCase();
  if (!input || input === "n/a" || input === "no-disponible") return null;
  const found = ALL_ANNUAL_INCOME_RANGES.find(r => r.value === input);
  if (found) return found;
  // Solo montos numéricos explícitos. "1000000-2000000" jamás equivale a 1000000.
  const cleaned = input.replace(/\s*(mxn|pesos)\s*$/i,"").replace(/[\s,$]/g,"");
  if (!/^\d+(?:\.\d+)?$/.test(cleaned)) return null;
  const exact = Number(cleaned);
  if (!Number.isFinite(exact) || exact <= 0) return null;
  return {value: input, label: "$" + exact.toLocaleString("es-MX") + " anual", min:exact,max:exact};
}
export function getAnnualIncomeLabel(raw: unknown): string {
  const input = String(raw ?? "").toLowerCase().trim();
  return ALL_ANNUAL_INCOME_RANGES.find(r => r.value === input)?.label || getAnnualIncomeRange(raw)?.label || "No disponible / Por confirmar";
}
