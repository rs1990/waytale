import 'dotenv/config';
import express from 'express';
import corsMiddleware from './middleware/cors.js';
import landmarksRouter from './routes/landmarks.js';
import routesRouter from './routes/routes.js';
import adminRouter from './routes/admin.js';
import geocodeRouter from './routes/geocode.js';
import itineraryRouter from './routes/itinerary.js';

const app = express();
const PORT = process.env.PORT ?? 3001;

app.use(corsMiddleware);
app.use(express.json());

app.get('/health', (_req, res) => res.json({ status: 'ok', version: '1.0.0' }));

app.use('/landmarks', landmarksRouter);
app.use('/route', routesRouter);
app.use('/admin', adminRouter);
app.use('/geocode', geocodeRouter);
app.use('/itinerary', itineraryRouter);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: err.message ?? 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`WayTale backend listening on port ${PORT}`);
});
