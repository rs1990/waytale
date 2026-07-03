import 'dotenv/config';
import path from 'path';
import express from 'express';
import helmet from 'helmet';
import corsMiddleware from './middleware/cors.js';
import { publicLimiter, adminLimiter } from './middleware/rateLimit.js';
import landmarksRouter from './routes/landmarks.js';
import routesRouter from './routes/routes.js';
import adminRouter from './routes/admin.js';
import geocodeRouter from './routes/geocode.js';
import itineraryRouter from './routes/itinerary.js';
import authRouter from './routes/auth.js';

const app = express();
const PORT = process.env.PORT ?? 3001;

// Same directory the pipeline's Polly client writes to (pipeline/.env: AUDIO_OUTPUT_DIR).
// Served statically so app clients can resolve landmark_content.audio_url.
const AUDIO_DIR = path.resolve(process.cwd(), process.env.AUDIO_DIR ?? '../pipeline/audio_cache');

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } })); // audio files need cross-origin fetch
app.use(corsMiddleware);
app.use(express.json());

app.get('/health', (_req, res) => res.json({ status: 'ok', version: '1.0.0' }));

app.use('/audio', express.static(AUDIO_DIR));
app.use('/landmarks', publicLimiter, landmarksRouter);
app.use('/route', publicLimiter, routesRouter);
app.use('/geocode', publicLimiter, geocodeRouter);
app.use('/itinerary', publicLimiter, itineraryRouter);
app.use('/auth', publicLimiter, authRouter);
app.use('/admin', adminLimiter, adminRouter);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: err.message ?? 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`WayTale backend listening on port ${PORT}`);
});
