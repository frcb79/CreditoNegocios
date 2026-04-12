import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function maskCLABE(clabe: string | null | undefined): string {
  if (!clabe || clabe.length < 4) return "••••";
  return `••••••••••••••${clabe.slice(-4)}`;
}

export function maskRFC(rfc: string | null | undefined): string {
  if (!rfc || rfc.length < 4) return "••••";
  return `${rfc.slice(0, 4)}${"•".repeat(Math.max(0, rfc.length - 4))}`;
}

export function maskCURP(curp: string | null | undefined): string {
  if (!curp || curp.length < 4) return "••••";
  return `${curp.slice(0, 4)}${"•".repeat(Math.max(0, curp.length - 4))}`;
}

export function maskEmail(email: string | null | undefined): string {
  if (!email) return "••••@••••";
  const [localPart, domain] = email.split("@");
  if (!localPart || !domain) return "••••@••••";
  const maskedLocal = localPart.length > 2 
    ? `${localPart[0]}${"•".repeat(localPart.length - 2)}${localPart[localPart.length - 1]}`
    : localPart;
  return `${maskedLocal}@${domain}`;
}

export function maskPhone(phone: string | null | undefined): string {
  if (!phone || phone.length < 4) return "••••";
  return `${"•".repeat(phone.length - 4)}${phone.slice(-4)}`;
}
