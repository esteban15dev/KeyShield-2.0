const crypto = require('crypto');

// Clave secreta base del servidor para añadir una capa extra de entropía (Pepper)
const SERVER_PEPPER = process.env.JWT_SECRET || 'llave_secreta_por_defecto_para_pepper';

/**
 * Deriva una clave de cifrado fuerte a partir del Salt del usuario y el Pepper del servidor.
 * Esto asegura que las contraseñas cifradas en la base de datos dependan de factores tanto del usuario como del servidor.
 * @param {string} userSalt Salt único del usuario guardado en la BD
 * @returns {Buffer} Clave de 32 bytes (256 bits)
 */
function deriveKey(userSalt) {
  return crypto.pbkdf2Sync(SERVER_PEPPER, userSalt, 10000, 32, 'sha256');
}

/**
 * Cifra un texto utilizando AES-256-CBC con la clave derivada del Salt del usuario.
 * @param {string} text Texto plano a cifrar (la contraseña de la cuenta)
 * @param {string} userSalt Salt único del usuario
 * @returns {object} { encryptedData: string (hex), iv: string (hex) }
 */
function encrypt(text, userSalt) {
  const key = deriveKey(userSalt);
  const iv = crypto.randomBytes(16); // Vector de inicialización aleatorio de 16 bytes
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  return {
    encryptedData: encrypted,
    iv: iv.toString('hex')
  };
}

/**
 * Descifra un texto cifrado utilizando AES-256-CBC con la clave derivada del Salt del usuario.
 * @param {string} encryptedData Texto cifrado en formato hex
 * @param {string} ivString Vector de inicialización en formato hex
 * @param {string} userSalt Salt único del usuario
 * @returns {string} Texto original descifrado
 */
function decrypt(encryptedData, ivString, userSalt) {
  const key = deriveKey(userSalt);
  const iv = Buffer.from(ivString, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  
  let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}

module.exports = {
  encrypt,
  decrypt
};
