// Utilidades de descifrado en el navegador usando la Web Crypto API
// Esto nos permite desencriptar las contraseñas localmente en la PWA sin enviar peticiones al servidor.

/**
 * Convierte un String hexadecimal a un ArrayBuffer de bytes
 */
function hexToArrayBuffer(hex) {
  if (typeof hex !== 'string') return new Uint8Array(0);
  const match = hex.match(/.{1,2}/g);
  if (!match) return new Uint8Array(0);
  return new Uint8Array(match.map(byte => parseInt(byte, 16)));
}

/**
 * Convierte un String de texto ordinario a ArrayBuffer
 */
function stringToArrayBuffer(str) {
  const encoder = new TextEncoder();
  return encoder.encode(str);
}

/**
 * Deriva la clave criptográfica AES de 256 bits a partir del Salt del usuario y el Pepper
 * Empleando el algoritmo estándar PBKDF2 (10,000 iteraciones, SHA-256) idéntico al backend
 */
async function deriveKeyOffline(userSalt, serverPepper) {
  const encoder = new TextEncoder();
  
  // En Node.js: pbkdf2Sync(SERVER_PEPPER, userSalt, 10000, 32, 'sha256')
  // Por lo tanto, el password de PBKDF2 es el SERVER_PEPPER (serverPepper), y la sal es userSalt.
  const baseKey = await window.crypto.subtle.importKey(
    'raw',
    encoder.encode(serverPepper),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  // En Node.js: pbkdf2Sync(SERVER_PEPPER, userSalt, 10000, 32, 'sha256')
  // Nota crucial: en el backend pasamos 'userSalt' directamente como string (hexadecimal de 64 caracteres)
  // por lo tanto, no debemos decodificar el hex en bytes binarios, sino codificar los caracteres UTF-8
  // del string tal cual para que coincida exactamente con la derivación de clave de Node.js.
  const saltBuffer = encoder.encode(userSalt);

  const cryptoKey = await window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: saltBuffer,
      iterations: 10000,
      hash: 'SHA-256'
    },
    baseKey,
    { name: 'AES-CBC', length: 256 },
    false,
    ['decrypt']
  );

  return cryptoKey;
}

/**
 * Descifra el string hexadecimal cifrado usando AES-256-CBC de forma local.
 * Requiere el Pepper del servidor guardado al hacer login de forma segura
 */
async function decryptPasswordOffline(encryptedHex, ivHex, userSalt) {
  try {
    const serverPepper = sessionStorage.getItem('keyshield_pepper');
    if (!serverPepper) {
      throw new Error('Pepper no disponible. Debes haber iniciado sesión online al menos una vez.');
    }

    const key = await deriveKeyOffline(userSalt, serverPepper);
    const iv = hexToArrayBuffer(ivHex);
    const encryptedData = hexToArrayBuffer(encryptedHex);

    const decryptedBuffer = await window.crypto.subtle.decrypt(
      {
        name: 'AES-CBC',
        iv: iv
      },
      key,
      encryptedData
    );

    const decoder = new TextDecoder();
    return decoder.decode(decryptedBuffer);
  } catch (error) {
    console.error('Error al descifrar offline:', error);
    return null;
  }
}

window.cryptoClient = {
  decryptPasswordOffline
};
