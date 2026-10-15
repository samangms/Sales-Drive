import { next } from '@vercel/functions';

// Runs before every request to the site. Anything not matched here is served
// without asking for a password, so keep this broad: only Vercel's own internal
// paths are excluded.
export const config = {
  runtime: 'nodejs',
  matcher: ['/((?!_vercel/).*)'],
};

const REALM = 'Outlet performance dashboard';

// Set these in Vercel: Project > Settings > Environment Variables.
const USER_VAR = 'DASHBOARD_USER';
const PASS_VAR = 'DASHBOARD_PASSWORD';

function askForPassword() {
  return new Response('Authentication required.\n', {
    status: 401,
    headers: {
      // This header is what makes the browser show the username/password prompt.
      'WWW-Authenticate': `Basic realm="${REALM}", charset="UTF-8"`,
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

// If the credentials are missing from the environment we refuse everything rather
// than letting the site through unprotected, and say plainly what to fix.
function notConfigured() {
  return new Response(
    `This dashboard is not configured yet.\n\n` +
      `Set ${USER_VAR} and ${PASS_VAR} in the Vercel project's ` +
      `environment variables, then redeploy.\n`,
    {
      status: 503,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    },
  );
}

// Base64 decode that survives non-ASCII characters in a password.
function decodeBase64(value) {
  const binary = atob(value);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

// Compare SHA-256 digests rather than the strings themselves. Digests are always
// the same length, so this leaks neither the content nor the length of the secret
// through how long the comparison takes.
async function sha256(value) {
  const data = new TextEncoder().encode(value);
  return new Uint8Array(await crypto.subtle.digest('SHA-256', data));
}

function equalBytes(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function matches(given, expected) {
  const [a, b] = await Promise.all([sha256(given), sha256(expected)]);
  return equalBytes(a, b);
}

export default async function middleware(request) {
  const expectedUser = process.env[USER_VAR];
  const expectedPass = process.env[PASS_VAR];
  if (!expectedUser || !expectedPass) return notConfigured();

  const header = request.headers.get('authorization') || '';
  const sep = header.indexOf(' ');
  const scheme = sep === -1 ? '' : header.slice(0, sep);
  const encoded = sep === -1 ? '' : header.slice(sep + 1).trim();
  if (scheme.toLowerCase() !== 'basic' || !encoded) return askForPassword();

  let decoded;
  try {
    decoded = decodeBase64(encoded);
  } catch {
    return askForPassword();
  }

  // Only the first colon separates the two, so a password may contain colons.
  const colon = decoded.indexOf(':');
  if (colon === -1) return askForPassword();
  const user = decoded.slice(0, colon);
  const pass = decoded.slice(colon + 1);

  // Both are always checked, so a correct username doesn't return any faster.
  const [userOk, passOk] = await Promise.all([
    matches(user, expectedUser),
    matches(pass, expectedPass),
  ]);
  if (!userOk || !passOk) return askForPassword();

  return next();
}
