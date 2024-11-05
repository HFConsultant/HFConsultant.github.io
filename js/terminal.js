export const terminalCommands = {
    help: () => `Available commands:
        encrypt <text> -p <passphrase> - Encrypt text with passphrase
        decrypt <text> -p <passphrase> - Decrypt text with passphrase
        clear - Clear terminal
        exit - Close terminal`,

    encrypt: async (text, passphrase) => {
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

    decrypt: async (encryptedText, passphrase) => {
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
};

export const createTerminal = () => {
    const terminal = document.createElement('div');
    terminal.className = 'terminal';
    terminal.innerHTML = `
        <div class="terminal-header">
            <span>Secure Terminal</span>
            <button class="terminal-close">×</button>
        </div>
        <div class="terminal-output"></div>
        <div class="terminal-input-line">
            <span class="prompt">></span>
            <input type="text" class="terminal-input" autofocus>
        </div>
    `;

    document.body.appendChild(terminal);

    const output = terminal.querySelector('.terminal-output');
    const input = terminal.querySelector('.terminal-input');

    const writeOutput = (text, isCommand = false) => {
        const line = document.createElement('div');
        line.className = isCommand ? 'command-line' : 'output-line';
        line.textContent = isCommand ? `> ${text}` : text;
        output.appendChild(line);
        output.scrollTop = output.scrollHeight;
    };

    input.addEventListener('keypress', async (e) => {
        if (e.key === 'Enter') {
            const command = input.value.trim();
            writeOutput(command, true);

            const [cmd, ...args] = command.split(' ');
            const pIndex = args.indexOf('-p');
            const passphrase = pIndex !== -1 ? args[pIndex + 1] : '';
            const text = args.slice(0, pIndex !== -1 ? pIndex : undefined).join(' ');

            if (terminalCommands[cmd]) {
                const result = await terminalCommands[cmd](text, passphrase);
                writeOutput(result);
            } else {
                writeOutput('Unknown command. Type "help" for available commands.');
            }

            input.value = '';
            output.scrollTop = output.scrollHeight;
        }
    });

    terminal.querySelector('.terminal-close').onclick = () => terminal.remove();

    writeOutput('Welcome to the Secure Terminal. Type "help" for available commands.');
    input.focus();
};

export const addTerminalButton = () => {
    const button = document.createElement('button');
    button.className = 'terminal-toggle';
    button.innerHTML = '<i class="fas fa-terminal"></i>';
    button.onclick = createTerminal;
    document.body.appendChild(button);
};
