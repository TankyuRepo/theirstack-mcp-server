import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { createServer, IncomingMessage, ServerResponse } from "http";

const DUST_SECRET_TOKEN = process.env.DUST_SECRET_TOKEN;
const THEIRSTACK_API_KEY = process.env.THEIRSTACK_API_KEY;
const PORT = parseInt(process.env.PORT || "8080");

function checkAuth(req: IncomingMessage): boolean {
  if (!DUST_SECRET_TOKEN) {
    console.warn("⚠️  DUST_SECRET_TOKEN non configuré");
    return true;
  }
  const auth = req.headers["authorization"];
  return auth === `Bearer ${DUST_SECRET_TOKEN}`;
}

const mcpServer = new McpServer({
  name: "theirstack-technographics",
  version: "1.0.0",
  description: "Récupère les technologies utilisées par une entreprise via TheirStack",
});

mcpServer.tool(
  "get_company_technologies",
  "Retourne le stack technologique d'une entreprise à partir de son domaine, nom ou URL LinkedIn.",
  {
    company_domain: z.string().optional().describe("Domaine de l'entreprise (ex: google.com)"),
    company_name: z.string().optional().describe("Nom exact de l'entreprise (ex: Google)"),
    company_linkedin_url: z.string().optional().describe("URL LinkedIn de l'entreprise"),
    confidence_or: z.array(z.enum(["low", "medium", "high"])).optional().describe("Filtrer par niveau de confiance"),
    limit: z.number().optional().describe("Nombre maximum de technologies (défaut: 50)"),
  },
  async (params) => {
    if (!THEIRSTACK_API_KEY) {
      return { content: [{ type: "text", text: JSON.stringify({ error: "THEIRSTACK_API_KEY manquante" }) }] };
    }

    const body: Record<string, unknown> = {};
    if (params.company_domain) body.company_domain = params.company_domain;
    if (params.company_name) body.company_name = params.company_name;
    if (params.company_linkedin_url) body.company_linkedin_url = params.company_linkedin_url;
    if (params.confidence_or?.length) body.confidence_or = params.confidence_or;
    if (params.limit) body.limit = params.limit;

    if (!params.company_domain && !params.company_name && !params.company_linkedin_url) {
      return { content: [{ type: "text", text: JSON.stringify({ error: "Au moins un identifiant requis" }) }] };
    }

    try {
      const response = await fetch("https://api.theirstack.com/v1/companies/technologies", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${THEIRSTACK_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const error = await response.json();
        return { content: [{ type: "text", text: JSON.stringify({ error: `TheirStack error (${response.status})`, details: error }) }] };
      }

      const data = await response.json();
      const technologies = data.data.map((item: any) => ({
        name: item.technology.name,
        category: item.technology.category,
        parent_category: item.technology.parent_category,
        confidence: item.confidence,
        jobs_count: item.jobs,
        first_seen: item.first_date_found,
        last_seen: item.last_date_found,
      }));

      return { content: [{ type: "text", text: JSON.stringify({ success: true, total: data.metadata?.total_results || technologies.length, technologies }, null, 2) }] };
    } catch (err: any) {
      return { content: [{ type: "text", text: JSON.stringify({ error: "Erreur réseau", details: err.message }) }] };
    }
  }
);

const httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  if (req.url === "/health" || req.url === "/") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("OK");
    return;
  }

  if (!checkAuth(req)) {
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Unauthorized" }));
    return;
  }

  try {
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    await mcpServer.connect(transport);
    await transport.handleRequest(req, res);
  } catch (error: any) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Internal Server Error" }));
  }
});

httpServer.listen(PORT, () => {
  console.log(`🚀 MCP TheirStack Server sur le port ${PORT}`);
  console.log(`🔑 THEIRSTACK_API_KEY: ${THEIRSTACK_API_KEY ? "✅" : "❌"}`);
  console.log(`🔐 DUST_SECRET_TOKEN: ${DUST_SECRET_TOKEN ? "✅" : "⚠️"}`);
});
