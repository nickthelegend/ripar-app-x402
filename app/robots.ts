import type { MetadataRoute } from "next";

// app.ripar.io is the workspace, not marketing. Keeping it out of the index
// stops it competing with ripar.io for brand queries and keeps dashboard URLs
// out of search results.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", disallow: "/" },
  };
}
