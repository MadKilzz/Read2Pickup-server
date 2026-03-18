import config from "@/config";
import Stripe from "stripe";

export const StripeClient = new Stripe(config.stripe.secret);