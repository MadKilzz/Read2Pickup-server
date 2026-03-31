import Route from "./route";
import TrackController from "@/controllers/TrackController";

export default class TrackRoute extends Route {
    private controller: TrackController = new TrackController();

    constructor() {
        super();

        this.router.get(
            "/:id",
            [this.authMiddelware.requireAuth],
            this.controller.getTrack.bind(this.controller)
        );
        this.router.get(
            "/:id/route",
            [this.authMiddelware.requireAuth],
            this.controller.getRoute.bind(this.controller)
        );
    }
}
