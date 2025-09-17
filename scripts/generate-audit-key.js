#!/usr/bin/env node
/**
 * Generate a secure encryption key for audit data
 * This script generates a cryptographically secure 32-byte key
 * suitable for AES-256 encryption used in audit logging
 */

import crypto from 'crypto';

console.log('🔐 Generating secure audit encryption key...\n');

// Generate a secure 32-byte key
const key = crypto.randomBytes(32).toString('hex');

console.log('✅ Generated secure audit encryption key:');
console.log(`AUDIT_ENCRYPTION_KEY=${key}\n`);

console.log('📋 Instructions:');
console.log('1. Copy the key above');
console.log('2. Add it to your .env file:');
console.log(`   AUDIT_ENCRYPTION_KEY=${key}`);
console.log('3. Restart your application\n');

console.log('⚠️  Security Notes:');
console.log('- Keep this key secure and never commit it to version control');
console.log('- Use different keys for different environments (dev/staging/prod)');
console.log('- Store production keys in a secure key management system');
console.log('- If compromised, generate a new key and re-encrypt existing audit data');
