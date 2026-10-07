export function allowedOrigins() {
  const origins = (process.env.CORS_ORIGINS ?? 'http://localhost:3000')
    .split(',')
    .map((value) => value.trim());
  if (
    origins.some((value) => {
      try {
        const url = new URL(value);
        return (
          !['http:', 'https:'].includes(url.protocol) || url.origin !== value
        );
      } catch {
        return true;
      }
    })
  )
    throw new Error('CORS_ORIGINS must contain exact http(s) origins');
  return origins;
}
