// Production release remains deliberately blocked. Vercel preview only.
if (process.env.VERCEL !== '1' || process.env.VERCEL_ENV !== 'preview' || process.env.SHOP_DB_BACKEND !== 'postgres-preview' || process.env.RATE_LIMIT_BACKEND !== 'postgres-shared' || !process.env.SHOP_POSTGRES_URL) {
  console.error('ShopEasy preview requires the protected Vercel/Supabase configuration.');
  process.exit(1);
}
console.info('ShopEasy protected preview configuration present.');
