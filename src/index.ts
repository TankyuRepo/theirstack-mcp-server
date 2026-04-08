import { createServer } from "http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

const THEIRSTACK_API_KEY = process.env.THEIRSTACK_API_KEY;
const DUST_SECRET_TOKEN = process.env.DUST_SECRET_TOKEN;
const PORT = parseInt(process.env.PORT || "8080");

const mcpServer = new McpServer({
  name: "theirstack-technographics",
  version: "1.0.0",
});

mcpServer.tool(
  "get_company_technologies",
  "Récupère le stack technologique d'une entreprise via TheirStack",
  {
    company_domain: z.string().optional(),
    company_name: z.string().optional(),
    company_linkedin_url: z.string().optional(),
  },
  async ({ company_domain, company_name, company_linkedin_url }) => {
    if (!THEIRSTACK_API_KEY) {
      return { content: [{ type: "text", text: "THEIRSTACK_API_KEY manquante" }] };
    }

    const body: any = {};
    if (company_domain) body.company_domain = company_domain;
    if (company_name) body.company_name = company_name;
    if (company_linkedin_url) body.company_linkedin_url = company_linkedin_url;

    try {
      const response = await fetch("https://api.theirstack.com/v1/companies/technologies", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${THEIRSTACK_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      const data = await response.json();
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    } catch (err: any) {
      return { content: [{ type: "text", text: `Erreur: ${err.message}` }] };
    }
  }
);

const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

mcpServer.connect(transport).then(() => {
  const server = createServer((req, res) => {
    if (req.url === "/health") {
      res.writeHead(200);
      res.end("OK");
      return;
    }

    if (req.url === "/mcp" && req.method === "POST") {
      let body = "";
      req.on("data", chunk => body += chunk);
      req.on("end", () => {
        transport.handleRequest(req, res, JSON.parse(body)).catch(() => {
          res.writeHead(500);
          res.end();
        });
      });
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  server.listen(PORT, () => console.log(`🚀 Port ${PORT}`));
});
