# Secure Terminal

A sleek, browser-based encryption terminal using the Web Crypto API. Built with vanilla JavaScript and designed with a modern dark theme.

## Features
- Text encryption using AES-GCM
- Secure key derivation with PBKDF2
- Additional pepper value for enhanced security
- Clean terminal interface
- Dark theme optimized

## Usage
1. Type 'help' to see available commands
2. To encrypt: `encrypt Hello World -p mypassword`
3. To decrypt: `decrypt <encrypted-text> -p mypassword`
4. You'll be prompted for a pepper value - an additional secret that adds another layer of security

## Commands
help                            # Show available commands
encrypt <text> -p <passphrase>  # Encrypt text with passphrase
decrypt <text> -p <passphrase>  # Decrypt text with passphrase
clear                          # Clear terminal
exit                           # Close terminal

## Security Features
- AES-GCM encryption
- PBKDF2 key derivation
- Client-side only - no server storage
- Additional pepper value requirement
- All operations run locally in your browser

## Technology
Built with vanilla JavaScript, Web Crypto API, and modern CSS. All encryption happens client-side - no data is stored or transmitted.
