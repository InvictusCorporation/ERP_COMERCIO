import { BadRequestException } from "@nestjs/common";
export function normalizeCnpj(value: string) {
  return value.toUpperCase().replace(/[.\/\-\s]/g, "");
}
export function validCnpj(input: string) {
  const value = normalizeCnpj(input);
  if (!/^[A-Z0-9]{12}[0-9]{2}$/.test(value) || /^(.)\1{13}$/.test(value))
    return false;
  const digit = (s: string) => {
    let sum = 0,
      weight = 2;
    for (let i = s.length - 1; i >= 0; i--) {
      sum += (s.charCodeAt(i) - 48) * weight;
      weight = weight === 9 ? 2 : weight + 1;
    }
    const remainder = sum % 11;
    return remainder < 2 ? "0" : String(11 - remainder);
  };
  const first = digit(value.slice(0, 12));
  return value.slice(12) === first + digit(value.slice(0, 12) + first);
}
export function cnpj(value: string) {
  if (!validCnpj(value))
    throw new BadRequestException(
      "Informe um CNPJ numérico ou alfanumérico válido.",
    );
  return normalizeCnpj(value);
}
export const STATES = [
  "AC",
  "AL",
  "AP",
  "AM",
  "BA",
  "CE",
  "DF",
  "ES",
  "GO",
  "MA",
  "MT",
  "MS",
  "MG",
  "PA",
  "PB",
  "PR",
  "PE",
  "PI",
  "RJ",
  "RN",
  "RS",
  "RO",
  "RR",
  "SC",
  "SP",
  "SE",
  "TO",
];
