"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.api = void 0;
const express_1 = __importDefault(require("express"));
const app_1 = require("firebase-admin/app");
const params_1 = require("firebase-functions/params");
const https_1 = require("firebase-functions/v2/https");
if ((0, app_1.getApps)().length === 0) {
    (0, app_1.initializeApp)();
}
const googleMapsStaticApiKey = (0, params_1.defineSecret)("GOOGLE_MAPS_STATIC_API_KEY");
const app = (0, express_1.default)();
function parseBoundedInt(value, fallbackValue, minValue, maxValue) {
    if (typeof value !== "string") {
        return fallbackValue;
    }
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) {
        return fallbackValue;
    }
    return Math.min(maxValue, Math.max(minValue, parsed));
}
function toOptionalTrimmedString(value) {
    if (typeof value !== "string") {
        return null;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}
function isValidLatitude(value) {
    return Number.isFinite(value) && value >= -90 && value <= 90;
}
function isValidLongitude(value) {
    return Number.isFinite(value) && value >= -180 && value <= 180;
}
function normalizePathValue(rawPath) {
    const trimmed = rawPath.trim();
    if (!trimmed) {
        return null;
    }
    if (trimmed.startsWith("enc:")) {
        const encoded = trimmed.slice(4).trim();
        if (!encoded || encoded.length > 4000) {
            return null;
        }
        return `enc:${encoded}`;
    }
    const rawPoints = trimmed
        .split("|")
        .map((part) => part.trim())
        .filter((part) => part.length > 0);
    if (rawPoints.length < 2 || rawPoints.length > 60) {
        return null;
    }
    const normalizedPoints = [];
    for (const point of rawPoints) {
        const [latRaw, lonRaw] = point.split(",");
        if (!latRaw || !lonRaw) {
            return null;
        }
        const lat = Number.parseFloat(latRaw.trim());
        const lon = Number.parseFloat(lonRaw.trim());
        if (!isValidLatitude(lat) || !isValidLongitude(lon)) {
            return null;
        }
        normalizedPoints.push(`${lat.toFixed(6)},${lon.toFixed(6)}`);
    }
    return normalizedPoints.join("|");
}
async function fetchWithTimeout(url, timeoutMs) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, { signal: controller.signal });
    }
    finally {
        clearTimeout(timeoutId);
    }
}
async function handleGoogleThumbnail(req, res) {
    const key = googleMapsStaticApiKey.value();
    if (!key) {
        res.status(500).json({ error: "GOOGLE_MAPS_STATIC_API_KEY non configurata" });
        return;
    }
    const width = parseBoundedInt(req.query.w, 320, 64, 640);
    const height = parseBoundedInt(req.query.h, 180, 64, 360);
    const origin = toOptionalTrimmedString(req.query.origin);
    const destination = toOptionalTrimmedString(req.query.destination);
    const rawPath = toOptionalTrimmedString(req.query.path);
    const path = rawPath ? normalizePathValue(rawPath) : null;
    if (rawPath && !path) {
        res.status(400).json({ error: "Parametro path non valido" });
        return;
    }
    if (!path && !(origin && destination)) {
        res.status(400).json({ error: "Servono path valido oppure origin+destination" });
        return;
    }
    const staticMapUrl = new URL("https://maps.googleapis.com/maps/api/staticmap");
    staticMapUrl.searchParams.set("size", `${width}x${height}`);
    staticMapUrl.searchParams.set("scale", "2");
    staticMapUrl.searchParams.set("maptype", "roadmap");
    if (path) {
        staticMapUrl.searchParams.append("path", `color:0x1F6FEB|weight:4|${path}`);
    }
    if (origin) {
        staticMapUrl.searchParams.append("markers", `color:green|label:A|${origin}`);
    }
    if (destination) {
        staticMapUrl.searchParams.append("markers", `color:red|label:B|${destination}`);
    }
    staticMapUrl.searchParams.set("key", key);
    try {
        const upstreamResponse = await fetchWithTimeout(staticMapUrl.toString(), 12000);
        if (!upstreamResponse.ok) {
            res.status(502).json({ error: `Google Static Maps HTTP ${upstreamResponse.status}` });
            return;
        }
        const body = Buffer.from(await upstreamResponse.arrayBuffer());
        if (body.length === 0) {
            res.status(502).json({ error: "Risposta immagine vuota da Google Static Maps" });
            return;
        }
        const contentType = upstreamResponse.headers.get("content-type") ?? "image/png";
        res.setHeader("Content-Type", contentType);
        res.setHeader("Cache-Control", "public, max-age=86400, s-maxage=86400");
        res.setHeader("X-Content-Type-Options", "nosniff");
        res.status(200).send(body);
    }
    catch {
        res.status(500).json({ error: "Errore generazione thumbnail Google" });
    }
}
app.get("/api/google/thumbnail", handleGoogleThumbnail);
app.get("/google/thumbnail", handleGoogleThumbnail);
app.all("*", (_req, res) => {
    res.status(404).json({ error: "Not found" });
});
exports.api = (0, https_1.onRequest)({ secrets: [googleMapsStaticApiKey] }, app);
