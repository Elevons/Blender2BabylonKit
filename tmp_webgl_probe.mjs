import puppeteer from "puppeteer-core";

const browser = await puppeteer.launch({
  executablePath: "/usr/bin/google-chrome",
  headless: true,
  args: ["--no-sandbox", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage();
const info = await page.evaluate(() =>
{
  const canvas = document.createElement("canvas");
  const gl2 = canvas.getContext("webgl2");
  const gl1 = canvas.getContext("webgl");
  const gl = gl2 ?? gl1;
  if (!gl) { return { webgl2: !!gl2, webgl1: !!gl1 }; }
  const dbg = gl.getExtension("WEBGL_debug_renderer_info");
  return {
    webgl2: !!gl2,
    webgl1: !!gl1,
    renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
  };
});
console.log(info);
await browser.close();
