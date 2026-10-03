import type { Metadata } from "next";
import { PinEntry } from "@/components/kene/auth/PinEntry";

export const metadata: Metadata = {
  title: "Kènè — Code secret",
  description: "Connexion sécurisée par code secret PIN à Kènè.",
};

export default function PinPage() {
  return <PinEntry />;
}
