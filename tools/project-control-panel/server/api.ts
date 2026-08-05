import express, { type Express, type Request, type Response, type NextFunction } from "express";

import { ListAssets, ListAllAssets, ReadAsset, WriteAsset } from "./assets.js";
import { CreateProject } from "./createProject.js";
import {
  ASSET_FOLDERS,
  type AssetFolder,
} from "./paths.js";
import {
  GetCurrentProject,
  GetDevServerStatus,
  ListLevelManifests,
  ListLevels,
  SetProjectEntryLevel,
  StartDevServer,
  StopDevServer,
} from "./projects.js";
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
  CancelPublish,
  GetPublishStatus,
  StartPublish,
  type PublishOptions,
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
    res.json(GetCurrentProject());
  });

  app.post("/api/project", AsyncHandler(async (req, res) =>
  {
    const body = req.body as {
      name?: string;
      title?: string;
      level?: string;
    };
    if (body.name === undefined || body.name.trim().length === 0)
    {
      res.status(400).json({ error: "Project name is required" });
      return;
    }

    const result = await CreateProject({
      name: body.name,
      title: body.title,
      level: body.level,
    });
    res.status(201).json(result);
  }));

  app.put("/api/project/entry-level", (req, res) =>
  {
    const body = req.body as { manifestUrl?: string };
    if (body.manifestUrl === undefined)
    {
      res.status(400).json({ error: "manifestUrl is required" });
      return;
    }
    const currentProject = GetCurrentProject();
    res.json(SetProjectEntryLevel(currentProject.name, body.manifestUrl));
  });

  app.get("/api/projects/:app/levels", (req, res) =>
  {
    res.json(ListLevels(req.params.app));
  });

  app.get("/api/projects/:app/manifests", (req, res) =>
  {
    res.json(ListLevelManifests(req.params.app));
  });

  app.get("/api/projects/:app/assets/:level", (req, res) =>
  {
    const folder = req.query.folder as string | undefined;
    if (folder)
    {
      res.json(ListAssets(req.params.app, req.params.level, ParseAssetFolder(folder)));
      return;
    }
    res.json(ListAllAssets(req.params.app, req.params.level));
  });

  app.get("/api/projects/:app/assets/:level/:folder/:file", (req, res) =>
  {
    try
    {
      const content = ReadAsset(
        req.params.app,
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

  app.put("/api/projects/:app/assets/:level/:folder/:file", (req, res) =>
  {
    try
    {
      const body = typeof req.body === "string" ? req.body : JSON.stringify(req.body, null, 2);
      const result = WriteAsset(
        req.params.app,
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

  app.get("/api/dev/:app", AsyncHandler(async (req, res) =>
  {
    res.json(await GetDevServerStatus(req.params.app));
  }));

  app.post("/api/dev/:app/start", AsyncHandler(async (req, res) =>
  {
    res.json(await StartDevServer(req.params.app));
  }));

  app.post("/api/dev/:app/stop", AsyncHandler(async (req, res) =>
  {
    res.json(await StopDevServer(req.params.app));
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

  app.get("/api/services/:app", AsyncHandler(async (req, res) =>
  {
    const [dev, mcp] = await Promise.all([
      GetDevServerStatus(req.params.app),
      GetMcpStatus(),
    ]);
    res.json({ dev, mcp });
  }));

  app.post("/api/services/:app/start-all", AsyncHandler(async (req, res) =>
  {
    const [dev, mcp] = await Promise.all([
      StartDevServer(req.params.app),
      StartMcp(),
    ]);
    res.json({ dev, mcp });
  }));

  app.post("/api/services/:app/stop-all", AsyncHandler(async (req, res) =>
  {
    const [dev, mcp] = await Promise.all([
      StopDevServer(req.params.app),
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

  app.get("/api/publish/:app", (req, res) =>
  {
    res.json(GetPublishStatus(req.params.app));
  });

  app.post("/api/publish/:app", AsyncHandler(async (req, res) =>
  {
    const body = req.body as Partial<PublishOptions>;
    const options: PublishOptions = {
      platform: body.platform ?? "web",
      title: body.title,
      version: body.version,
      destination: body.destination ?? "",
      levels: body.levels ?? [],
      startLevel: body.startLevel ?? "",
      encryptAssets: Boolean(body.encryptAssets),
      includeServer: Boolean(body.includeServer),
    };

    res.status(202).json(StartPublish(req.params.app, options));
  }));

  app.post("/api/publish/:app/cancel", (req, res) =>
  {
    try
    {
      res.json(CancelPublish(req.params.app));
    }
    catch (error)
    {
      res.status(409).json({ error: (error as Error).message });
    }
  });

  MountDocsStatic(app);

  app.use((error: Error, _req: Request, res: Response, _next: NextFunction) =>
  {
    res.status(500).json({ error: error.message });
  });

  return app;
}
