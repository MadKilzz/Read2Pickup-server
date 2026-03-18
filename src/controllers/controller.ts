import ApiError from "@/utils/ApiError";
import Logger from "@/utils/Logger";
import Snowflake from "@/utils/SnowFlake";
import { StripeClient } from "@/utils/stripe";

class Controller {
  /**
   * Logger
   */
  protected readonly logger: Logger = new Logger('R2P');

  protected ApiError: typeof ApiError = ApiError;
  
  protected SnowFlake: typeof Snowflake = Snowflake;

  protected Stripe: typeof StripeClient = StripeClient;
  
}

export default Controller;