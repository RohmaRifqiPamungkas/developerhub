const ENCRYPTION_PREFIX = 'enc:'

export async function encryptText(text: string, password: string): Promise<string> {
  try {
    const encoder = new TextEncoder()
    const rawData = encoder.encode(text)

    // Generate a random salt (16 bytes) and IV (12 bytes for AES-GCM)
    const salt = window.crypto.getRandomValues(new Uint8Array(16))
    const iv = window.crypto.getRandomValues(new Uint8Array(12))

    // Import password
    const passwordKey = await window.crypto.subtle.importKey(
      'raw',
      encoder.encode(password),
      { name: 'PBKDF2' },
      false,
      ['deriveKey']
    )

    // Derive AES-GCM key using PBKDF2
    const aesKey = await window.crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: salt,
        iterations: 100000,
        hash: 'SHA-256'
      },
      passwordKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt']
    )

    // Encrypt raw data
    const ciphertext = await window.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv },
      aesKey,
      rawData
    )

    // Combine salt + iv + ciphertext
    const combined = new Uint8Array(salt.byteLength + iv.byteLength + ciphertext.byteLength)
    combined.set(new Uint8Array(salt), 0)
    combined.set(new Uint8Array(iv), salt.byteLength)
    combined.set(new Uint8Array(ciphertext), salt.byteLength + iv.byteLength)

    // Base64 encode the combined bytes
    const base64 = btoa(String.fromCharCode(...combined))
    return `${ENCRYPTION_PREFIX}${base64}`
  } catch (err) {
    console.error('Encryption failed:', err)
    throw new Error('Encryption failed')
  }
}

export async function decryptText(encryptedString: string, password: string): Promise<string> {
  try {
    if (!encryptedString.startsWith(ENCRYPTION_PREFIX)) {
      return encryptedString
    }

    const base64 = encryptedString.substring(ENCRYPTION_PREFIX.length)
    const binary = atob(base64)
    const combined = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
      combined[i] = binary.charCodeAt(i)
    }

    // Extract salt, iv, and ciphertext
    const salt = combined.slice(0, 16)
    const iv = combined.slice(16, 28)
    const ciphertext = combined.slice(28)

    const encoder = new TextEncoder()
    const decoder = new TextDecoder()

    const passwordKey = await window.crypto.subtle.importKey(
      'raw',
      encoder.encode(password),
      { name: 'PBKDF2' },
      false,
      ['deriveKey']
    )

    const aesKey = await window.crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: salt,
        iterations: 100000,
        hash: 'SHA-256'
      },
      passwordKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt']
    )

    const decrypted = await window.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv },
      aesKey,
      ciphertext
    )

    return decoder.decode(decrypted)
  } catch (err) {
    console.error('Decryption failed:', err)
    throw new Error('Incorrect password or corrupted note')
  }
}

export function isEncrypted(text: string): boolean {
  return text ? text.startsWith(ENCRYPTION_PREFIX) : false
}
