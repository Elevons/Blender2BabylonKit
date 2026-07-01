/**
 * Shared diagram-doc utilities: one HTML shell, nav injection, layout patches.
 * All interactive pages are generated from docs/_template/diagram-shell.html.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(fileURLToPath(import.meta.url), "../../..");
export const SHELL_PATH = path.join(ROOT, "docs", "_template", "diagram-shell.html");

export function ReadShell()
{
  return fs.readFileSync(SHELL_PATH, "utf8");
}

// ---------------------------------------------------------------------------
// Page assembly — shell + diagram data + nav + optional body patches.
// ---------------------------------------------------------------------------

export function EmitDiagramPage({ shell, outPath, pageTitle, diagramData, navHtml, bodyPatch = "" })
{
  const serialised = JSON.stringify(diagramData);
  const match = shell.match(/const DIAGRAM_DATA = \{[\s\S]*?\};/);
  if (match === null)
  {
    throw new Error("diagram-shell.html is missing const DIAGRAM_DATA = {};");
  }

  let page = shell.slice(0, match.index)
    + "const DIAGRAM_DATA = " + serialised + ";"
    + shell.slice(match.index + match[0].length);
  page = page.replace(/<title>.*?<\/title>/, `<title>${pageTitle}</title>`);
  page = page.replace("<body>", "<body>" + navHtml);
  page = page.replace("</body>", bodyPatch + "</body>");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, page);
}

// ---------------------------------------------------------------------------
// Bottom nav — compact breadcrumbs (not a wall of subsystem buttons).
// ---------------------------------------------------------------------------

const DOC_NAV_STYLES = `
<style id="doc-bottom-nav-styles">
  #doc-bottom-nav {
    position: fixed; bottom: 0; left: 0; right: 0; z-index: 9999;
    background: #12121a; border-top: 1px solid #2a2838;
    padding: 10px 20px 12px; font: 13px/1.45 ui-sans-serif, system-ui, sans-serif;
    box-shadow: 0 -4px 24px rgba(0,0,0,.35);
  }
  #doc-bottom-nav .crumbs {
    display: flex; flex-wrap: wrap; align-items: center; gap: 4px 8px;
    max-width: 960px; margin: 0 auto;
  }
  #doc-bottom-nav a { color: #9aa8e8; text-decoration: none; }
  #doc-bottom-nav a:hover { text-decoration: underline; color: #c8d4ff; }
  #doc-bottom-nav .sep { color: #454560; user-select: none; }
  #doc-bottom-nav .current { color: #e8ecff; font-weight: 500; }
  #doc-bottom-nav .traces-row {
    max-width: 960px; margin: 8px auto 0; padding-top: 8px;
    border-top: 1px solid #1e1c28;
    display: flex; align-items: baseline; gap: 10px;
  }
  #doc-bottom-nav .traces-label {
    flex-shrink: 0; font-size: 11px; font-weight: 600; text-transform: uppercase;
    letter-spacing: .06em; color: #6c7396;
  }
  #doc-bottom-nav .traces-links {
    display: flex; flex-wrap: wrap; gap: 4px 12px; font-size: 12px; line-height: 1.5;
  }
  #doc-bottom-nav .traces-links .current {
    color: #e8ecff; font-weight: 500;
  }
  #doc-bottom-nav.blender a { color: #d4a870; }
  #doc-bottom-nav.blender a:hover { color: #ffe8c8; }
  #doc-bottom-nav.blender .current { color: #ffe8d0; }
  #app { padding-bottom: 72px; }
</style>`;

/**
 * @param {{ side: "engine"|"blender", currentFile: string, currentTitle: string, pageKind: "overview"|"diagram"|"trace", allTraces?: [string,string][] }} opts
 */
export function BuildDiagramBottomNav(opts)
{
  const { side, currentFile, currentTitle, pageKind, allTraces = [] } = opts;
  const isEngine = side === "engine";
  const cls = isEngine ? "" : " blender";
  const accentLink = isEngine
    ? `<a href="../blender/00-INDEX.html">Blender</a>`
    : `<a href="../engine/00-INDEX.html">Engine</a>`;

  const crumbs = [`<a href="../index.html">Docs</a>`];
  if (isEngine)
  {
    crumbs.push(`<a href="00-INDEX.html">Engine guide</a>`);
    if (pageKind === "trace")
    {
      crumbs.push(`<a href="index.html">Diagrams</a>`);
    }
    else if (pageKind === "diagram" && currentFile !== "index.html")
    {
      crumbs.push(`<a href="index.html">Diagrams</a>`);
    }
  }
  else
  {
    crumbs.push(`<a href="00-INDEX.html">Blender guide</a>`);
    if (pageKind === "trace")
    {
      crumbs.push(`<a href="index.html">Diagrams</a>`);
    }
    else if (pageKind === "diagram" && currentFile !== "index.html")
    {
      crumbs.push(`<a href="index.html">Diagrams</a>`);
    }
  }

  if (currentTitle)
  {
    crumbs.push(`<span class="current">${currentTitle}</span>`);
  }
  crumbs.push(accentLink);

  const crumbHtml = crumbs.join('<span class="sep">/</span>');

  let tracesHtml = "";
  if (allTraces.length > 0)
  {
    const links = allTraces.map(([file, label]) =>
    {
      if (file === currentFile)
      {
        return `<span class="current">${label}</span>`;
      }
      return `<a href="${file}">${label}</a>`;
    }).join("");
    tracesHtml = `<div class="traces-row"><span class="traces-label">Traces</span><div class="traces-links">${links}</div></div>`;
  }

  return `${DOC_NAV_STYLES}<nav id="doc-bottom-nav" class="${cls.trim()}"><div class="crumbs">${crumbHtml}</div>${tracesHtml}</nav>`;
}

/** @deprecated Use BuildDiagramBottomNav — kept as thin wrapper for build scripts. */
export function BuildEngineNav(currentFile, areaNav, traceNav, { currentTitle = null } = {})
{
  const areaEntry = areaNav.find(([file]) => file === currentFile);
  const traceEntry = traceNav.find(([file]) => file === currentFile);
  const title = currentTitle ?? areaEntry?.[1] ?? traceEntry?.[1] ?? null;
  const pageKind = currentFile.startsWith("trace-")
    ? "trace"
    : (currentFile === "index.html" ? "overview" : "diagram");
  return BuildDiagramBottomNav({
    side: "engine",
    currentFile,
    currentTitle: title,
    pageKind,
    allTraces: traceNav,
  });
}

/** @deprecated Use BuildDiagramBottomNav — kept as thin wrapper for build scripts. */
export function BuildBlenderNav(currentFile, areaNav, traceNav, { currentTitle = null } = {})
{
  const areaEntry = areaNav.find(([file]) => file === currentFile);
  const traceEntry = traceNav.find(([file]) => file === currentFile);
  const title = currentTitle ?? areaEntry?.[1] ?? traceEntry?.[1] ?? null;
  const pageKind = currentFile.startsWith("trace-")
    ? "trace"
    : (currentFile === "index.html" ? "overview" : "diagram");
  return BuildDiagramBottomNav({
    side: "blender",
    currentFile,
    currentTitle: title,
    pageKind,
    allTraces: traceNav,
  });
}

// ---------------------------------------------------------------------------
// Layout patches injected before </body>.
// ---------------------------------------------------------------------------

function LayoutPatch(accent)
{
  return `
<style>
  #panel { position: relative; }
  #panel.open { width: var(--panel-w, min(280px, 85vw)) !important; }
  #pi { width: 100% !important; box-sizing: border-box; }
  textarea.inp.pta { resize: none !important; min-height: 120px; max-height: none; }
  .ptrace {
    flex: 1 1 auto;
    display: flex;
    flex-direction: column;
    min-height: 0;
    margin-top: 4px;
  }
  #panel-resizer { position:absolute; left:0; top:0; bottom:0; width:7px; cursor: ew-resize; z-index: 10; }
  #panel-resizer:hover, #panel-resizer.dragging { background: ${accent}33; }
</style>
<script>
  (function AttachPanelResizer()
  {
    const panel = document.getElementById('panel');
    if (!panel) { return; }
    const handle = document.createElement('div');
    handle.id = 'panel-resizer';
    panel.appendChild(handle);
    let dragging = false;
    handle.addEventListener('mousedown', (e) => { dragging = true; handle.classList.add('dragging'); panel.style.transition = 'none'; e.preventDefault(); });
    window.addEventListener('mousemove', (e) => { if (!dragging) { return; } const w = Math.min(Math.max(window.innerWidth - e.clientX, 240), window.innerWidth * 0.92); document.documentElement.style.setProperty('--panel-w', w + 'px'); });
    window.addEventListener('mouseup', () => { if (!dragging) { return; } dragging = false; handle.classList.remove('dragging'); panel.style.transition = ''; });
  })();
</script>`;
}

function CodePanelPatch(accent, tabSize)
{
  return LayoutPatch(accent) + `
<style>
  #panel.open { width: var(--panel-w, min(560px, 85vw)) !important; }
  .trace-code { background:#0d101a; border:1px solid #262d4a; border-radius:8px; padding:12px;
    margin:6px 0 0; overflow:auto; font:12px/1.5 ui-monospace,Menlo,Consolas,monospace;
    white-space:pre; tab-size:${tabSize}; color:#dde2f1; flex:1; min-height:160px; resize:none;
    box-sizing: border-box; }
  .trace-loc { color:#8b93b8; font:11px system-ui; margin:6px 0 0; }
</style>
<script>
  const __openNodePanel = openNodePanel;
  openNodePanel = function(n)
  {
    __openNodePanel(n);
    if (!n.code) { return; }
    const panel = document.getElementById('pi');
    const wrap = document.createElement('div');
    wrap.className = 'ptrace';
    const loc = document.createElement('div');
    loc.className = 'trace-loc';
    loc.textContent = n.file ? n.file + '  :  line ' + n.line : 'data between the two halves';
    const pre = document.createElement('pre');
    pre.className = 'trace-code';
    pre.textContent = n.code;
    wrap.appendChild(loc);
    wrap.appendChild(pre);
    panel.appendChild(wrap);
  };
</script>`;
}

export const LAYOUT_PATCH_ENGINE = LayoutPatch("#4f6df5");
export const CODE_PANEL_PATCH_ENGINE = CodePanelPatch("#4f6df5", 2);
export const LAYOUT_PATCH_BLENDER = LayoutPatch("#e08a3c");
export const CODE_PANEL_PATCH_BLENDER = CodePanelPatch("#e08a3c", 4);

// ---------------------------------------------------------------------------
// Trace layout + symbol extraction.
// ---------------------------------------------------------------------------

export function LayoutSteps(stepCount)
{
  const PER_ROW = 3, W = 190, H = 56, GAP_X = 260, GAP_Y = 150;
  const positions = [];
  for (let index = 0; index < stepCount; index++)
  {
    const row = Math.floor(index / PER_ROW);
    const column = index % PER_ROW;
    const x = 40 + (row % 2 === 0 ? column : PER_ROW - 1 - column) * GAP_X;
    positions.push({ x, y: 40 + row * GAP_Y, w: W, h: H });
  }
  return positions;
}

function ReadFileLines(relativePath)
{
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8").split("\n");
}

function ExtractTs(lines, symbol)
{
  const declaration = new RegExp(
    `^(export )?(async )?(function )?(private |public |static )*(async )?(get )?${symbol}\\b|^(export )?(abstract )?class ${symbol}\\b|^(export )?const ${symbol}\\b`
  );

  for (let index = 0; index < lines.length; index++)
  {
    if (!declaration.test(lines[index].trim()) && !lines[index].trim().startsWith(`${symbol}(`))
    {
      continue;
    }
    let start = index;
    if (lines[start - 1]?.trim().endsWith("*/"))
    {
      while (start > 0 && !lines[start - 1].trim().startsWith("/**")) { start--; }
      start--;
    }

    let depth = 0;
    let sawBrace = false;
    for (let end = index; end < lines.length; end++)
    {
      for (const character of lines[end])
      {
        if (character === "{") { depth++; sawBrace = true; }
        else if (character === "}") { depth--; }
      }
      if (sawBrace && depth <= 0)
      {
        return { start: start + 1, code: lines.slice(start, end + 1).join("\n") };
      }
      if (!sawBrace && lines[end].trimEnd().endsWith(";") && end > index)
      {
        return { start: start + 1, code: lines.slice(start, end + 1).join("\n") };
      }
    }
  }
  return null;
}

function ExtractPy(lines, symbol)
{
  const declaration = new RegExp(`^(\\s*)(def|class) ${symbol}\\b`);
  for (let index = 0; index < lines.length; index++)
  {
    const match = lines[index].match(declaration);
    if (match === null) { continue; }
    const indent = match[1].length;

    let end = index + 1;
    while (end < lines.length)
    {
      const line = lines[end];
      const isBlank = line.trim().length === 0;
      const lineIndent = line.length - line.trimStart().length;
      if (!isBlank && lineIndent <= indent) { break; }
      end++;
    }
    while (lines[end - 1].trim().length === 0) { end--; }
    return { start: index + 1, code: lines.slice(index, end).join("\n") };
  }
  return null;
}

export function ExtractSymbol(relativePath, symbol)
{
  const lines = ReadFileLines(relativePath);
  const extracted = relativePath.endsWith(".py")
    ? ExtractPy(lines, symbol)
    : ExtractTs(lines, symbol);

  if (extracted === null)
  {
    console.error(`MISSING: ${symbol} in ${relativePath}`);
    process.exitCode = 1;
    return { start: 0, code: `// symbol "${symbol}" not found — regenerate after fixing` };
  }
  return extracted;
}

export function ExtractPySymbol(relativePath, symbol)
{
  const lines = ReadFileLines(relativePath);
  const extracted = ExtractPy(lines, symbol);
  if (extracted === null)
  {
    console.error(`MISSING: ${symbol} in ${relativePath}`);
    process.exitCode = 1;
    return { start: 0, code: `# symbol "${symbol}" not found — regenerate after fixing` };
  }
  return extracted;
}

/** Hand-authored diagram node (blender area pages). */
export function N(id, x, y, label, sub, desc, meta, w = 160, h = 44)
{
  return { id, x, y, w, h, label, sub, desc, meta };
}

export function E(id, src, tgt, label = "")
{
  return { id, src, tgt, label };
}
