// Utilidades de cifrado y descifrado en el navegador usando la Web Crypto API
// Permite procesar las contraseñas localmente de manera segura sin intermediación del servidor.

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
 * Convierte un ArrayBuffer de bytes a String hexadecimal
 */
function arrayBufferToHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Deriva la clave criptográfica AES de 256 bits a partir de la contraseña maestra y el userSalt
 * Empleando el algoritmo estándar PBKDF2 (100,000 iteraciones, SHA-256)
 */
async function deriveKeyLocal(masterPassword, userSalt) {
  const encoder = new TextEncoder();
  
  // La contraseña maestra actúa como el material de clave base para PBKDF2
  const baseKey = await window.crypto.subtle.importKey(
    'raw',
    encoder.encode(masterPassword),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  // Usar el salt de metadata del usuario
  const saltBuffer = encoder.encode(userSalt);

  return await window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: saltBuffer,
      iterations: 100000, // 100k iteraciones para robustecer contra ataques de fuerza bruta local
      hash: 'SHA-256'
    },
    baseKey,
    { name: 'AES-CBC', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Cifra un texto en claro en el cliente usando AES-256-CBC
 */
async function encryptPasswordLocal(plainText, userSalt) {
  try {
    const masterPassword = sessionStorage.getItem('keyshield_master');
    if (!masterPassword) {
      throw new Error('Contraseña maestra no disponible. Inicie sesión de nuevo.');
    }

    const key = await deriveKeyLocal(masterPassword, userSalt);
    
    // Generar un IV aleatorio de 16 bytes
    const iv = window.crypto.getRandomValues(new Uint8Array(16));
    const encoder = new TextEncoder();

    const encryptedBuffer = await window.crypto.subtle.encrypt(
      {
        name: 'AES-CBC',
        iv: iv
      },
      key,
      encoder.encode(plainText)
    );

    return {
      encryptedData: arrayBufferToHex(encryptedBuffer),
      iv: arrayBufferToHex(iv)
    };
  } catch (error) {
    console.error('Error al cifrar localmente:', error);
    return null;
  }
}

/**
 * Descifra el string hexadecimal cifrado usando AES-256-CBC localmente
 */
async function decryptPasswordOffline(encryptedHex, ivHex, userSalt) {
  try {
    const masterPassword = sessionStorage.getItem('keyshield_master');
    if (!masterPassword) {
      throw new Error('Contraseña maestra no disponible.');
    }

    const key = await deriveKeyLocal(masterPassword, userSalt);
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

/**
 * Genera un verificador criptográfico SHA-256 de la contraseña maestra y su salt
 * Permite validar contraseñas de bóveda sin almacenar la contraseña en claro
 */
async function hashVaultPassword(password, salt) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + ':' + salt);
  const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
  return arrayBufferToHex(hashBuffer);
}

window.cryptoClient = {
  encryptPasswordLocal,
  decryptPasswordOffline,
  hashVaultPassword
};
