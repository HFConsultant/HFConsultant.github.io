/**
 * Secure Terminal — user interface.
 *
 * A small command-driven shell over js/crypto.js. This module owns presentation
 * and input flow only; it performs no cryptography of its own.
 *
 * Secrecy rule for this file: a value the user types as a secret (the plaintext
 * being encrypted, the passphrase, the pepper) is never written into the DOM.
 * Those steps switch the input to type="password" and echo a fixed-width mask,
 * so nothing sensitive survives in the scrollback, in a screenshot, or in a
 * screen share.
 */

import {
	encryptText,
	decryptText,
	estimateStrength,
	PayloadError,
	DecryptionError
} from './crypto.js';

/** How long a decrypted secret sits on the clipboard before we try to clear it. */
const CLIPBOARD_CLEAR_MS = 45000;

const ICON_COPY = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M16 1H4a2 2 0 0 0-2 2v14h2V3h12V1zm3 4H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2zm0 16H8V7h11v14z"/></svg>`;
const ICON_CHECK = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>`;

/**
 * Each flow is a sequence of prompts. `secret: true` means the value is masked
 * on entry and never echoed; `optional: true` means an empty line skips it.
 */
const FLOWS = {
	encrypt: [
		{ key: 'text', prompt: 'Text to encrypt:', secret: true },
		{ key: 'passphrase', prompt: 'Passphrase:', secret: true, strength: true },
		{ key: 'pepper', prompt: 'Pepper (optional, Enter to skip):', secret: true, optional: true }
	],
	decrypt: [
		{ key: 'payload', prompt: 'Paste the encrypted payload:' },
		{ key: 'passphrase', prompt: 'Passphrase:', secret: true },
		{ key: 'pepper', prompt: 'Pepper (Enter if none was used):', secret: true, optional: true }
	]
};

const HELP = [
	['e', 'encrypt some text'],
	['d', 'decrypt a payload'],
	['c', 'clear the screen'],
	['h', 'show this help'],
	['about', 'how this works, and what it does not protect against'],
	['Esc', 'cancel the current step'],
	['↑ ↓', 'previous commands']
];

const ABOUT = [
	'Secure Terminal encrypts text in your browser with AES-256-GCM.',
	'The key is derived from your passphrase with PBKDF2-HMAC-SHA256 (600,000 iterations).',
	'',
	'Nothing is uploaded. There is no server, no account and no analytics.',
	'Nothing is written to storage: reload the page and it is gone.',
	'',
	'The pepper is a second secret mixed into the key. It is optional, and it is',
	'not a backup -- lose either the passphrase or the pepper and the text is gone.',
	'There is no recovery. That is the point.',
	'',
	'What this does NOT protect against: a compromised device, a keylogger, or',
	'someone reading over your shoulder. It has not been independently audited.',
	'Do not stake anything irreplaceable on it without a backup you control.'
];

const terminal = {
	/** @type {{mode: string|null, step: number, data: Record<string,string>}} */
	state: { mode: null, step: 0, data: {} },

	history: [],
	historyIndex: -1,
	clipboardTimer: null,

	elements: {
		output: null,
		input: null,
		label: null,
		form: null
	},

	// ---------------------------------------------------------------- output

	/**
	 * Append a line to the terminal.
	 * @param {string} text
	 * @param {{kind?: string, html?: boolean}} [options] kind styles the line
	 */
	write(text, options = {}) {
		const line = document.createElement('div');
		line.className = `line line--${options.kind || 'output'}`;

		if (options.html) {
			line.innerHTML = text;
		} else {
			line.textContent = text;
		}

		this.elements.output.appendChild(line);
		this.scrollToBottom();
		return line;
	},

	writeBlank() {
		this.write(' ');
	},

	/** Echo the command the user just entered, honouring the secrecy rule. */
	echo(text, { secret = false } = {}) {
		this.write(`> ${secret ? '•'.repeat(8) : text}`, { kind: 'command' });
	},

	error(message) {
		this.write(message, { kind: 'error' });
	},

	scrollToBottom() {
		this.elements.output.scrollTop = this.elements.output.scrollHeight;
	},

	/**
	 * Render a result block with a copy button.
	 *
	 * @param {string} value      the text to display and copy
	 * @param {boolean} isSecret  true for decrypted plaintext, which we also try
	 *                            to clear from the clipboard afterwards
	 */
	writeResult(value, isSecret) {
		const line = document.createElement('div');
		line.className = 'line line--result';

		const button = document.createElement('button');
		button.className = 'copy-btn';
		button.type = 'button';
		button.innerHTML = ICON_COPY;
		button.setAttribute('aria-label', 'Copy to clipboard');
		button.addEventListener('click', () => this.copy(value, button, isSecret));

		const text = document.createElement('span');
		text.className = 'result-text';
		text.textContent = value;

		line.append(button, text);
		this.elements.output.appendChild(line);
		this.scrollToBottom();
	},

	async copy(value, button, isSecret) {
		try {
			await navigator.clipboard.writeText(value);
		} catch {
			this.error('Could not reach the clipboard. Select the text and copy it manually.');
			return;
		}

		button.innerHTML = ICON_CHECK;
		button.classList.add('copy-btn--done');
		setTimeout(() => {
			button.innerHTML = ICON_COPY;
			button.classList.remove('copy-btn--done');
		}, 2000);

		if (isSecret) this.scheduleClipboardClear(value);
	},

	/**
	 * Try to clear a decrypted secret off the clipboard after a delay.
	 *
	 * Only the plaintext gets this treatment -- the encrypted payload is not
	 * secret, and clearing it would just be annoying. We read the clipboard back
	 * before overwriting so that if the user has copied something else in the
	 * meantime we leave it alone. If reading is not permitted we do nothing:
	 * silently destroying whatever the user has copied would be worse than the
	 * risk we are mitigating.
	 */
	scheduleClipboardClear(value) {
		clearTimeout(this.clipboardTimer);
		this.write(`(clipboard will be cleared in ${CLIPBOARD_CLEAR_MS / 1000}s if unchanged)`, {
			kind: 'muted'
		});

		this.clipboardTimer = setTimeout(async () => {
			try {
				const current = await navigator.clipboard.readText();
				if (current !== value) return; // user copied something else; leave it
				await navigator.clipboard.writeText('');
				this.write('Clipboard cleared.', { kind: 'muted' });
			} catch {
				this.write('Clipboard not cleared (permission denied). Clear it yourself.', {
					kind: 'muted'
				});
			}
		}, CLIPBOARD_CLEAR_MS);
	},

	// ----------------------------------------------------------- input mode

	/** Switch the prompt between normal and masked entry. */
	setInputMode(step) {
		const { input, label } = this.elements;
		const secret = Boolean(step?.secret);

		input.type = secret ? 'password' : 'text';
		input.setAttribute('autocomplete', secret ? 'new-password' : 'off');
		label.textContent = step ? step.prompt : 'Command';
		input.setAttribute('aria-label', step ? step.prompt : 'Terminal command');
		input.placeholder = step ? '' : "type 'h' for help";
	},

	// --------------------------------------------------------------- flows

	start(mode) {
		this.state = { mode, step: 0, data: {} };
		const step = FLOWS[mode][0];
		this.write(step.prompt, { kind: 'prompt' });
		this.setInputMode(step);
	},

	cancel(message = 'Cancelled.') {
		if (!this.state.mode) return;
		this.state = { mode: null, step: 0, data: {} };
		this.setInputMode(null);
		this.write(message, { kind: 'muted' });
	},

	/** Feed one line of input into the active flow. */
	async advance(value) {
		const steps = FLOWS[this.state.mode];
		const step = steps[this.state.step];

		if (!value && !step.optional) {
			this.error(`${step.prompt.replace(/:$/, '')} cannot be empty. Esc to cancel.`);
			return;
		}

		this.state.data[step.key] = value;

		if (step.strength && value) this.reportStrength(value);

		this.state.step += 1;

		if (this.state.step < steps.length) {
			const next = steps[this.state.step];
			this.write(next.prompt, { kind: 'prompt' });
			this.setInputMode(next);
			return;
		}

		const { mode, data } = this.state;
		this.state = { mode: null, step: 0, data: {} };
		this.setInputMode(null);
		await this.run(mode, data);
	},

	reportStrength(passphrase) {
		const { score, label, bits } = estimateStrength(passphrase);
		// Plain ASCII: box-drawing and shade glyphs fall back inconsistently
		// across monospace fonts and render as a solid blob on some systems.
		const meter = `[${'#'.repeat(score + 1)}${'-'.repeat(4 - score)}]`;
		this.write(`Passphrase strength: ${meter} ${label} (~${bits} bits)`, {
			kind: score <= 1 ? 'warn' : 'muted'
		});
		if (score === 0) {
			this.write('That is weak enough to brute-force. Consider a longer phrase.', {
				kind: 'warn'
			});
		}
	},

	/** Execute a completed flow, with a working indicator over the slow KDF. */
	async run(mode, data) {
		const working = this.write('Deriving key…', { kind: 'muted' });
		const frames = ['⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
		let frame = 0;
		const spinner = setInterval(() => {
			working.textContent = `${frames[frame++ % frames.length]} Deriving key…`;
		}, 80);

		try {
			if (mode === 'encrypt') {
				const payload = await encryptText(data.text, data.passphrase, data.pepper);
				working.remove();
				this.write('Encrypted. Store this somewhere you can get it back:', { kind: 'ok' });
				this.writeResult(payload, false);
			} else {
				const plaintext = await decryptText(data.payload, data.passphrase, data.pepper);
				working.remove();
				this.write('Decrypted:', { kind: 'ok' });
				this.writeResult(plaintext, true);
			}
		} catch (err) {
			working.remove();
			if (err instanceof PayloadError || err instanceof DecryptionError) {
				this.error(err.message);
			} else {
				this.error('Something went wrong. Your browser may not support Web Crypto.');
				console.error(err);
			}
		} finally {
			clearInterval(spinner);
			// Drop our references to the secrets. JavaScript gives no way to wipe
			// memory, so this only makes them eligible for collection sooner.
			data.passphrase = data.pepper = data.text = data.payload = null;
			this.writeBlank();
		}
	},

	// ------------------------------------------------------------ commands

	showHelp() {
		this.write('Commands:', { kind: 'prompt' });
		for (const [key, description] of HELP) {
			this.write(`  ${key.padEnd(7)} ${description}`);
		}
		this.writeBlank();
	},

	showAbout() {
		for (const line of ABOUT) this.write(line || ' ');
		this.writeBlank();
	},

	clear() {
		this.elements.output.replaceChildren();
	},

	/**
	 * Handle a line typed at the command prompt (that is, outside a flow).
	 * @returns {boolean} whether the line was a recognised command
	 */
	handleCommand(command) {
		switch (command.toLowerCase()) {
			case 'e':
			case 'encrypt':
				this.start('encrypt');
				return true;
			case 'd':
			case 'decrypt':
				this.start('decrypt');
				return true;
			case 'c':
			case 'clear':
				this.clear();
				return true;
			case 'h':
			case 'help':
			case '?':
				this.showHelp();
				return true;
			case 'about':
				this.showAbout();
				return true;
			default:
				return false;
		}
	},

	// --------------------------------------------------------------- input

	async submit() {
		const { input } = this.elements;
		const value = input.value.trim();
		input.value = '';

		if (this.state.mode) {
			const step = FLOWS[this.state.mode][this.state.step];
			this.echo(value || '(skipped)', { secret: step.secret && Boolean(value) });
			await this.advance(value);
			return;
		}

		if (!value) return;

		this.echo(value);
		if (value !== this.history[this.history.length - 1]) this.history.push(value);
		this.historyIndex = this.history.length;

		if (!this.handleCommand(value)) {
			this.error(`Unknown command: ${value}. Type 'h' for help.`);
		}
	},

	/** Arrow-key history recall. Never active during a secret step. */
	recall(direction) {
		if (this.state.mode || this.history.length === 0) return;

		this.historyIndex = Math.min(
			this.history.length,
			Math.max(0, this.historyIndex + direction)
		);
		this.elements.input.value = this.history[this.historyIndex] ?? '';
	},

	// ----------------------------------------------------------------- init

	init() {
		this.elements.output = document.querySelector('.terminal-output');
		this.elements.input = document.querySelector('.terminal-input');
		this.elements.label = document.querySelector('.terminal-label');
		this.elements.form = document.querySelector('.terminal-input-line');

		if (!this.elements.output || !this.elements.input) return;

		this.elements.form.addEventListener('submit', (event) => {
			event.preventDefault();
			this.submit();
		});

		this.elements.input.addEventListener('keydown', (event) => {
			// Enter is handled here rather than left to the form's implicit
			// submission, which is not reliably triggered across browsers when
			// the page ships a form-action CSP directive.
			if (event.key === 'Enter') {
				event.preventDefault();
				this.submit();
			} else if (event.key === 'Escape') {
				event.preventDefault();
				this.elements.input.value = '';
				this.cancel();
			} else if (event.key === 'ArrowUp') {
				event.preventDefault();
				this.recall(-1);
			} else if (event.key === 'ArrowDown') {
				event.preventDefault();
				this.recall(1);
			}
		});

		// Clicking dead space in the terminal focuses the prompt -- but not while
		// the user is selecting text, and not when they clicked a button.
		this.elements.output.addEventListener('mouseup', (event) => {
			if (event.target.closest('button')) return;
			if (window.getSelection()?.toString()) return;
			this.elements.input.focus();
		});

		this.setInputMode(null);
		this.write('Secure Terminal — encrypt text in your browser.', { kind: 'ok' });
		this.write('Nothing leaves this device. Nothing is stored.');
		this.writeBlank();
		this.showHelp();
	}
};

window.terminal = terminal;
document.addEventListener('DOMContentLoaded', () => terminal.init());

export default terminal;
