# Secure Terminal

A sleek, browser-based encryption terminal using the Web Crypto API. Built with vanilla JavaScript and designed with a modern dark theme.

## Features

- Text encryption using AES-GCM
- Secure key derivation with PBKDF2
- Additional pepper value for enhanced security
- Clean terminal interface
- Dark theme optimized
- Copy button for encrypted text
- Client-side only - no data transmission

## Use Cases

### Crypto Wallet Security
Transform wallet seed phrases into memorable sentences:
	Wallet Phrase: "wagon rhythm exotic stand lens fortune brief grain siren wheel trophy blind"
	Encryption Phrase: "My dog Rex ate pizza in Paris last summer while watching the sunset"
	Pepper: "2019" (Pepper is optional - adds uncertainty for enhanced security)

### Password Management
Create memorable master passwords:
	Original: "correcthorsebatterystaple"
	Encryption Phrase: "I saw 4 random words on XKCD once!"
	Pepper: "comic936" (Pepper is optional - use personal memory triggers)

### Secure Communication
Share sensitive information through public channels:
	Original: "Meeting at 3pm to discuss merger"
	Encryption Phrase: "Going fishing with grandpa"
	Pepper: "boardroom" (Pepper is optional - context can be your secret)

### Personal Journal Entries
Keep private thoughts secure with personal memory triggers:
	Original: "Dear Diary..."
	Encryption Phrase: "Today's grocery list"
	Pepper: "childhood street name" (Pepper is optional - use meaningful memories)

## Quick Start

1. Type 'e' to encrypt
2. Enter your text
3. Enter your passphrase
4. Add your pepper value (optional)
5. Copy the encrypted result

To decrypt:
1. Type 'd' to decrypt
2. Paste the encrypted text
3. Enter the same passphrase
4. Enter the same pepper value (if used)

Clear the terminal anytime with 'c'

## Security Notes

- The pepper acts as an additional secret key
- All encryption happens in your browser
- No data is stored or transmitted
- Uses modern Web Crypto API standards

## Technical Details

- AES-GCM encryption
- PBKDF2 key derivation
- 256-bit encryption keys
- 100,000 PBKDF2 iterations
