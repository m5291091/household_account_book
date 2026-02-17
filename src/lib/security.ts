// src/lib/security.ts

export async function hashPasscode(passcode: string): Promise<string> {
  if (typeof window === 'undefined') {
      return ''; // Server-side hashing not supported by this simplistic implementation or not needed
  }
  const encoder = new TextEncoder();
  const data = encoder.encode(passcode);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}
