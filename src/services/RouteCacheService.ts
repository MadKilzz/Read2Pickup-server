import axios from "axios";
import Service from "./Service";
import Snowflake from "@/utils/SnowFlake";

type MapboxDirectionsResponse = {
  routes?: Array<{
    geometry?: unknown;
  }>;
};

function roundCoord(value: number, decimals = 4): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

export default class RouteCacheService extends Service {
  /**
   * Fetch a driving route from Mapbox and cache it in DB.
   * Cache key uses rounded coordinates to increase hit rate.
   */
  public async getOrCreateRouteGeoJson(params: {
    profile?: string;
    from: { lat: number; lng: number };
    to: { lat: number; lng: number };
    /** Recompute if cached route is older than this (ms). Default 30 minutes. */
    maxAgeMs?: number;
  }): Promise<unknown | null> {
    const profile = params.profile ?? "driving";
    const fromLat = roundCoord(params.from.lat);
    const fromLng = roundCoord(params.from.lng);
    const toLat = roundCoord(params.to.lat);
    const toLng = roundCoord(params.to.lng);
    const maxAgeMs = params.maxAgeMs ?? 30 * 60 * 1000;

    // This project uses a generated Prisma Client type. After adding `RouteCache`
    // to the schema you must run `prisma generate` for `routeCache` to exist on the type.
    // To keep TypeScript compiling before generation, we use a narrow structural type here.
    const prisma = this.prisma as unknown as {
      routeCache: {
        findUnique: (args: {
          where: {
            profile_fromLat_fromLng_toLat_toLng: {
              profile: string;
              fromLat: number;
              fromLng: number;
              toLat: number;
              toLng: number;
            };
          };
          select: { geojson: true; updatedAt: true };
        }) => Promise<{ geojson: unknown; updatedAt: Date } | null>;
        upsert: (args: {
          where: {
            profile_fromLat_fromLng_toLat_toLng: {
              profile: string;
              fromLat: number;
              fromLng: number;
              toLat: number;
              toLng: number;
            };
          };
          create: {
            id: string;
            profile: string;
            fromLat: number;
            fromLng: number;
            toLat: number;
            toLng: number;
            geojson: unknown;
          };
          update: { geojson: unknown };
        }) => Promise<unknown>;
      };
    };

    const existing = await prisma.routeCache.findUnique({
      where: { profile_fromLat_fromLng_toLat_toLng: { profile, fromLat, fromLng, toLat, toLng } },
      select: { geojson: true, updatedAt: true },
    });

    if (existing && Date.now() - existing.updatedAt.getTime() <= maxAgeMs) {
      return existing.geojson;
    }

    const token = (process.env.MAPBOX_SECRET_TOKEN || "").trim();
    if (!token) return null;

    const coords = `${fromLng},${fromLat};${toLng},${toLat}`;
    const url = `https://api.mapbox.com/directions/v5/mapbox/${profile}/${coords}`;

    try {
      const res = await axios.get<MapboxDirectionsResponse>(url, {
        params: { geometries: "geojson", overview: "full", access_token: token },
      });

      const geojson = res.data.routes?.[0]?.geometry ?? null;
      if (!geojson) return null;

      await prisma.routeCache.upsert({
        where: { profile_fromLat_fromLng_toLat_toLng: { profile, fromLat, fromLng, toLat, toLng } },
        create: { id: Snowflake.generate(), profile, fromLat, fromLng, toLat, toLng, geojson },
        update: { geojson },
      });

      return geojson;
    } catch (e){
      return null;
    }
  }
}

