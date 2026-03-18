import { Prisma } from "@prisma/client";
import axios from "axios";
import Service from "./Service";
import config from "@/config";


export type GooglePlaceResult = {
    place_id: string;
    name: string;
    types: string[];
    geometry: { location: { lat: number; lng: number } };
    address_components: { long_name: string; types: string[] }[];
};

export type LocationConfidence = "HIGH" | "MEDIUM" | "LOW";


export default class LocationService extends Service {

    public isWithinServiceArea(
        lat?: number | null,
        lng?: number | null
    ): boolean {
        if (!lat || !lng) return false;

        const distance = this.calculateDistanceKm(
            config.service_area.lat,
            config.service_area.lng,
            lat,
            lng
        );

        return distance <= config.service_area.radiusKm;
    }

    public calculateDistanceKm(
        lat1: number,
        lng1: number,
        lat2: number,
        lng2: number
    ): number {
        const R = 6371; // km
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLng = (lng2 - lng1) * Math.PI / 180;

        const a =
            Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1 * Math.PI / 180) *
            Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLng / 2) ** 2;

        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    public calculateConfidence(
        query: string,
        options: {
            name?: string;
            lat?: number | null;
            lng?: number | null;
            street?: string | null;
            types?: string[];
        }
    ): LocationConfidence {

        const q = query.toLowerCase();
        const name = options.name?.toLowerCase() || "";

        const hasLatLng = !!options.lat && !!options.lng;
        const hasStreet = !!options.street;

        const nameMatches = name.includes(q) || q.includes(name);

        // Controleer of de locatie een sterke type is (airport, hotel, lodging, establishment)
        const strongType = options.types?.some(t =>
            ["airport", "hotel", "lodging", "establishment"].includes(t.toLowerCase())
        );
        
        // Als de locatie een sterke type is en we hebben een match met de naam of locatie
        if (hasLatLng && nameMatches && (hasStreet || strongType)) {
            return "HIGH";
        }

        // Als het een locatie met lat/lng is, maar geen sterke type of street match
        if (hasLatLng) {
            return "MEDIUM";
        }

        // Anders, laagste confidence
        return "LOW";
    }

    public mapGoogleTypesToCategories(types: string[]): string[] {
        const map: Record<string, string[]> = {
            hotel: ["HOTEL", "LODGING", "TRAVEL_AND_TRANSPORTATION", "place"],
            airport: ["AIRPORT", "TRAVEL_AND_TRANSPORTATION", "place"],
            restaurant: ["FOOD_AND_BEVERAGE", "RESTAURANT", "place"],
            bar: ["FOOD_AND_BEVERAGE", "BAR", "place"],
            park: ["AREAS_AND_BUILDINGS", "PARKING", "place"],
            // voeg hier andere types toe
        };
        return types.flatMap(t => map[t.toLowerCase()] || []);
    }

    /** Bepaalt tag voor weergave/icon: AIRPORT, HOTEL of eerste type. */
    public getTag(types: string[]): string | undefined {
        if (!types || types.length === 0) return undefined;
        const lower = types.map(t => t.toLowerCase());
        if (lower.includes("airport")) return "AIRPORT";
        if (lower.includes("lodging") || lower.includes("hotel")) return "HOTEL";
        return types[0].toUpperCase();
    }

    /** Converts a PlaceCache row to GooglePlaceResult so we can skip Place Details when already cached. */
    private cacheRowToGooglePlaceResult(row: { placeId: string; name: string; street: string | null; city: string | null; postal: string | null; country: string | null; lat: number | null; lng: number | null; categories: string | null; tag: string | null }): GooglePlaceResult {
        const types = row.categories ? (JSON.parse(row.categories) as string[]) : (row.tag ? [row.tag.toLowerCase()] : []);
        const ac: { long_name: string; types: string[] }[] = [];
        if (row.street) ac.push({ long_name: row.street, types: ["route"] });
        if (row.city) ac.push({ long_name: row.city, types: ["locality"] });
        if (row.postal) ac.push({ long_name: row.postal, types: ["postal_code"] });
        if (row.country) ac.push({ long_name: row.country, types: ["country"] });
        return {
            place_id: row.placeId,
            name: row.name,
            types,
            geometry: { location: { lat: row.lat ?? 0, lng: row.lng ?? 0 } },
            address_components: ac,
        };
    }

    public async callGooglePlacesAPI(
        query: string,
        localeCode: string = "nl-NL"
    ) {
        if (query.toLowerCase().includes("qbic hotel")) {
            return [
                {
                    place_id: "ChIJrShpvgQKxkcRmGVTfdQ0BfA",
                    name: "Qbic Hotel WTC Amsterdam",
                    types: ["hotel", "lodging", "point_of_interest", "establishment"],
                    geometry: {
                        location: {
                            lat: 52.3702157,
                            lng: 4.8951679
                        }
                    },
                    address_components: [
                        { long_name: "Qbic Hotel WTC Amsterdam", types: ["establishment"] },
                        { long_name: "Mathijs Vermeulenpad 1", types: ["route"] },
                        { long_name: "Amsterdam", types: ["locality"] },
                        { long_name: "1077 XV", types: ["postal_code"] },
                        { long_name: "Netherlands", types: ["country"] }
                    ]
                },
                {
                    place_id: "ChIJH-Bm3socdkgRc4N1ad2l5QU",
                    name: "Qbic Hotel London City",
                    types: ["hotel", "lodging", "point_of_interest", "establishment"],
                    geometry: { location: { lat: 51.5101, lng: -0.0827 } },
                    address_components: [
                        { long_name: "Qbic Hotel London City", types: ["establishment"] },
                        { long_name: "Adler Street", types: ["route"] },
                        { long_name: "London", types: ["locality"] },
                        { long_name: "E1 1AB", types: ["postal_code"] },
                        { long_name: "United Kingdom", types: ["country"] }
                    ]
                }
            ];
        }

        if (query.toLowerCase().includes("strawinskylaan 4117")) {
            return [
              {
                place_id: "ChIJrTLr-GyuEmsRBfy61i59si0",
                name: "Strawinskylaan 4117",
                types: ["street_address", "premise", "geocode"],
                geometry: {
                  location: {
                    lat: 52.3389012,
                    lng: 4.8732458
                  }
                },
                address_components: [
                  { long_name: "4117", types: ["street_number"] },
                  { long_name: "Strawinskylaan", types: ["route"] },
                  { long_name: "Amsterdam", types: ["locality"] },
                  { long_name: "Amsterdam", types: ["administrative_area_level_2"] },
                  { long_name: "North Holland", types: ["administrative_area_level_1"] },
                  { long_name: "1077 ZX", types: ["postal_code"] },
                  { long_name: "Netherlands", types: ["country"] }
                ]
              }
            ];
          }

        if (query.toLowerCase().includes("schiphol")) {
            return [
                {
                    place_id: "ChIJLRb94DThxUcRiPHO8YMV1cc",
                    name: "Schiphol Amsterdam Airport (AMS)",
                    types: [
                        "airport",
                        "point_of_interest",
                        "establishment"
                    ],
                    geometry: {
                        location: {
                            lat: 52.3105,
                            lng: 4.7683
                        }
                    },
                    address_components: [
                        { long_name: "Schiphol Amsterdam Airport", types: ["establishment"] },
                        { long_name: "Evert van de Beekstraat", types: ["route"] },
                        { long_name: "Schiphol", types: ["locality"] },
                        { long_name: "1118 CP", types: ["postal_code"] },
                        { long_name: "Netherlands", types: ["country"] }
                    ]
                },
                {
                    place_id: "ChIJHU4RWyjhxUcR27TNSXntfQs",
                    name: "Schiphol",
                    types: [
                        "locality",
                        "political"
                    ],
                    geometry: {
                        location: {
                            lat: 52.3086,
                            lng: 4.7639
                        }
                    },
                    address_components: [
                        { long_name: "Schiphol", types: ["locality"] },
                        { long_name: "Netherlands", types: ["country"] }
                    ]
                },
                {
                    place_id: "ChIJQ6bGP9fgxUcRoLhx0pmfugw",
                    name: "Schiphol Plaza",
                    types: [
                        "shopping_mall",
                        "restaurant",
                        "point_of_interest",
                        "establishment"
                    ],
                    geometry: {
                        location: {
                            lat: 52.3101,
                            lng: 4.7689
                        }
                    },
                    address_components: [
                        { long_name: "Schiphol Plaza", types: ["establishment"] },
                        { long_name: "Vertrekpassage", types: ["route"] },
                        { long_name: "Schiphol", types: ["locality"] },
                        { long_name: "Netherlands", types: ["country"] }
                    ]
                },
                {
                    place_id: "ChIJ0TgJSijhxUcRBCrUNp5jVDs",
                    name: "Schiphol Airport Train Station",
                    types: [
                        "train_station",
                        "transit_station",
                        "point_of_interest",
                        "establishment"
                    ],
                    geometry: {
                        location: {
                            lat: 52.3094,
                            lng: 4.7619
                        }
                    },
                    address_components: [
                        { long_name: "Schiphol Airport", types: ["establishment"] },
                        { long_name: "Schiphol", types: ["locality"] },
                        { long_name: "Netherlands", types: ["country"] }
                    ]
                },
                {
                    place_id: "ChIJt4PDYsngxUcRJ6eaFxk3hzg",
                    name: "Schiphol-Rijk",
                    types: [
                        "locality",
                        "political"
                    ],
                    geometry: {
                        location: {
                            lat: 52.2792,
                            lng: 4.7347
                        }
                    },
                    address_components: [
                        { long_name: "Schiphol-Rijk", types: ["locality"] },
                        { long_name: "Netherlands", types: ["country"] }
                    ]
                }
            ];
        }

        // Geen hardcoded match: echte Google API – Uber-style: Autocomplete + alleen Details voor plekken die nog niet in cache zitten
        const apiKey = process.env.GOOGLE_PLACES_API_KEY;
        if (!apiKey) return [];

        try {
            const autocompleteUrl = "https://maps.googleapis.com/maps/api/place/autocomplete/json";
            const lat = config.service_area?.lat;
            const lng = config.service_area?.lng;
            const hasLocation = typeof lat === "number" && !Number.isNaN(lat) && typeof lng === "number" && !Number.isNaN(lng);
            const autocompleteParams: Record<string, string | number | boolean> = {
                input: query,
                language: localeCode.replace("-", "_"),
                key: apiKey,
                components: "country:nl",
            };
            if (hasLocation) {
                autocompleteParams.location = `${lat},${lng}`;
            }
            const autocompleteRes = await axios.get(autocompleteUrl, {
                params: autocompleteParams,
            });
            const predictions = autocompleteRes.data?.predictions || [];
            const placeIds = predictions.slice(0, 5).map((p: { place_id: string }) => p.place_id).filter(Boolean);
            if (placeIds.length === 0) return [];

            // Eerst cache raadplegen per place_id – dan alleen voor misses Place Details aanroepen
            const cachedList = await Promise.all(
                placeIds.map((placeId: string) => this.find({ where: { placeId } }))
            );

            const detailsUrl = "https://maps.googleapis.com/maps/api/place/details/json";
            const fields = "place_id,name,types,geometry,address_components";
            const toFetchIds = placeIds.filter((_: string, i: number) => !cachedList[i]);

            const fetched = await Promise.all(
                toFetchIds.map(async (placeId: string) => {
                    const res = await axios.get(detailsUrl, {
                        params: { place_id: placeId, fields, key: apiKey },
                    });
                    const r = res.data?.result;
                    if (!r || !r.geometry?.location) return null;
                    return {
                        place_id: r.place_id,
                        name: r.name || "",
                        types: r.types || [],
                        geometry: { location: r.geometry.location },
                        address_components: (r.address_components || []).map((ac: { long_name: string; types: string[] }) => ({
                            long_name: ac.long_name,
                            types: ac.types || [],
                        })),
                    } as GooglePlaceResult;
                })
            );

            let fetchIdx = 0;
            const results: GooglePlaceResult[] = [];
            for (let i = 0; i < placeIds.length; i++) {
                if (cachedList[i]) {
                    results.push(this.cacheRowToGooglePlaceResult(cachedList[i]));
                } else {
                    const place = fetched[fetchIdx++];
                    if (place) results.push(place);
                }
            }
            return results;
        } catch {
            return [];
        }
    }

    public async find(options: Prisma.PlaceCacheFindFirstArgs) {
        try {
            return await this.prisma.placeCache.findFirst({ ...options });
        } catch (e) {
            throw e;
        }
    }

    public async findMany(options: Prisma.PlaceCacheFindManyArgs) {
        try {
            return await this.prisma.placeCache.findMany({ ...options });
        } catch (e) {
            throw e;
        }
    }

    public async upsert(options: Prisma.PlaceCacheUpsertArgs) {
        try {
            return await this.prisma.placeCache.upsert({ ...options });
        } catch (e) {
            throw e;
        }
    }
}