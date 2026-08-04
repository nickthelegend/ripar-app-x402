// The commands and config a handler needs on each host. Real CLI verbs and real
// file schemas — a deploy panel that prints something close-but-wrong costs more
// time than one that prints nothing.

export type DeployTargetId = "railway" | "render" | "fly" | "heroku" | "docker";

/**
 * Everything a deploy plan needs from an endpoint, and nothing else — so the
 * panel can be handed an endpoint read from a live agent manifest without a
 * cast. `price` is nullable because a manifest states it as a display string
 * ("$0.01") and not every one of those parses to a number.
 */
export type DeployEndpoint = {
  name: string;
  /** The route the handler serves, without a leading slash: "api/summarize". */
  slug: string;
  /** USDC per request, or null when the manifest's price did not parse. */
  price: number | null;
};

export type DeployTarget = {
  id: DeployTargetId;
  name: string;
  /** What picking this host actually gets you, in one line. */
  blurb: string;
  /** Brand colour, used for the selected ring so the picker reads at a glance. */
  colour: string;
  docs: string;
};

export const DEPLOY_TARGETS: DeployTarget[] = [
  { id: "railway", name: "Railway", blurb: "Nixpacks build straight from the CLI.", colour: "#0B0D0E", docs: "https://docs.railway.com/guides/cli" },
  { id: "render", name: "Render", blurb: "Blueprint checked into the repo.", colour: "#46E3B7", docs: "https://render.com/docs/blueprint-spec" },
  { id: "fly", name: "Fly.io", blurb: "Machines close to the callers.", colour: "#7B3FE4", docs: "https://fly.io/docs/reference/configuration/" },
  { id: "heroku", name: "Heroku", blurb: "Git push, Procfile, one dyno.", colour: "#430098", docs: "https://devcenter.heroku.com/articles/procfile" },
  { id: "docker", name: "Docker", blurb: "An image you can run anywhere.", colour: "#2496ED", docs: "https://docs.docker.com/reference/dockerfile/" },
];

export type DeployBlock = {
  title: string;
  /** Present when the block is a file rather than something you type. */
  filename?: string;
  body: string;
};

/** Slugs carry a slash ("algo-usd/spot"); host app names cannot. */
const appNameFor = (e: Pick<DeployEndpoint, "slug">) =>
  `ripar-${e.slug.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase()}`;

export function deployPlan(
  target: DeployTargetId,
  endpoint: DeployEndpoint,
  payout: string
): DeployBlock[] {
  const app = appNameFor(endpoint);
  // A price we could not read stays an obvious blank. A command carrying an
  // invented figure is worse than one the operator has to finish by hand.
  const price = endpoint.price == null ? "<price-in-usdc>" : endpoint.price.toFixed(3);
  const { slug } = endpoint;

  switch (target) {
    case "railway":
      return [
        {
          title: "Deploy",
          body: [
            "npm i -g @railway/cli",
            "railway login",
            `railway init --name ${app}`,
            "railway variables \\",
            `  --set RIPAR_ENDPOINT=${slug} \\`,
            `  --set RIPAR_PRICE_USDC=${price} \\`,
            `  --set RIPAR_PAYOUT=${payout}`,
            "railway up",
          ].join("\n"),
        },
        {
          title: "Build config",
          filename: "railway.json",
          body: `{
  "$schema": "https://railway.com/railway.schema.json",
  "build": { "builder": "NIXPACKS" },
  "deploy": {
    "startCommand": "node server.js",
    "healthcheckPath": "/health",
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}`,
        },
      ];

    case "render":
      return [
        {
          title: "Blueprint",
          filename: "render.yaml",
          body: `services:
  - type: web
    name: ${app}
    runtime: node
    plan: starter
    buildCommand: npm ci
    startCommand: node server.js
    healthCheckPath: /health
    envVars:
      - key: RIPAR_ENDPOINT
        value: ${slug}
      - key: RIPAR_PRICE_USDC
        value: "${price}"
      # Payout address is a secret: set it in the dashboard, not the repo.
      - key: RIPAR_PAYOUT
        sync: false`,
        },
        {
          title: "Deploy",
          body: [
            `git add render.yaml && git commit -m "Serve ${slug} on Render"`,
            "git push",
            "",
            "# Then in Render: New → Blueprint → pick this repo → Apply.",
            "# Every later push to the tracked branch redeploys on its own.",
          ].join("\n"),
        },
      ];

    case "fly":
      return [
        {
          title: "Deploy",
          body: [
            "curl -L https://fly.io/install.sh | sh",
            "fly auth login",
            `fly launch --no-deploy --name ${app} --region iad`,
            `fly secrets set RIPAR_PAYOUT=${payout}`,
            "fly deploy",
          ].join("\n"),
        },
        {
          title: "App config",
          filename: "fly.toml",
          body: `app = "${app}"
primary_region = "iad"

[build]

[env]
  RIPAR_ENDPOINT = "${slug}"
  RIPAR_PRICE_USDC = "${price}"
  PORT = "8080"

[http_service]
  internal_port = 8080
  force_https = true
  auto_stop_machines = "suspend"
  auto_start_machines = true
  min_machines_running = 1

  [[http_service.checks]]
    grace_period = "10s"
    interval = "30s"
    method = "GET"
    path = "/health"
    timeout = "5s"`,
        },
      ];

    case "heroku":
      return [
        {
          title: "Deploy",
          body: [
            `heroku create ${app}`,
            `heroku config:set RIPAR_ENDPOINT=${slug} RIPAR_PRICE_USDC=${price} \\`,
            `  RIPAR_PAYOUT=${payout}`,
            "git push heroku main",
            "heroku ps:scale web=1",
          ].join("\n"),
        },
        {
          title: "Process type",
          filename: "Procfile",
          body: "web: node server.js",
        },
      ];

    case "docker":
      return [
        {
          title: "Image",
          filename: "Dockerfile",
          body: `FROM node:22-alpine
WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

ENV RIPAR_ENDPOINT=${slug} \\
    RIPAR_PRICE_USDC=${price} \\
    PORT=8080

EXPOSE 8080
USER node
CMD ["node", "server.js"]`,
        },
        {
          title: "Build and run",
          body: [
            `docker build -t ${app} .`,
            "docker run --rm -p 8080:8080 \\",
            `  -e RIPAR_PAYOUT=${payout} \\`,
            `  ${app}`,
          ].join("\n"),
        },
      ];
  }
}
