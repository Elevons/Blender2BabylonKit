import type { ILoadingScreen } from "@babylonjs/core/Loading/loadingScreen";

const ROOT_ID = "bjs-loading";
const STATUS_ID = "bjs-loading-status";
const BAR_ID = "bjs-loading-bar";
const PCT_ID = "bjs-loading-pct";

/** Format bytes for the loading label (MB once past 1 MiB). */
function FormatBytes(byteCount: number): string
{
  if (byteCount < 1024)
  {
    return `${byteCount} B`;
  }

  if (byteCount < 1024 * 1024)
  {
    return `${(byteCount / 1024).toFixed(0)} KB`;
  }

  return `${(byteCount / (1024 * 1024)).toFixed(1)} MB`;
}

/** Create the default overlay markup when index.html did not include it. */
export function EnsureLoadingOverlay(): void
{
  if (typeof document === "undefined")
  {
    return;
  }

  if (document.getElementById(ROOT_ID) !== null)
  {
    return;
  }

  const root = document.createElement("div");
  root.id = ROOT_ID;
  root.setAttribute("role", "status");
  root.setAttribute("aria-live", "polite");
  root.setAttribute("aria-busy", "true");
  root.innerHTML =
    `<div class="bjs-loading-panel">` +
    `<div class="bjs-loading-status" id="${STATUS_ID}">Loading…</div>` +
    `<div class="bjs-loading-track">` +
    `<div class="bjs-loading-bar" id="${BAR_ID}" data-indeterminate="true"></div>` +
    `</div>` +
    `<div class="bjs-loading-pct" id="${PCT_ID}"></div>` +
    `</div>`;
  document.body.appendChild(root);
}

/** Show the overlay (idempotent). */
export function ShowLoadingOverlay(status = "Loading…"): void
{
  EnsureLoadingOverlay();
  const root = document.getElementById(ROOT_ID);
  if (root === null)
  {
    return;
  }

  root.dataset.hidden = "false";
  root.setAttribute("aria-busy", "true");
  root.style.display = "flex";
  SetLoadingStatus(status);
}

/** Update the status line without changing the bar. */
export function SetLoadingStatus(status: string): void
{
  const statusElement = document.getElementById(STATUS_ID);
  if (statusElement !== null)
  {
    statusElement.textContent = status;
  }
}

/**
 * Set determinate progress (`0..1`) or pass `null` for an indeterminate bar.
 * Optional `loaded`/`total` fill the secondary line (e.g. pak download).
 */
export function SetLoadingProgress(
  ratio: number | null,
  status?: string,
  detail?: { loaded: number; total: number }
): void
{
  EnsureLoadingOverlay();
  ShowLoadingOverlay(status ?? document.getElementById(STATUS_ID)?.textContent ?? "Loading…");

  if (status !== undefined)
  {
    SetLoadingStatus(status);
  }

  const bar = document.getElementById(BAR_ID);
  const pct = document.getElementById(PCT_ID);
  if (bar === null)
  {
    return;
  }

  if (ratio === null || !Number.isFinite(ratio))
  {
    bar.dataset.indeterminate = "true";
    bar.style.width = "40%";
    if (pct !== null)
    {
      pct.textContent = detail !== undefined && detail.total > 0
        ? `${FormatBytes(detail.loaded)} / ${FormatBytes(detail.total)}`
        : "";
    }
    return;
  }

  const clamped = Math.min(1, Math.max(0, ratio));
  bar.dataset.indeterminate = "false";
  bar.style.width = `${(clamped * 100).toFixed(1)}%`;

  if (pct !== null)
  {
    if (detail !== undefined && detail.total > 0)
    {
      pct.textContent =
        `${Math.round(clamped * 100)}% · ${FormatBytes(detail.loaded)} / ${FormatBytes(detail.total)}`;
    }
    else
    {
      pct.textContent = `${Math.round(clamped * 100)}%`;
    }
  }
}

/** Hide the overlay after a short fade. */
export function HideLoadingOverlay(): void
{
  const root = document.getElementById(ROOT_ID);
  if (root === null)
  {
    return;
  }

  root.dataset.hidden = "true";
  root.setAttribute("aria-busy", "false");
  window.setTimeout(() =>
  {
    if (root.dataset.hidden === "true")
    {
      root.style.display = "none";
    }
  }, 280);
}

/**
 * Babylon {@link ILoadingScreen} that drives the kit overlay instead of the
 * default spinner logo.
 */
export function CreateKitLoadingScreen(initialText = "Loading…"): ILoadingScreen
{
  let text = initialText;

  return {
    loadingUIBackgroundColor: "#0a0a0a",
    get loadingUIText(): string
    {
      return text;
    },
    set loadingUIText(value: string)
    {
      text = value;
      SetLoadingStatus(value);
    },
    displayLoadingUI(): void
    {
      ShowLoadingOverlay(text);
      SetLoadingProgress(null, text);
    },
    hideLoadingUI(): void
    {
      HideLoadingOverlay();
    },
  };
}
