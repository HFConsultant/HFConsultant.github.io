window.terminal = {
    state: {
        mode: null,
        text: null
    },

    terminalCommands: {
        help: function() {
            return `How may I help you?
        'e' - Encrypt a message
        'd' - Decrypt a message
        'clear' - Clear terminal`;
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

        const writeOutput = (text, isCommand = false) => {
            const line = document.createElement('div');
            line.className = isCommand ? 'command-line' : 'output-line';
            line.textContent = isCommand ? `> ${text}` : text;
            output.appendChild(line);
            output.scrollTop = output.scrollHeight;
        };

        writeOutput('How may I help you?');
        writeOutput("'e' for encrypt");
        writeOutput("'d' for decrypt");
        writeOutput("'h' for help");

        input.addEventListener('keypress', async (e) => {
            if (e.key === 'Enter') {
                const command = input.value.trim();
                writeOutput(command, true);

                if (!this.state.mode) {
                    if (command === 'e') {
                        this.state.mode = 'encrypt';
                        writeOutput('Enter text to encrypt:');
                    } else if (command === 'd') {
                        this.state.mode = 'decrypt';
                        writeOutput('Enter text to decrypt:');
                    }
                } else if (!this.state.text) {
                    this.state.text = command;
                    writeOutput('Enter passphrase:');
                } else {
                    const result = this.state.mode === 'encrypt'
                        ? await this.terminalCommands.encrypt(this.state.text, command)
                        : await this.terminalCommands.decrypt(this.state.text, command);

                    writeOutput(result);
                    // Reset state
                    this.state.mode = null;
                    this.state.text = null;
                    writeOutput("\nHow may I help you?");
                    writeOutput("'e' for encrypt");
                    writeOutput("'d' for decrypt");
                }

                input.value = '';
                output.scrollTop = output.scrollHeight;
            }
        });
    }
};

document.addEventListener('DOMContentLoaded', () => {
    window.terminal.initTerminal();
});
