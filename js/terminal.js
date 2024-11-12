window.terminal = {
    state: {
        mode: null,
        step: 0,
        data: {}
    },

    terminalCommands: {
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

    handleCommand: function(command) {
        if (command === 'c') {
            document.querySelector('.terminal-output').innerHTML = '';
            return true;
        }
        return false;
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
        writeOutput("'c' for clear");

        input.addEventListener('keypress', async (e) => {
            if (e.key === 'Enter') {
                const command = input.value.trim();
                writeOutput(command, true);

                if (!this.handleCommand(command)) {
                    if (command === 'e') {
                        this.state.mode = 'encrypt';
                        this.state.step = 1;
                        writeOutput('Enter text to encrypt:');
                    } else if (command === 'd') {
                        this.state.mode = 'decrypt';
                        this.state.step = 1;
                        writeOutput('Enter text to decrypt:');
                    } else if (this.state.mode) {
                        if (this.state.step === 1) {
                            this.state.data.text = command;
                            this.state.step = 2;
                            writeOutput('Enter passphrase:');
                        } else if (this.state.step === 2) {
                            const result = await this.terminalCommands[this.state.mode](
                                this.state.data.text,
                                command
                            );
                            writeOutput(result);
                            this.state.mode = null;
                            this.state.step = 0;
                            this.state.data = {};
                        }
                    }
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
