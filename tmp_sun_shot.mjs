// Screenshot the sun_test page for each level variant using system Chrome.
import puppeteer from "puppeteer-core";
import { writeFileSync } from "node:fs";

const BASE = "http://localhost:5173/sun_test.html";
const VARIANTS = ["tmp_sun_near", "tmp_sun_far", "tmp_sun_veryfar"];

const browser = await puppeteer.launch({
  executablePath: "/usr/bin/google-chrome",
  headless: "new",
  args: [
    "--no-sandbox",
    "--ozone-platform=headless",
    "--use-angle=gles-egl",
    "--enable-gpu",
    "--ignore-gpu-blocklist",
    "--window-size=960,600",
  ],
  defaultViewport: { width: 960, height: 600 },
});

for (const variant of VARIANTS)
{
  const page = await browser.newPage();
  page.on("console", (message) =>
  {
    const text = message.text();
    if (text.includes("[bjs]") || message.type() === "error" || message.type() === "warning")
    {
      console.log(`[${variant}] ${message.type()}: ${text}`);
    }
  });
  page.on("pageerror", (error) => console.log(`[${variant}] pageerror: ${error.message}`));

  await page.goto(`${BASE}?level=${encodeURIComponent(variant)}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction("window.__levelReady === true", { timeout: 60000 });

  const sunInfo = await page.evaluate("window.__sunInfo");
  console.log(`[${variant}] sun:`, JSON.stringify(sunInfo));

  const shot = await page.screenshot({ type: "png" });
  writeFileSync(`tmp_shot_${variant}.png`, shot);
  console.log(`[${variant}] saved tmp_shot_${variant}.png`);
  await page.close();
}

await browser.close();
