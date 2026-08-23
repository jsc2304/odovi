export const PRIVACY_NOTICE_VERSION = "2026-08-22";

export const legalContact = {
  providerName: "Jan Schultheiss",
  streetAddress: "",
  postalCodeAndCity: "",
  email: "",
} as const;

export const legalContactIsComplete = Boolean(
  legalContact.streetAddress &&
    legalContact.postalCodeAndCity &&
    legalContact.email,
);

export const LEGAL_VALUE_MISSING = "Vor dem öffentlichen Launch ergänzen";
