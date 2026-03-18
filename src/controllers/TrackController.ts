import { Request, Response } from "express";
import Controller from "./controller";
import TrackService from "@/services/TrackService";

export default class TrackController extends Controller {
    private trackService: TrackService = new TrackService();

    public async getTrack(req: Request, res: Response) {
        try {
            const userId = (req as any).tokens?.authorization?.payload?.id;
            if (!userId) return new this.ApiError("NO_AUTHENTICATION").send(res);

            const id = req.params.id;
            if (!id) return new this.ApiError("MISSING_BOOKING_ID").send(res);

            const info = await this.trackService.getTrackingInfo(id, userId);
            if (!info) return new this.ApiError("BOOKING_NOT_FOUND").send(res);

            return res.json(info);
        } catch (e) {
            this.logger.error(e);
            return new this.ApiError("UNKNOWN_ERROR").send(res);
        }
    }

    public async getRoute(req: Request, res: Response) {
        try {
            const userId = (req as any).tokens?.authorization?.payload?.id;
            if (!userId) return new this.ApiError("NO_AUTHENTICATION").send(res);

            const id = req.params.id;
            if (!id) return new this.ApiError("MISSING_BOOKING_ID").send(res);

            const route = await this.trackService.getTrackingRouteGeoJson(id, userId);
            if (!route) return new this.ApiError("BOOKING_NOT_FOUND").send(res);

            return res.json(route);
        } catch (e) {
            this.logger.error(e);
            return new this.ApiError("UNKNOWN_ERROR").send(res);
        }
    }
}
