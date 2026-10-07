import { test, expect } from "@playwright/test";

test.use({ channel: "chrome", viewport: { width: 1280, height: 800 } });

test.describe("Settings Screen & Pro CRM Verification in Production", () => {
  test("verify client settings 4 thematic groups and granular notification switches", async ({ page }) => {
    test.setTimeout(60000);

    console.log("Starting Client Settings verification...");

    // Initialize mock client session directly in localStorage
    await page.addInitScript(() => {
      const store = {
        state: {
          user: {
            id: "usr_mariam_demo",
            name: "Mariam Diallo",
            phone: "+2250701020304",
            role: "client",
          },
          space: "client",
          clientTab: "parametres",
          theme: "light",
          lang: "fr",
          cart: [],
        },
        version: 0,
      };
      window.localStorage.setItem("kene-store", JSON.stringify(store));
    });

    // Navigate to Settings
    await page.goto("https://kene-beaute.com/?tab=parametres", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);

    // Verify 4 thematic group headers (with scroll into view for Reveal animation)
    const group1 = page.locator("text=Mon Compte & Sécurité");
    await group1.scrollIntoViewIfNeeded();
    await expect(group1).toBeVisible({ timeout: 10000 });
    console.log("PASS: Group 1 'Mon Compte & Sécurité' is visible");

    const group2 = page.locator("text=Préférences & Affichage");
    await group2.scrollIntoViewIfNeeded();
    await expect(group2).toBeVisible({ timeout: 10000 });
    console.log("PASS: Group 2 'Préférences & Affichage' is visible");

    // Verify Granular Notification Preferences inside Group 2
    const notifCare = page.locator("text=Rappels de soins & rendez-vous");
    await notifCare.scrollIntoViewIfNeeded();
    await expect(notifCare).toBeVisible({ timeout: 10000 });
    console.log("PASS: Granular notification 'Rappels de soins & rendez-vous' is visible");

    const notifWeather = page.locator("text=Conseil Dermo-Météo & UV");
    await expect(notifWeather).toBeVisible({ timeout: 10000 });
    console.log("PASS: Granular notification 'Conseil Dermo-Météo & UV' is visible");

    const notifOffers = page.locator("text=Offres & Événements instituts");
    await expect(notifOffers).toBeVisible({ timeout: 10000 });
    console.log("PASS: Granular notification 'Offres & Événements instituts' is visible");

    // Test toggle interaction on the notification switch
    const notifSwitch = page.locator("section:has-text('Notifications') button[role='switch']").first();
    await expect(notifSwitch).toBeVisible({ timeout: 10000 });
    const initialChecked = await notifSwitch.getAttribute("aria-checked");
    await notifSwitch.click({ force: true });
    const updatedChecked = await notifSwitch.getAttribute("aria-checked");
    expect(updatedChecked).not.toBe(initialChecked);
    console.log(`PASS: Notification toggle clicked: switched from ${initialChecked} to ${updatedChecked}`);

    const group3 = page.locator("text=Confidentialité & Données");
    await group3.scrollIntoViewIfNeeded();
    await expect(group3).toBeVisible({ timeout: 10000 });
    console.log("PASS: Group 3 'Confidentialité & Données' is visible");

    const group4 = page.locator("text=Écosystème Kènè & Légal");
    await group4.scrollIntoViewIfNeeded();
    await expect(group4).toBeVisible({ timeout: 10000 });
    console.log("PASS: Group 4 'Écosystème Kènè & Légal' is visible");

    await page.screenshot({ path: "scratch/screenshot_settings_groups.png" });
  });

  test("verify pro CRM section and district filtering in new client dialog", async ({ browser }) => {
    test.setTimeout(60000);

    const context = await browser.newContext();
    const page = await context.newPage();

    console.log("Starting Pro CRM verification...");

    await page.addInitScript(() => {
      const store = {
        state: {
          user: {
            id: "usr_pro_demo",
            name: "Fatou Koné",
            phone: "+2250709080706",
            role: "pro",
            tenantId: "inst_plateau_01",
          },
          space: "pro",
          proTenantId: "inst_plateau_01",
          theme: "light",
          lang: "fr",
          cart: [],
        },
        version: 0,
      };
      window.localStorage.setItem("kene-store", JSON.stringify(store));
    });

    await page.goto("https://kene-beaute.com/pro", { waitUntil: "domcontentloaded" });

    // Wait for hydration & initial tenant resolution
    await page.waitForTimeout(2000);

    // Switch to CRM section if not already open
    const crmNavBtn = page.locator("aside button[aria-label*='CRM'], button[aria-label*='CRM']:visible").first();
    await expect(crmNavBtn).toBeVisible({ timeout: 20000 });
    await crmNavBtn.click({ force: true });

    // Verify CRM Section Header (h1)
    const crmHeader = page.locator("h1:has-text('CRM')").first();
    await expect(crmHeader).toBeVisible({ timeout: 20000 });
    console.log("PASS: Pro CRM Section is visible");

    // Verify Zone / District filter chips
    const allZonesBtn = page.locator("button:has-text('Toutes les zones')");
    await expect(allZonesBtn).toBeVisible({ timeout: 10000 });
    console.log("PASS: 'Toutes les zones' filter button is visible");

    const plateauZoneBtn = page.locator("button:has-text('Plateau')");
    await expect(plateauZoneBtn).toBeVisible({ timeout: 10000 });
    console.log("PASS: 'Plateau' district filter button is visible");

    // Verify client table row displays district badge
    const clientRow = page.locator("td:has-text('Plateau')");
    await expect(clientRow.first()).toBeVisible({ timeout: 10000 });
    console.log("PASS: Client table row shows district badge 'Plateau'");

    // Verify Search input and Add Client button
    const searchInput = page.locator("input[placeholder*='Rechercher nom']");
    await expect(searchInput).toBeVisible({ timeout: 10000 });
    console.log("PASS: CRM client search input is visible");

    const addClientBtn = page.locator("button:has-text('Nouvelle cliente')");
    await expect(addClientBtn).toBeVisible({ timeout: 10000 });
    console.log("PASS: 'Nouvelle cliente' button is visible");

    // Click 'Nouvelle cliente' and verify District / Commune input is available
    await addClientBtn.click();
    const districtInput = page.locator("#create-district");
    await expect(districtInput).toBeVisible({ timeout: 10000 });
    console.log("PASS: 'Quartier / Commune' field is visible in the client creation dialog");

    // Close dialog
    const cancelBtn = page.locator("button:has-text('Annuler')");
    await cancelBtn.click();

    await page.screenshot({ path: "scratch/screenshot_pro_crm.png" });
    console.log("PASS: Pro CRM verified successfully in production!");

    await context.close();
  });
});
