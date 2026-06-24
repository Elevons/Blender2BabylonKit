/**
 * Automatic subsystem-diagram ↔ trace linking at build time.
 * Topic membership (PAGE_TOPICS) picks candidates; node heuristics pick specifics.
 */
import { DiagramsForTrace, OVERVIEW_DIAGRAMS, TracesForDiagram } from "./topics.mjs";

/** @typedef {{ id: string, steps: Array<{ file?: string, symbol?: string, title?: string }> }} TraceDef */

function CloneDiagramData(data)
{
  return JSON.parse(JSON.stringify(data));
}

function MetaHasKey(node, key)
{
  return (node.meta ?? []).some(([k]) => k === key);
}

function PathTokens(value)
{
  return value
    .split(/[·,;|]/)
    .flatMap((part) => part.split(/\s+/))
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
}

function NodePathHints(node)
{
  const hints = [];
  for (const [key, value] of node.meta ?? [])
  {
    if (key === "File" || key === "Files" || key === "Module")
    {
      hints.push(...PathTokens(value));
    }
  }
  return hints;
}

function StepMatchesNode(node, step)
{
  const label = (node.label ?? "").toLowerCase();
  const sub = (node.sub ?? "").toLowerCase();
  const symbol = step.symbol ?? "";
  if (symbol)
  {
    const sym = symbol.toLowerCase();
    if (label === sym || sub.includes(sym)) { return true; }
  }

  if (!step.file) { return false; }

  const file = step.file.toLowerCase();
  const base = file.split("/").pop() ?? "";
  for (const hint of NodePathHints(node))
  {
    if (hint.length < 4) { continue; }
    if (file.includes(hint) || base.includes(hint)) { return true; }
  }
  return false;
}

function NodeMatchesTrace(node, trace, { strict })
{
  if (node.traceIds?.includes(trace.id)) { return true; }
  const symbolHit = trace.steps.some((step) =>
  {
    const symbol = step.symbol ?? "";
    if (!symbol) { return false; }
    const sym = symbol.toLowerCase();
    const label = (node.label ?? "").toLowerCase();
    const sub = (node.sub ?? "").toLowerCase();
    return label === sym || sub.includes(sym);
  });
  if (strict) { return symbolHit; }
  if (symbolHit) { return true; }
  return trace.steps.some((step) => StepMatchesNode(node, step));
}

function TraceFileFor(side, traceId)
{
  return `trace-${traceId}.html`;
}

function AppendMetaRows(node, rows)
{
  node.meta = node.meta ?? [];
  for (const [key, value] of rows)
  {
    if (!node.meta.some(([k, v]) => k === key && v === value))
    {
      node.meta.push([key, value]);
    }
  }
}

function CandidateTraceIds(diagramHref)
{
  return TracesForDiagram(diagramHref).map((href) =>
  {
    const file = href.split("/").pop() ?? "";
    return file.replace(/^trace-/, "").replace(/\.html$/, "");
  });
}

/**
 * Add Trace meta rows to subsystem-diagram nodes (skips nodes that already declare Trace).
 * @param {TraceDef[]} traces
 */
export function EnrichSubsystemNodes(nodes, diagramHref, side, traces)
{
  const strict = OVERVIEW_DIAGRAMS.has(diagramHref);
  const allowed = new Set(CandidateTraceIds(diagramHref));

  for (const node of nodes)
  {
    if (MetaHasKey(node, "Trace")) { continue; }

    const hits = traces.filter((trace) =>
      allowed.has(trace.id) && NodeMatchesTrace(node, trace, { strict }),
    );

    if (hits.length === 0) { continue; }

    AppendMetaRows(
      node,
      hits.map((trace) => ["Trace", TraceFileFor(side, trace.id)]),
    );
  }
}

export function EnrichEngineAreaDiagram(page, file, traces)
{
  const diagram = CloneDiagramData(page.diagram);
  EnrichSubsystemNodes(diagram.nodes, `engine/${file}`, "engine", traces);
  return diagram;
}

export function EnrichBlenderAreaDiagram(page, file, traces)
{
  const clone = CloneDiagramData(page);
  EnrichSubsystemNodes(clone.nodes, `blender/${file}`, "blender", traces);
  return {
    title: `Blender — ${page.title}`,
    nodes: clone.nodes,
    edges: clone.edges,
  };
}

/** Add Diagram meta rows on trace step nodes (subsystem maps that share topics). */
export function EnrichTraceDiagram(diagramData, traceFile, side)
{
  const diagram = CloneDiagramData(diagramData);
  const rows = DiagramsForTrace(`${side}/${traceFile}`).map((href) =>
  {
    const file = href.split("/").slice(1).join("/");
    return ["Diagram", file];
  });

  if (rows.length === 0) { return diagram; }

  for (const node of diagram.nodes)
  {
    AppendMetaRows(node, rows);
  }
  return diagram;
}
