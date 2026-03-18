import { Request, Response } from "express";
import Controller from "./controller";
import { ValidatedRequest } from "@/types/ValidatedRequest";
import { BookingDraftData, LoginData, OtpData, PatchDraftData, RegisterData, RegisterValidationSchema } from "@/validation/auth";

import UserService from "@/services/UserService";
import OtpService from "@/services/OtpService";
import AuthService from "@/services/AuthService";
import BookService from "@/services/BookService";
import { DispatchStatus, DraftStatus, QueueStatus } from "@prisma/client";
import DriverService from "@/services/DriverService";
import LocationService, { GooglePlaceResult, LocationConfidence } from "@/services/LocationService";
import { LocationSearchData } from "@/validation/location";
import config from "@/config";

const CACHE_TTL_DAYS = 90;

type LocationResult = {
    addressLine1: string;
    addressLine2: string;
    categories: string[];
    confidence: "HIGH" | "MEDIUM" | "LOW";
    id: string;
    provider: string;
    savedPlacesMeta: any | null;
    source: "SEARCH" | "CACHE";
    tag?: string;
    type: "LOCATION";
    lat: number;
    lng: number;
    country?: string | null;
};

const NETHERLANDS_NAMES = ["Netherlands", "Nederland", "The Netherlands"];
function isNetherlands(country: string | null | undefined): boolean {
    if (!country) return false;
    return NETHERLANDS_NAMES.some(n => country.toLowerCase().includes(n.toLowerCase()));
}

export default class LocationController extends Controller {
    private authService: AuthService = new AuthService();
    private userService: UserService = new UserService();
    private otpService: OtpService = new OtpService();
    private bookService: BookService = new BookService();
    private driverService: DriverService = new DriverService();
    private locationService: LocationService = new LocationService();

    public async getLocations(
        req: Request & Partial<ValidatedRequest<LocationSearchData>>,
        res: Response
    ) {
        if (req.validationErrors) return new this.ApiError("INCORRECT_BODY").send(res);

        const data: LocationSearchData = req.validatedQuery!;
        const query = data.q;
        const intent = data.intent || "pickup";

        const now = new Date();
        const ttlDate = new Date(now.getTime() - CACHE_TTL_DAYS * 24 * 60 * 60 * 1000);

        // Sorteerfunctie, buiten de if zodat we hem overal kunnen gebruiken
        const confidenceScore: Record<LocationConfidence, number> = { HIGH: 3, MEDIUM: 2, LOW: 1 };
        const sortFn = (a: LocationResult, b: LocationResult) => {
            const cDiff = confidenceScore[b.confidence] - confidenceScore[a.confidence];
            if (cDiff !== 0) return cDiff;

            const distA = this.locationService.calculateDistanceKm(
                config.service_area.lat,
                config.service_area.lng,
                a.lat,
                a.lng
            );
            const distB = this.locationService.calculateDistanceKm(
                config.service_area.lat,
                config.service_area.lng,
                b.lat,
                b.lng
            );
            return distA - distB;
        };

        // Zoek eerst in cache
        const cachedResults = await this.locationService.findMany({
            where: {
                createdAt: { gte: ttlDate },
                OR: [
                    { name: { contains: query, mode: "insensitive" } },
                    { street: { contains: query, mode: "insensitive" } },
                    { city: { contains: query, mode: "insensitive" } }
                ]
            },
            take: 5
        });

        if (cachedResults.length > 0) {
            const response: LocationResult[] = cachedResults.map(c => {
                const categories = c.categories ? JSON.parse(c.categories) : [];
                return {
                    addressLine1: c.name,
                    addressLine2: [c.street, c.city, c.postal, c.country].filter(Boolean).join(", "),
                    categories,
                    confidence: this.locationService.calculateConfidence(query, {
                        name: c.name,
                        lat: c.lat,
                        lng: c.lng,
                        street: c.street,
                        types: categories
                    }),
                    id: c.placeId,
                    provider: "cache",
                    savedPlacesMeta: null,
                    source: "CACHE",
                    tag: c.tag || undefined,
                    type: "LOCATION",
                    lat: c.lat || 0,
                    lng: c.lng || 0,
                    country: c.country ?? undefined
                };
            });

            const inServiceArea = response.filter(r => this.locationService.isWithinServiceArea(r.lat, r.lng));
            const outServiceArea = response.filter(r => !this.locationService.isWithinServiceArea(r.lat, r.lng));

            inServiceArea.sort(sortFn);
            outServiceArea.sort((a, b) => (isNetherlands(b.country) ? 1 : 0) - (isNetherlands(a.country) ? 1 : 0) || sortFn(a, b));

            return res.json({ success: true, data: [...inServiceArea, ...outServiceArea] });
        }

        // Geen cache? Google Places API
        const googleResults: GooglePlaceResult[] = await this.locationService.callGooglePlacesAPI(query, "nl-NL");
        if (!googleResults || googleResults.length === 0) return res.json({ success: true, data: [] });

        const mappedResults: LocationResult[] = await Promise.all(
            googleResults.map(async r => {
                const street = r.address_components.find(c => c.types.includes("route"))?.long_name || null;
                const city = r.address_components.find(c => c.types.includes("locality"))?.long_name || null;
                const postal = r.address_components.find(c => c.types.includes("postal_code"))?.long_name || null;
                const country = r.address_components.find(c => c.types.includes("country"))?.long_name || null;

                const categories = this.locationService.mapGoogleTypesToCategories(r.types);
                const tag = this.locationService.getTag(r.types);

                const lat = r.geometry?.location.lat || 0;
                const lng = r.geometry?.location.lng || 0;

                const confidence = this.locationService.calculateConfidence(query, { name: r.name, lat, lng, street, types: r.types });

                await this.locationService.upsert({
                    where: { placeId: r.place_id },
                    update: {},
                    create: {
                        placeId: r.place_id,
                        name: r.name,
                        street,
                        city,
                        postal,
                        country,
                        lat,
                        lng,
                        categories: JSON.stringify(categories),
                        tag
                    }
                });

                return {
                    addressLine1: r.name,
                    addressLine2: [street, city, postal, country].filter(Boolean).join(", "),
                    categories,
                    confidence,
                    id: r.place_id,
                    provider: "google_places",
                    savedPlacesMeta: null,
                    source: "SEARCH",
                    tag,
                    type: "LOCATION",
                    lat,
                    lng,
                    country: country ?? undefined
                };
            })
        );

        const inServiceArea = mappedResults.filter(r => this.locationService.isWithinServiceArea(r.lat, r.lng));
        const outServiceArea = mappedResults.filter(r => !this.locationService.isWithinServiceArea(r.lat, r.lng));

        inServiceArea.sort(sortFn);
        outServiceArea.sort((a, b) => (isNetherlands(b.country) ? 1 : 0) - (isNetherlands(a.country) ? 1 : 0) || sortFn(a, b));

        return res.json({ success: true, data: [...inServiceArea, ...outServiceArea] });
    }


}