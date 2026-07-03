import cors from 'cors';

const DEFAULT_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:19006',  // Expo web
  'http://localhost:8081',   // Expo Metro bundler
];

// Extra origins (e.g. a deployed admin dashboard or web build) via env, comma-separated.
const EXTRA_ORIGINS = (process.env.ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

const ALLOWED_ORIGINS = [...DEFAULT_ORIGINS, ...EXTRA_ORIGINS];

export default cors({
  origin: (origin, cb) => {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    cb(new Error(`CORS blocked: ${origin}`));
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
});
