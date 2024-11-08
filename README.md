# Secure Terminal

A sleek, browser-based encryption terminal using the Web Crypto API.

## Features
- AES-GCM encryption with PBKDF2 key derivation
- Additional pepper value for enhanced security
- Clean terminal interface with dark theme
- Fully client-side processing

## Usage
1. Type 'help' to see available commands
2. To encrypt: `encrypt Hello World -p mypassword`
3. To decrypt: `decrypt <encrypted-text> -p mypassword`
4. Enter pepper value when prompted

## Commands
help                            # Show available commands
encrypt <text> -p <passphrase>  # Encrypt text with passphrase
decrypt <text> -p <passphrase>  # Decrypt text with passphrase
clear                          # Clear terminal
exit                           # Close terminal

## Technology
Built with vanilla JavaScript and the Web Crypto API, featuring modern CSS styling.
