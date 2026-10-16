"use client";
// Kènè — APP PRO Wrapper
// Délègue directement à ProEnterpriseShell pour garantir un découpage de chunk neuf.
export {
  ProEnterpriseShell,
  ProEnterpriseShell as ProApp,
  PRO_NAV_CATEGORIES,
  proToastError,
} from "./ProEnterpriseShell";
export type {
  ProSectionId,
  ProNavCategory,
  ProNavCategoryDef,
  ProNavItem,
} from "./ProEnterpriseShell";
