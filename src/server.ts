import http from "http";
import express, { Response, Request } from "express";
import bodyParser from "body-parser";
import cors from "cors";
import dotenv from "dotenv";
import helmet from "helmet";
import cookieParser from "cookie-parser";

import Logger from "./utils/Logger";
import config from "@/config";
import { initSocket } from "./socket";

import { globalLimiter } from "@/rateLimit";
import AuthRouter from "./routes/AuthRoute";
import BookRouter from "./routes/BookRoute";
import BillingRouter from "./routes/BillingRoute";
import DispatchRoute from "./routes/DispatchRoute";
import DriverRoute from "./routes/DriverRoute";
import LocationRoute from "./routes/LocationRoute";
import TrackRoute from "./routes/TrackRoute";

// -------------------- ENV laden --------------------
dotenv.config();

const app = express();
const logger = new Logger("R2P");

// ✅ Achter proxy (Cloudflare/Nginx) gebruiken we echte client IP
app.set("trust proxy", 1);

const isProduction = config.app.isProduction;

// ✅ Helmet security headers
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:"],
        connectSrc: ["'self'", ...(config.app.allowedOrigins || [])],
        fontSrc: ["'self'", "https:", "data:"],
        formAction: ["'self'"],
        frameAncestors: ["'self'"],
        objectSrc: ["'none'"],
        scriptSrcAttr: ["'none'"],
        upgradeInsecureRequests: [],
        baseUri: ["'self'"],
      },
    },
    crossOriginResourcePolicy: { policy: "same-site" },
  })
);

app.disable("x-powered-by");

// -------------------- Body parsing --------------------
app.use("/billing/events", bodyParser.raw({ type: "application/json" }));
app.use(express.json());
app.use(cookieParser());

// -------------------- Rate limiting (global; store in memory; set REDIS_URL for shared store) --------------------
app.use(globalLimiter);

// -------------------- CORS setup --------------------
app.use(
  cors({
    origin: (origin, callback) => {
      // Browser requests: alleen allowedOrigins
      if (origin && config.app.allowedOrigins.includes(origin)) return callback(null, true);

      // Server-to-server / Postman: laat door
      if (!origin) return callback(null, true);

      // Andere origins: blokkeren, maar geen error log
      return callback(null, false);
    },
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
    allowedHeaders: ["Content-Type", "Authorization", "X-App-Info"],
    credentials: true, // belangrijk voor httpOnly cookies
  })
);

// -------------------- Routes --------------------
app.use("/auth", new AuthRouter().router);
app.use("/location", new LocationRoute().router);
app.use("/bookings", new BookRouter().router);
app.use("/billing", new BillingRouter().router);
app.use("/dispatch", new DispatchRoute().router);
app.use("/driver", new DriverRoute().router);
app.use("/track", new TrackRoute().router);

// -------------------- Health check --------------------
app.get("/api/health", (req: Request, res: Response) => {
  res.json({
    message: "🚀 Server is running!",
    env: process.env.NODE_ENV,
    port: config.app.port,
  });
});

// -------------------- HTTP server + Socket.IO --------------------
const httpServer = http.createServer(app);
initSocket(httpServer);
httpServer.listen(config.app.port, () => {
  logger.ready(
    `✅ Server running ${isProduction ? "https://api.r2ptaxi.com" : `http://localhost:${config.app.port}`
    }`
  );
});
