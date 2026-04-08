import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { createServer } from "http";

const THEIRSTACK_API_KEY = process.env.THEIRSTACK_API_KEY;
const PORT = parseInt(process.env.PORT || "8080");

// Création du serveur MCP
const mcpServer = new Server(
  {
    name: "theirstack-technographics",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Handler pour lister les outils
mcpServer.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "get_company_technologies",
        description: "Récupère le stack technologique d'une entreprise (langages, cloud, outils, bases de données) à partir de son domaine, nom ou URL LinkedIn",
        inputSchema: {
          type: "object",
          properties: {
            company_domain: {
              type: "string",
              description: "Domaine de l'entreprise (ex: google.com, https://www.google.com, ou john@google.com)",
            },
            company_name: {
              type: "string",
              description: "Nom exact de l'entreprise (case-sensitive, ex: Google)",
            },
            company_linkedin_url: {
              type: "string",
              description: "URL LinkedIn de l'entreprise (ex: https://www.linkedin.com/company/google/)",
            },
            confidence_or: {
              type: "array",
              items: {
                type: "string",
                enum: ["low", "medium", "high"],
              },
              description: "Filtrer par niveau de confiance (ex: ['high', 'medium'])",
            },
            limit: {
              type: "number",
              description: "Nombre maximum de technologies à retourner (défaut: 50)",
            },
          },
        },
      },
    ],
  };
});

// Handler pour exécuter les outils
mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name !== "get_company_technologies") {
    throw new Error(`Outil inconnu: ${request.params.name}`);
  }

  if (!THEIRSTACK_API_KEY) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ error: "THEIRSTACK_API_KEY non configurée" }),
        },
      ],
    };
  }

  const args = request.params.arguments as any;

  // Construction du body pour TheirStack
  const body: Record<string, any> = {};
  if (args.company_domain) body.company_domain = args.company_domain;
  if (args.company_name) body.company_name = args.company_name;
  if (args.company_linkedin_url) body.company_linkedin_url = args.company_linkedin_url;
  if (args.confidence_or) body.confidence_or = args.confidence_or;
  if (args.limit) body.limit = args.limit;

  // Vérification qu'au moins un identifiant est fourni
  if (!body.company_domain && !body.company_name && !body.company_linkedin_url) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            error: "Au moins un identifiant est requis: company_domain, company_name ou company_linkedin_url",
          }),
        },
      ],
    };
  }

  try {
    console.log("📡 Appel TheirStack API:", JSON.stringify(body));

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
      console.error("❌ Erreur TheirStack:", response.status, error);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              error: `Erreur TheirStack (${response.status})`,
              details: error,
            }, null, 2),
          },
        ],
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
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: true,
            total: data.metadata?.total_results || technologies.length,
            technologies: technologies,
          }, null, 2),
        },
      ],
    };
  } catch (err: any) {
    console.error("❌ Erreur réseau:", err);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            error: "Erreur réseau lors de l'appel à TheirStack",
            details: err.message,
          }),
        },
      ],
    };
  }
});

// Serveur HTTP pour Cloud Run
const httpServer = createServer(async (req, res) => {
  // Health check
  if (req.url === "/health" || req.url === "/") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("OK");
    return;
  }

  // Endpoint MCP
  if (req.url === "/mcp" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });

    req.on("end", async () => {
      try {
        const jsonRpcRequest = JSON.parse(body);
        
        // Simuler l'appel au serveur MCP
        // Note: Ceci est une simplification, un vrai transport serait plus complexe
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ jsonrpc: "2.0", id: jsonRpcRequest.id, result: {} }));
      } catch (error) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid JSON-RPC request" }));
      }
    });
    return;
  }

  // 404 pour les autres routes
  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("Not Found");
});

httpServer.listen(PORT, () => {
  console.log("🚀 MCP TheirStack Server sur le port", PORT);
  console.log("🔑 THEIRSTACK_API_KEY:", THEIRSTACK_API_KEY ? "✅" : "❌");
});
