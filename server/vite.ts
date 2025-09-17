import express, { type Express } from "express";
import fs from "fs";
import path from "path";
// import vite dynamically inside setupVite after setting webcrypto
import { type Server } from "http";
import { nanoid } from "nanoid";
import { fileURLToPath } from "url";
import { webcrypto as nodeWebCrypto, randomFillSync } from "crypto";

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

export async function setupVite(app: Express, server: Server) {
  // Ensure Web Crypto API is available for Vite and dependencies
  if (!(globalThis as any).crypto || !(globalThis as any).crypto.getRandomValues) {
    (globalThis as any).crypto = nodeWebCrypto as any;
    if (!(globalThis as any).crypto.getRandomValues) {
      (globalThis as any).crypto.getRandomValues = function<T extends ArrayBufferView>(arr: T): T {
        randomFillSync(arr as unknown as NodeJS.ArrayBufferView);
        return arr;
      } as any;
    }
  }

  // Import vite config lazily after setting crypto
  const viteConfig = (await import("../vite.config")).default;

  // Import Vite API dynamically AFTER polyfilling crypto
  const { createServer: createViteServer, createLogger } = await import("vite");
  const viteLogger = createLogger();

  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    server: serverOptions,
    appType: "custom",
  });

  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(
        __dirname,
        "..",
        "client",
        "index.html",
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`,
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

export function serveStatic(app: Express) {
  const distPath = path.resolve(__dirname, "public");

  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  app.use(express.static(distPath));

  // fall through to index.html if the file doesn't exist
  app.use("*", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
