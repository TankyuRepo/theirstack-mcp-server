import express, { Request, Response } from "express";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

const THEIRSTACK_API_KEY = process.env.THEIRSTACK_API_KEY;
const DUST_SECRET_TOKEN = process.env.DUST_SECRET_TOKEN;
const PORT = parseInt(process.env.PORT || "8080");

// Créer le serveur MCP
const mcpServer = new McpServer({
  name: "theirstack-technographics",
  version: "1.0.0",
});

// Définir l'outil
mcpServer.tool(
  "get_company_technologies",
  "Récupère le stack technologique d'une entreprise via TheirStack",
  {
    company_domain: z.string().optional().describe("Domaine de l'entreprise (ex: google.com)"),
    company_name: z.string().optional().describe("Nom de l'entreprise (ex: Google)"),
    company_linkedin_url: z.string().optional().describe("URL LinkedIn de l'entreprise"),
    confidence_or: z.array(z.enum(["low", "medium", "high"])).optional().describe("Niveaux de confiance"),
    limit: z.number().optional().describe("Nombre max de résultats (défaut: 50)"),
  },
  async ({ company_domain, company_name, company_linkedin_url, confidence_or, limit }) => {
    if (!THEIRSTACK_API_KEY) {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: "THEIRSTACK_API_KEY manquante" }) }],
      };
    }

    const body: Record<string, any> = {};
    if (company_domain) body.company_domain = company_domain;
    if (company_name) body.company_name = company_name;
    if (company_linkedin_url) body.company_linkedin_url = company_linkedin_url;
    if (confidence_or) body.confidence_or = confidence_or;
    if (limit) body.limit = limit;

    if (!body.company_domain && !body.company_name && !body.company_linkedin_url) {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: "Au moins un identifiant requis" }) }],
      };
    }

    try {
      console.log("📡 Appel TheirStack:", JSON.stringify(body));

      const response = await fetch("https://api.theirstack.com/v1/companies/technologies", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${THEIRSTACK_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const error = await response.json();
        return {
          content: [{ type: "text", text: JSON.stringify({ error: `TheirStack error (${response.status})`, details: error }, null, 2) }],
        };
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

      console.log(`✅ ${technologies.length} technologies trouvées`);

      return {
        content: [{ type: "text", text: JSON.stringify({ success: true, total: data.metadata?.total_results || technologies.length, technologies }, null, 2) }],
      };
    } catch (err: any) {
      console.error("❌ Erreur:", err);
      return {
        content: [{ type: "text", text: JSON.stringify({ error: "Erreur réseau", details: err.message }) }],
      };
    }
  }
);

// Express app
const app = express();
app.use(express.json());

// Transport MCP
const transport = new StreamableHTTPServerTransport({
  sessionIdGenerator: undefined, // Stateless
});

// Connecter le serveur MCP
const setupServer = async () => {
  await mcpServer.connect(transport);
};

// Routes
app.post("/mcp", async (req: Request, res: Response) => {
  console.log("📥 Requête MCP POST");
  
  // Vérifier auth
  if (DUST_SECRET_TOKEN) {
    const auth = req.headers["authorization"];
    if (auth !== `Bearer ${DUST_SECRET_TOKEN}`) {
      return res.status(401).json({ jsonrpc: "2.0", error: { code: -32000, message: "Unauthorized" }, id: null });
    }
  }

  try {
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error("❌ Erreur MCP:", error);
    if (!res.headersSent) {
      res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: "Internal error" }, id: null });
    }
  }
});

app.get("/mcp", async (req: Request, res: Response) => {
  res.status(405).json({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed" }, id: null });
});

app.get("/health", (req: Request, res: Response) => {
  res.send("OK");
});

// Démarrer
setupServer()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`🚀 MCP Server sur le port ${PORT}`);
      console.log(`🔑 THEIRSTACK_API_KEY: ${THEIRSTACK_API_KEY ? "✅" : "❌"}`);
      console.log(`🔐 DUST_SECRET_TOKEN: ${DUST_SECRET_TOKEN ? "✅" : "⚠️"}`);
    });
  })
  .catch((error) => {
    console.error("❌ Erreur démarrage:", error);
    process.exit(1);
  });
