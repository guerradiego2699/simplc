/**
 * /ads.txt (Authorized Digital Sellers) for AdSense. Only lists Google when ads are enabled and a
 * publisher id is configured in site.ts; otherwise it is an empty, harmless file.
 */
import type { APIRoute } from 'astro';
import { adsEnabled, SITE } from '@/config/site';

export const GET: APIRoute = () => {
  const publisher = SITE.ads.client.replace(/^ca-/, '');
  const body = adsEnabled() ? `google.com, ${publisher}, DIRECT, f08c47fec0942fa0\n` : '';
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
