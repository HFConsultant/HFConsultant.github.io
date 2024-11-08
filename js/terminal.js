window.terminal = {
    terminalCommands: {
        help: function() {
            return `Available commands:
        encrypt <text> -p <passphrase> - Encrypt text with passphrase
        decrypt <text> -p <passphrase> - Decrypt text with passphrase
        clear - Clear terminal
        exit - Close terminal`;
        },

        encrypt: async function(text, passphrase) {
            const pepper = prompt('Enter additional secret value (pepper):');
            const combinedKey = passphrase + pepper;
            const encoder = new TextEncoder();
            const data = encoder.encode(text);

            const key = await crypto.subtle.importKey(
                'raw',
                encoder.encode(combinedKey),
                { name: 'PBKDF2' },
                false,
                ['deriveBits']
            );

            const salt = crypto.getRandomValues(new Uint8Array(16));
            const encryptionKey = await crypto.subtle.deriveBits(
                {
                    name: 'PBKDF2',
                    salt: salt,
                    iterations: 100000,
                    hash: 'SHA-256'
                },
                key,
                256
            );

            const iv = crypto.getRandomValues(new Uint8Array(12));
            const encryptedData = await crypto.subtle.encrypt(
                { name: 'AES-GCM', iv: iv },
                await crypto.subtle.importKey(
                    'raw',
                    encryptionKey,
                    { name: 'AES-GCM' },
                    false,
                    ['encrypt']
                ),
                data
            );

            return btoa(JSON.stringify({
                salt: Array.from(salt),
                iv: Array.from(iv),
                data: Array.from(new Uint8Array(encryptedData))
            }));
        },

        decrypt: async function(encryptedText, passphrase) {
            const pepper = prompt('Enter additional secret value (pepper):');
            const combinedKey = passphrase + pepper;

            try {
                const { salt, iv, data } = JSON.parse(atob(encryptedText));
                const encoder = new TextEncoder();

                const key = await crypto.subtle.importKey(
                    'raw',
                    encoder.encode(combinedKey),
                    { name: 'PBKDF2' },
                    false,
                    ['deriveBits']
                );

                const decryptionKey = await crypto.subtle.deriveBits(
                    {
                        name: 'PBKDF2',
                        salt: new Uint8Array(salt),
                        iterations: 100000,
                        hash: 'SHA-256'
                    },
                    key,
                    256
                );

                const decryptedData = await crypto.subtle.decrypt(
                    { name: 'AES-GCM', iv: new Uint8Array(iv) },
                    await crypto.subtle.importKey(
                        'raw',
                        decryptionKey,
                        { name: 'AES-GCM' },
                        false,
                        ['decrypt']
                    ),
                    new Uint8Array(data)
                );

                return new TextDecoder().decode(decryptedData);
            } catch {
                return 'Decryption failed. Check your passphrase and pepper.';
            }
        }
    },

    initTerminal: function() {
        const input = document.querySelector('.terminal-input');
        const output = document.querySelector('.terminal-output');

        const writeOutput = (text, isCommand = false, isEncrypted = false) => {
            const line = document.createElement('div');
            line.className = isCommand ? 'command-line' : 'output-line';

            if (isEncrypted) {
                const copyButton = document.createElement('button');
                copyButton.className = 'copy-btn';
                copyButton.innerHTML = '<i class="fas fa-copy"></i>';
                copyButton.onclick = () => {
                    navigator.clipboard.writeText(text);
                    copyButton.innerHTML = '<i class="fas fa-check"></i>';
                    setTimeout(() => copyButton.innerHTML = '<i class="fas fa-copy"></i>', 2000);
                };
                line.appendChild(copyButton);
            }

            line.appendChild(document.createTextNode(isCommand ? `> ${text}` : text));
            output.appendChild(line);
            output.scrollTop = output.scrollHeight;
        };

        // Handle example command clicks
        document.querySelectorAll('.example-cmd').forEach(btn => {
            btn.addEventListener('click', () => {
                input.value = btn.textContent;
                input.focus();
            });
        });

        input.addEventListener('keypress', async (e) => {
            if (e.key === 'Enter') {
                const command = input.value.trim();
                writeOutput(command, true);

                const [cmd, ...args] = command.split(' ');
                const pIndex = args.indexOf('-p');
                const passphrase = pIndex !== -1 ? args[pIndex + 1] : '';
                const text = args.slice(0, pIndex !== -1 ? pIndex : undefined).join(' ');

                const executeCommand = (cmd, args) => {
                    const commands = {
                        help: () => showHelp(),
                        encrypt: (text, passphrase) => encryptText(text, passphrase),
                        decrypt: (text, passphrase) => decryptText(text, passphrase),
                        clear: () => clearTerminal()
                    };

                    return commands[cmd] ? commands[cmd](args) : 'Unknown command';
                };

                const result = await executeCommand(cmd, [text, passphrase]);
                writeOutput(result, false, cmd === 'encrypt');

                input.value = '';
                output.scrollTop = output.scrollHeight;
            }
        });

        writeOutput('Welcome to the Secure Terminal. Type "help" for available commands.');
    }
};

document.addEventListener('DOMContentLoaded', () => {
    window.terminal.initTerminal();
});
