import { expect, test } from "@playwright/test";
import { writeJsonArtifact } from "../helpers/artifacts";
import { openClipboardApp } from "../helpers/clipboardApp";
import { E2E_SERVER_URLS } from "../helpers/e2eConfig";

/**
 * Guard: a link PrivyDrop puts into a chat app is distributed as a preview
 * card, and without og:image every one of those cards renders as bare text.
 * Next.js replaces top-level metadata fields instead of deep-merging them, so
 * a newly added page silently loses any inherited image. This test is what
 * makes that visible instead of shipping it.
 */
const ROUTES = [
  "/en",
  "/zh",
  "/en/features",
  "/en/faq",
  "/en/about",
  "/en/blog",
  "/en/blog/cached-id-reconnect",
];

interface RouteMeta {
  ogImage: string | null;
  twitterCard: string | null;
}

test("every indexable route ships a social preview image", async ({ page }, testInfo) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });

  const results: Record<string, RouteMeta> = {};
  await openClipboardApp(page);

  for (const route of ROUTES) {
    await page.goto(E2E_SERVER_URLS.frontendUrl + route, {
      waitUntil: "domcontentloaded",
    });

    const ogImage = await page
      .locator('meta[property="og:image"]')
      .getAttribute("content")
      .catch(() => null);
    const twitterCard = await page
      .locator('meta[name="twitter:card"]')
      .getAttribute("content")
      .catch(() => null);

    results[route] = { ogImage, twitterCard };
    expect(ogImage, route + " is missing og:image").toBeTruthy();
    expect(ogImage).toMatch(/^https:\/\/www\.privydrop\.app\//);
    expect(twitterCard, route + " is missing twitter:card").toBe(
      "summary_large_image"
    );
  }

  // The referenced asset must actually be served by this deployment, not 404.
  // Resolve the path against the server under test so the check stays
  // hermetic instead of depending on whatever is live in production.
  const imageUrl = results["/en"].ogImage as string;
  const imagePath = new URL(imageUrl).pathname;
  const imageResponse = await page.request.get(
    E2E_SERVER_URLS.frontendUrl + imagePath
  );
  expect(imageResponse.status(), imagePath + " should be served").toBe(200);
  expect(imageResponse.headers()["content-type"]).toContain("image");

  expect(consoleErrors).toEqual([]);
  await writeJsonArtifact(testInfo, "result.json", { results, imageUrl });
});
