import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const FEED = process.env.LAUNCH_FEED_URL || "";
const TOKEN = process.env.LAUNCH_FEED_TOKEN || "";

async function getFeed(endpoint) {
  if (!FEED) {
    throw new Error("LAUNCH_FEED_URL is not configured");
  }

  const base = FEED.replace(/\/$/, "");

  const r = await fetch(
    `${base}/${endpoint}?sinceSeconds=1200`,
    {
      cache: "no-store",
      headers: TOKEN
        ? { Authorization: `Bearer ${TOKEN}` }
        : {},
    }
  );

  if (!r.ok) {
    throw new Error(`Launch feed returned ${r.status}`);
  }

  return r.json();
}

export async function GET(request) {
  try {
    const url = new URL(request.url);

    const mode =
      url.searchParams.get("mode") === "all"
        ? "launches"
        : "qualified";

    const data = await getFeed(mode);

    return NextResponse.json(
      {
        generatedAt:
          data.generatedAt ||
          new Date().toISOString(),
        provider:
          data.provider || null,
        version:
          data.version || null,
        launches:
          data.launches || [],
      },
      {
        headers: {
          "Cache-Control":
            "no-store, max-age=0",
        },
      }
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error?.message ||
          "Failed to load launches",
        launches: [],
      },
      {
        status: 500,
      }
    );
  }
}
