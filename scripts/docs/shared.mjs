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
// Bottom nav (engine packet = blue, blender packet = amber).
// ---------------------------------------------------------------------------

export function BuildEngineNav(currentFile, areaNav, traceNav, { highlightDiagrams = null } = {})
{
  const highlight = highlightDiagrams ? new Set(highlightDiagrams) : null;
  const areaLink = ([file, label]) =>
  {
    if (file === currentFile)
    {
      return `<span style="background:#4f6df5;color:#fff;border-radius:6px;padding:2px 8px;">${label}</span>`;
    }
    const emph = highlight?.has(file)
      ? "font-weight:600;border-bottom:1px solid #6b7fff;"
      : "";
    return `<a href="${file}" style="color:#cdd5ff;text-decoration:none;padding:2px 8px;${emph}">${label}</a>`;
  };
  const traceLink = ([file, label]) => file === currentFile
    ? `<span style="background:#4f6df5;color:#fff;border-radius:6px;padding:2px 8px;">${label}</span>`
    : `<a href="${file}" style="color:#cdd5ff;text-decoration:none;padding:2px 8px;">${label}</a>`;
  return '<div style="position:fixed;bottom:10px;left:50%;transform:translateX(-50%);z-index:9999;'
    + 'background:#1b2030;border:1px solid #333a55;border-radius:10px;padding:6px 10px;'
    + 'font:12px system-ui,sans-serif;box-shadow:0 4px 14px rgba(0,0,0,.4);">'
    + '<div style="display:flex;gap:2px;justify-content:center;flex-wrap:wrap;">'
    + '<a href="../index.html" style="color:#a8b8ff;text-decoration:none;padding:2px 8px;font-weight:600;">← Search</a>'
    + '<span style="width:1px;background:#2a3050;margin:0 2px;"></span>'
    + areaNav.map(areaLink).join("")
    + '<a href="../blender/index.html" style="color:#f0cda8;text-decoration:none;padding:2px 8px;border-left:1px solid #2a3050;margin-left:4px;">Blender docs →</a></div>'
    + '<div style="display:flex;gap:2px;justify-content:center;flex-wrap:wrap;margin-top:3px;border-top:1px solid #2a3050;padding-top:3px;">'
    + '<span style="color:#6c7396;padding:2px 6px;">Traces:</span>' + traceNav.map(traceLink).join("") + '</div></div>';
}

export function BuildBlenderNav(currentFile, areaNav, traceNav, { highlightDiagrams = null } = {})
{
  const highlight = highlightDiagrams ? new Set(highlightDiagrams) : null;
  const areaLink = ([file, label]) =>
  {
    if (file === currentFile)
    {
      return `<span style="background:#e08a3c;color:#fff;border-radius:6px;padding:2px 8px;">${label}</span>`;
    }
    const emph = highlight?.has(file)
      ? "font-weight:600;border-bottom:1px solid #e0a060;"
      : "";
    return `<a href="${file}" style="color:#f0cda8;text-decoration:none;padding:2px 8px;${emph}">${label}</a>`;
  };
  const traceLink = ([file, label]) => file === currentFile
    ? `<span style="background:#e08a3c;color:#fff;border-radius:6px;padding:2px 8px;">${label}</span>`
    : `<a href="${file}" style="color:#f0cda8;text-decoration:none;padding:2px 8px;">${label}</a>`;
  return '<div style="position:fixed;bottom:10px;left:50%;transform:translateX(-50%);z-index:9999;'
    + 'background:#241c14;border:1px solid #553f28;border-radius:10px;padding:6px 10px;'
    + 'font:12px system-ui,sans-serif;box-shadow:0 4px 14px rgba(0,0,0,.4);">'
    + '<div style="display:flex;gap:2px;justify-content:center;flex-wrap:wrap;">'
    + '<a href="../index.html" style="color:#f0cda8;text-decoration:none;padding:2px 8px;font-weight:600;">← Search</a>'
    + '<span style="width:1px;background:#553f28;margin:0 2px;"></span>'
    + '<span style="color:#967a52;padding:2px 6px;">Blender:</span>' + areaNav.map(areaLink).join("")
    + '<a href="../engine/index.html" style="color:#8fa3ff;text-decoration:none;padding:2px 8px;border-left:1px solid #553f28;margin-left:4px;">Runtime docs →</a></div>'
    + '<div style="display:flex;gap:2px;justify-content:center;flex-wrap:wrap;margin-top:3px;border-top:1px solid #553f28;padding-top:3px;">'
    + '<span style="color:#967a52;padding:2px 6px;">Traces:</span>' + traceNav.map(traceLink).join("") + '</div></div>';
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
