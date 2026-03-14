// Netlify Function — Proxy Overpass
// Route : POST /api/overpass
//
// Pourquoi un proxy ?
// Les IPs des serveurs Netlify sont moins throttlées que les IPs
// résidentielles/mobiles sur les serveurs Overpass publics.
// Ce proxy relaie la requête côté serveur → moins de 504.

const OVERPASS_SERVERS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

const sleep = ms => new Promise(r => setTimeout(r, ms));

export default async (request) => {
  // Uniquement POST
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  let body;
  try {
    body = await request.text();
  } catch {
    return new Response('Bad request', { status: 400 });
  }

  // Séquence : serveur principal → miroir → retry principal
  const attempts = [
    { server: OVERPASS_SERVERS[0], delay: 0    },
    { server: OVERPASS_SERVERS[1], delay: 1500 },
    { server: OVERPASS_SERVERS[0], delay: 3000 },
  ];

  let lastStatus = 503;
  for (const { server, delay } of attempts) {
    if (delay > 0) await sleep(delay);
    try {
      const res = await fetch(server, {
        method:  'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
        signal: AbortSignal.timeout(30000),
      });

      if (res.status === 200) {
        const data = await res.text();
        return new Response(data, {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'public, max-age=300', // cache 5min côté Netlify CDN
          },
        });
      }
      lastStatus = res.status;
    } catch {
      lastStatus = 504;
    }
  }

  return new Response(
    JSON.stringify({ error: 'Overpass servers unavailable', status: lastStatus }),
    { status: 502, headers: { 'Content-Type': 'application/json' } }
  );
};

export const config = { path: '/api/overpass' };