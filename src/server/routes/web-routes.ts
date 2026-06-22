import type { FastifyInstance } from "fastify";

interface BuiltWebAsset {
  body: Buffer;
  contentType: string;
}

interface LocalWebRoutesOptions {
  profile: string;
  readBuiltWebIndex: () => Promise<string | undefined>;
  readBuiltWebAsset: (assetPath: string) => Promise<BuiltWebAsset | undefined>;
  readBuiltWebStaticAsset: (
    assetPath: string,
  ) => Promise<BuiltWebAsset | undefined>;
  renderLocalApiBootstrap: (profile: string) => string;
}

export function registerLocalWebRoutes(
  app: FastifyInstance,
  options: LocalWebRoutesOptions,
): void {
  app.get("/", async (_request, reply): Promise<string> => {
    const builtWebIndex = await options.readBuiltWebIndex();

    if (builtWebIndex) {
      reply.type("text/html; charset=utf-8");

      return builtWebIndex;
    }

    reply.type("text/html; charset=utf-8");

    return options.renderLocalApiBootstrap(options.profile);
  });

  app.get("/assets/*", async (request, reply): Promise<Buffer | void> => {
    const params = request.params as { "*": string };
    const asset = await options.readBuiltWebAsset(params["*"]);

    if (!asset) {
      reply.code(404).send();
      return;
    }

    reply.type(asset.contentType);

    return asset.body;
  });

  app.get("/favicon.svg", async (_request, reply): Promise<Buffer | void> => {
    const asset = await options.readBuiltWebStaticAsset("favicon.svg");

    if (!asset) {
      reply.code(404).send();
      return;
    }

    reply.type(asset.contentType);

    return asset.body;
  });

  app.get("/favicon.ico", async (_request, reply): Promise<Buffer | void> => {
    const asset = await options.readBuiltWebStaticAsset("favicon.ico");

    if (asset) {
      reply.type(asset.contentType);

      return asset.body;
    }

    reply.code(204).send();
  });
}
