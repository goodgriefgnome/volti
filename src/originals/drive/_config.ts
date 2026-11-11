// The Google OAuth client Volti signs in with, given at build time (VITE_DRIVE_CLIENT_ID and
// VITE_DRIVE_CLIENT_SECRET: the deploy workflow's secrets, or .env.local). None: no Drive.

export const _clientId: string = import.meta.env.VITE_DRIVE_CLIENT_ID ?? '';
export const _clientSecret: string = import.meta.env.VITE_DRIVE_CLIENT_SECRET ?? '';
/** The page Google sends the browser back to: Volti's own URL (…/volti/). */
export const _redirectUri = () => new URL(import.meta.env.BASE_URL, location.origin).href;
