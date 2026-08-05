import express, { type Express, type Request, type Response, type NextFunction } from "express";

import { ListAssets, ListAllAssets, ReadAsset, WriteAsset } from "./assets.js";
import {
  ASSET_FOLDERS,
  type AssetFolder,
} from "./paths.js";
import {
  GetDevServerStatus,
  GetProjectSummary,
  ListLevels,
  StartDevServer,
  StopDevServer,
  UpdateLevelsBlock,
  UpdatePublishBlock,
  DESKTOP_TARGET_PRESETS,
} from "./project.js";
import {
  BuildMcp,
  GetMcpStatus,
  StartMcp,
  StopMcp,
} from "./mcp.js";
import {
  BuildDocs,
  GetDocsStatus,
  MountDocsStatic,
} from "./docs.js";
import {
  GetPublishStatus,
  ListArtifacts,
  RunPublish,
  ApplyProjectIcon,
} from "./publish.js";

function AsyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<void>,
)
{
  return (req: Request, res: Response, next: NextFunction): void =>
  {
    handler(req, res, next).catch(next);
  };
}

function ParseAssetFolder(folder: string): AssetFolder
{
  if (!ASSET_FOLDERS.includes(folder as AssetFolder))
  {
    throw new Error(`Unknown asset folder: ${folder}`);
  }
  return folder as AssetFolder;
}

export function CreateApiApp(): Express
{
  const app = express();
  app.use(express.json({ limit: "32mb" }));

  app.get("/api/health", (_req, res) =>
  {
    res.json({ ok: true });
  });

  app.get("/api/project", (_req, res) =>
  {
    res.json(GetProjectSummary());
  });

  app.get("/api/project/levels", (_req, res) =>
  {
    res.json(ListLevels());
  });

  app.put("/api/project/levels", (req, res) =>
  {
    try
    {
      const body = req.body as {
        include?: string[];
        start?: string;
        startManifest?: string;
      };
      if (!Array.isArray(body.include) || typeof body.start !== "string" || body.start === "")
      {
        res.status(400).json({ error: "include (string[]) and start (string) are required" });
        return;
      }
      if (!body.include.includes(body.start))
      {
        res.status(400).json({ error: "start level must be in include" });
        return;
      }
      const next = UpdateLevelsBlock({
        include: body.include,
        start: body.start,
        startManifest: body.startManifest,
      });
      res.json(next);
    }
    catch (error)
    {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  app.get("/api/project/publish/presets", (_req, res) =>
  {
    res.json(DESKTOP_TARGET_PRESETS);
  });

  app.put("/api/project/publish", (req, res) =>
  {
    try
    {
      const body = req.body as {
        productName?: string;
        identifier?: string;
        version?: string;
        icon?: string;
        outputDir?: string;
        webBase?: string;
        desktopTargetsPreset?: string;
        desktopTargets?: string;
      };
      const next = UpdatePublishBlock({
        productName: body.productName,
        identifier: body.identifier,
        version: body.version,
        icon: body.icon,
        outputDir: body.outputDir,
        webBase: body.webBase,
        desktopTargetsPreset: body.desktopTargetsPreset,
        desktopTargets: body.desktopTargets,
      });
      res.json(next);
    }
    catch (error)
    {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  app.post("/api/project/publish/icon", (_req, res) =>
  {
    const result = ApplyProjectIcon();
    if (!result.ok)
    {
      res.status(400).json({ error: result.log || "Icon generation failed", ...result });
      return;
    }
    res.json(result);
  });

  app.get("/api/project/assets/:level", (req, res) =>
  {
    const folder = req.query.folder as string | undefined;
    if (folder)
    {
      res.json(ListAssets(req.params.level, ParseAssetFolder(folder)));
      return;
    }
    res.json(ListAllAssets(req.params.level));
  });

  app.get("/api/project/assets/:level/:folder/:file", (req, res) =>
  {
    try
    {
      const content = ReadAsset(
        req.params.level,
        ParseAssetFolder(req.params.folder),
        req.params.file,
      );
      res.type("application/json").send(content);
    }
    catch (error)
    {
      res.status(404).json({ error: (error as Error).message });
    }
  });

  app.put("/api/project/assets/:level/:folder/:file", (req, res) =>
  {
    try
    {
      const body = typeof req.body === "string" ? req.body : JSON.stringify(req.body, null, 2);
      const result = WriteAsset(
        req.params.level,
        ParseAssetFolder(req.params.folder),
        req.params.file,
        body,
      );
      res.json(result);
    }
    catch (error)
    {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  app.get("/api/dev", AsyncHandler(async (_req, res) =>
  {
    res.json(await GetDevServerStatus());
  }));

  app.post("/api/dev/start", AsyncHandler(async (_req, res) =>
  {
    res.json(await StartDevServer());
  }));

  app.post("/api/dev/stop", AsyncHandler(async (_req, res) =>
  {
    res.json(await StopDevServer());
  }));

  app.get("/api/mcp", AsyncHandler(async (_req, res) =>
  {
    res.json(await GetMcpStatus());
  }));

  app.post("/api/mcp/build", AsyncHandler(async (_req, res) =>
  {
    res.json(await BuildMcp());
  }));

  app.post("/api/mcp/start", AsyncHandler(async (_req, res) =>
  {
    res.json(await StartMcp());
  }));

  app.post("/api/mcp/stop", AsyncHandler(async (_req, res) =>
  {
    res.json(await StopMcp());
  }));

  app.get("/api/services", AsyncHandler(async (_req, res) =>
  {
    const [dev, mcp] = await Promise.all([
      GetDevServerStatus(),
      GetMcpStatus(),
    ]);
    res.json({ dev, mcp });
  }));

  app.post("/api/services/start-all", AsyncHandler(async (_req, res) =>
  {
    const [dev, mcp] = await Promise.all([
      StartDevServer(),
      StartMcp(),
    ]);
    res.json({ dev, mcp });
  }));

  app.post("/api/services/stop-all", AsyncHandler(async (_req, res) =>
  {
    const [dev, mcp] = await Promise.all([
      StopDevServer(),
      StopMcp(),
    ]);
    res.json({ dev, mcp });
  }));

  app.get("/api/docs", (_req, res) =>
  {
    res.json(GetDocsStatus());
  });

  app.post("/api/docs/build", AsyncHandler(async (_req, res) =>
  {
    res.json(await BuildDocs());
  }));

  app.post("/api/project/publish/:target", AsyncHandler(async (req, res) =>
  {
    const target = req.params.target;
    if (target !== "web" && target !== "desktop" && target !== "android")
    {
      res.status(400).json({ error: `Unknown publish target: ${target}` });
      return;
    }
    try
    {
      res.json(await RunPublish(target));
    }
    catch (error)
    {
      const message = (error as Error).message;
      if (message.includes("already running"))
      {
        res.status(409).json({ error: message });
        return;
      }
      throw error;
    }
  }));

  app.get("/api/project/publish/status", (_req, res) =>
  {
    res.json(GetPublishStatus());
  });

  app.get("/api/project/publish/artifacts", (_req, res) =>
  {
    res.json(ListArtifacts());
  });

  MountDocsStatic(app);

  app.use((error: Error, _req: Request, res: Response, _next: NextFunction) =>
  {
    res.status(500).json({ error: error.message });
  });

  return app;
}
