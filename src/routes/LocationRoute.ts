import { locationSearchValidationSchema } from "@/validation/location";
import Route from "./route";
import LocationController from "@/controllers/LocationController";

export default class LocationRoute extends Route {
    private controller: LocationController = new LocationController();

    constructor() {
        super();
        this.Init()
    }

    private Init(): void {

        this.router.get("/search",
            [
                this.formMiddelware.validateQuery(locationSearchValidationSchema)
            ],
            this.controller.getLocations.bind(this.controller)
        )
       
    }
}