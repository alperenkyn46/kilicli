import { DomainError } from "./errors.js";

declare const idBrand: unique symbol;

export type Id<Brand extends string> = string & { readonly [idBrand]: Brand };

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function assertUuid(value: string, label: string): void {
  if (!UUID_PATTERN.test(value)) {
    throw new DomainError("INVALID_ID", `${label} must be a UUID`);
  }
}

export function asId<Brand extends string>(value: string, label: string): Id<Brand> {
  assertUuid(value, label);
  return value as Id<Brand>;
}

export function newId<Brand extends string>(): Id<Brand> {
  return crypto.randomUUID() as Id<Brand>;
}
