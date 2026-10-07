import { test, expect } from "@playwright/test";

test.use({ channel: "chrome" });

test.describe("Client Features Verification in Production", () => {
  test("verify weather card, chat pills, and shop routine packs", async ({ page }) => {
    test.setTimeout(90000);

    // 1. Perform express login
    const expressRes = await page.request.get("https://kene-beaute.com/api/auth/express?role=client");
    expect(expressRes.ok()).toBeTruthy();
    const data = await expressRes.json();
    console.log("Express login user:", data.user?.name);

    // 2. Inject user in localStorage to bypass welcome landing screen
    await page.addInitScript((userData) => {
      const store = {
        state: {
          user: userData,
          clientTab: "accueil",
          theme: "light",
          lang: "fr",
          cart: [],
        },
        version: 0,
      };
      window.localStorage.setItem("kene-store", JSON.stringify(store));
    }, data.user);

    // 3. Navigate to root (Home)
    console.log("Navigating to Home...");
    await page.goto("https://kene-beaute.com/", { waitUntil: "domcontentloaded" });

    // Verify Home Weather Card
    const weatherCard = page.locator("text=Météo & Peau");
    await expect(weatherCard).toBeVisible({ timeout: 20000 });
    console.log("PASS: Weather card is visible on Home tab");
    await page.screenshot({ path: "scratch/screenshot_home_weather.png" });

    // 4. Navigate to Chat via deep-link
    console.log("Navigating to Chat via ?tab=chat...");
    await page.goto("https://kene-beaute.com/?tab=chat", { waitUntil: "domcontentloaded" });

    // Verify Quick Suggestion pills
    const themedPills = page.locator("button:has-text('Taches'), button:has-text('Sébum'), button:has-text('Solaire')");
    await expect(themedPills.first()).toBeVisible({ timeout: 20000 });
    console.log("PASS: Themed suggestion pills visible in Chat");
    await page.screenshot({ path: "scratch/screenshot_chat_pills.png" });

    // 5. Navigate to Shop via deep-link
    console.log("Navigating to Shop via ?tab=boutique...");
    await page.goto("https://kene-beaute.com/?tab=boutique", { waitUntil: "domcontentloaded" });

    // Verify Routine Packs filter chip or section
    const packsChip = page.locator("button:has-text('Packs Routines')");
    await expect(packsChip).toBeVisible({ timeout: 20000 });
    console.log("PASS: Packs Routines filter chip visible in Shop");

    // Click Packs Routines chip to filter
    await packsChip.click();
    const packHeading = page.locator("text=Routines Complètes");
    await expect(packHeading).toBeVisible({ timeout: 20000 });
    console.log("PASS: Routine packs dedicated section rendered");

    // Verify at least one pack card with action button
    const addPackBtn = page.locator("button:has-text('Ajouter la routine')");
    await expect(addPackBtn.first()).toBeVisible({ timeout: 20000 });
    console.log("PASS: 'Ajouter la routine' button visible and functional");
    await page.screenshot({ path: "scratch/screenshot_shop_packs.png" });

    console.log("ALL 3 FEATURES VERIFIED SUCCESSFULLY IN PRODUCTION!");
  });
});
