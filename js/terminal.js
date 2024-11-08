window.terminal = {
    state: {
        mode: null,
        step: 0,
        data: {}
    },

    commands: {
        help() {
            return `Available commands:
- Start Encryption: Begins guided encryption process
- Start Decryption: Begins guided decryption process
- clear: Clears the terminal
- help: Shows this message`;
        },

        clear() {
            document.querySelector('.terminal-output').innerHTML = '';
            return '';
        },

        async encrypt(text, passphrase, pepper) {
            const encoder = new TextEncoder();
            const data = encoder.encode(text);
            const key = await crypto.subtle.importKey(
                'raw',
                encoder.encode(passphrase + pepper),
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

        async decrypt(hash, passphrase, pepper) {
            try {
                const { salt, iv, data } = JSON.parse(atob(hash));
                const key = await crypto.subtle.importKey(
                    'raw',
                    new TextEncoder().encode(passphrase + pepper),
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
                return 'Decryption failed. Check your input and try again.';
            }
        }
    },

    executeCommand(name, ...args) {
        return this.commands[name]?.(...args) ?? 'Unknown command';
    },

    startEncryption: function() {
        this.state.mode = 'encrypt';
        this.state.step = 1;
        this.writeOutput('Enter text to encrypt:');
    },

    startDecryption: function() {
        this.state.mode = 'decrypt';
        this.state.step = 1;
        this.writeOutput('Enter hash to decrypt:');
    },

    handleInput: async function(input) {
        if (!this.state.mode) {
            // Handle regular commands
            return this.executeCommand(input);
        }

        switch(this.state.step) {
            case 1:
                this.state.data.text = input;
                this.state.step = 2;
                this.writeOutput('Enter passphrase:');
                break;
            case 2:
                this.state.data.passphrase = input;
                this.state.step = 3;
                this.writeOutput('Enter pepper value:');
                break;
            case 3:
                this.state.data.pepper = input;
                // Process encryption/decryption
                const result = this.state.mode === 'encrypt'
                    ? await this.commands.encrypt(this.state.data.text, this.state.data.passphrase, this.state.data.pepper)
                    : await this.commands.decrypt(this.state.data.text, this.state.data.passphrase, this.state.data.pepper);

                this.writeOutput(result, false, this.state.mode === 'encrypt');
                // Reset state
                this.state.mode = null;
                this.state.step = 0;
                this.state.data = {};
                break;
        }
    },

    initTerminal: function() {
        const input = document.querySelector('.terminal-input');
        const output = document.querySelector('.terminal-output');

        document.getElementById('start-encrypt').addEventListener('click', () => {
            this.startEncryption();
        });

        document.getElementById('start-decrypt').addEventListener('click', () => {
            this.startDecryption();
        });

        input.addEventListener('keypress', async (e) => {
            if (e.key === 'Enter') {
                const command = input.value.trim();
                this.writeOutput(command, true);
                await this.handleInput(command);
                input.value = '';
                output.scrollTop = output.scrollHeight;
            }
        });

        this.writeOutput('Welcome to the Secure Terminal. Type "help" or click Start Encryption/Decryption.');
    }
};

document.addEventListener('DOMContentLoaded', () => {
    window.terminal.initTerminal();
});
