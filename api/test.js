// Minimal Vercel serverless function for testing
export default function handler(req, res) {
  res.status(200).json({
    success: true,
    message: 'Vercel serverless function working',
    timestamp: new Date().toISOString(),
    method: req.method,
    url: req.url,
    environment: {
      NODE_ENV: process.env.NODE_ENV,
      VERCEL: process.env.VERCEL,
      hasMongoUri: !!process.env.MONGODB_URI
    }
  });
}