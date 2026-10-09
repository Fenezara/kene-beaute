// Kènè — Configuration et état du Mode Maintenance système
// Persistance sur disque dans /db/maintenance.json (volume Docker persistant)
import fs from "fs";
import path from "path";

export interface MaintenanceConfig {
  enabled: boolean;
  message: string;
  estimatedEnd?: string | null;
  emergencyPhone: string;
  updatedAt?: string;
  updatedBy?: string;
}

const DEFAULT_CONFIG: MaintenanceConfig = {
  enabled: false,
  message: "Kènè fait peau neuve ! Nos équipes effectuent actuellement une mise à jour d'optimisation pour améliorer votre expérience. Vos soins et réservations sont préservés.",
  estimatedEnd: null,
  emergencyPhone: "+2250748894270",
  updatedAt: new Date().toISOString(),
  updatedBy: "Système",
};

function getConfigPath(): string {
  // En production et en dev, le répertoire db/ se trouve à la racine du projet
  return path.join(process.cwd(), "db", "maintenance.json");
}

export function getMaintenanceConfig(): MaintenanceConfig {
  try {
    const filePath = getConfigPath();
    if (!fs.existsSync(filePath)) {
      return DEFAULT_CONFIG;
    }
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    return {
      enabled: Boolean(parsed.enabled),
      message: typeof parsed.message === "string" && parsed.message.trim() ? parsed.message.trim() : DEFAULT_CONFIG.message,
      estimatedEnd: parsed.estimatedEnd ? String(parsed.estimatedEnd) : null,
      emergencyPhone: parsed.emergencyPhone ? String(parsed.emergencyPhone) : DEFAULT_CONFIG.emergencyPhone,
      updatedAt: parsed.updatedAt || new Date().toISOString(),
      updatedBy: parsed.updatedBy || "Administrateur",
    };
  } catch (err) {
    console.error("[maintenance] Erreur de lecture de maintenance.json :", err);
    return DEFAULT_CONFIG;
  }
}

export function setMaintenanceConfig(update: Partial<MaintenanceConfig>, author = "Administrateur"): MaintenanceConfig {
  try {
    const filePath = getConfigPath();
    const current = getMaintenanceConfig();
    const next: MaintenanceConfig = {
      ...current,
      ...update,
      enabled: update.enabled !== undefined ? Boolean(update.enabled) : current.enabled,
      updatedAt: new Date().toISOString(),
      updatedBy: author,
    };

    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(filePath, JSON.stringify(next, null, 2), "utf-8");
    return next;
  } catch (err) {
    console.error("[maintenance] Erreur d'écriture dans maintenance.json :", err);
    throw err;
  }
}
