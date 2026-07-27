#!/usr/bin/env node
/**
 * Secure Terminal — command line front-end.
 *
 * Shares js/crypto.js with the web app, so a payload made in a browser on a
 * phone decrypts here and vice versa. There is no build step and no
 * dependency: Node's built-in Web Crypto is the same standard API the browser
 * exposes.
 *
 * Two conventions make this behave properly in a pipeline:
 *
 *   - the payload is the *only* thing written to stdout
 *   - every human-facing message goes to stderr
 *
 * so `secure-term encrypt .env | pbcopy` copies the payload and nothing else,
 * while the user still sees prompts and progress on their terminal.
 */

import { readFileSync, writeFileSync, existsSync, openSync, closeSync } from 'node:fs';
import { ReadStream } from 'node:tty';

import { encryptText, decryptText, ITERATIONS, PayloadError, DecryptionError } from '../js/crypto.js';
import { summarize, describe } from '../js/envfile.js';

const VERSION = '2.2.0';

/** Oldest Node this runs on. Kept in step with "engines" in package.json. */
const MINIMUM_NODE = 20;

/**
 * Check the runtime before attempting any cryptography.
 *
 * Node only exposes Web Crypto as a global from v19 (unflagged) and stably
 * from v20. Without this, an older Node fails with "crypto is not defined",
 * which tells the user nothing about what to do next.
 *
 * Deliberately not checked before --help: help should work everywhere,
 * including on the runtime that cannot run the tool.
 */
function checkRuntime() {
	if (typeof globalThis.crypto?.subtle !== 'undefined') return null;

	const running = process.versions.node;
	return new UsageError(
		`secure-term needs Node ${MINIMUM_NODE} or newer, and this is Node ${running}.\n` +
		`  Node ${running.split('.')[0]} does not provide the Web Crypto API that all\n` +
		`  the encryption here is built on.\n\n` +
		`  Upgrade Node, or run it without installing anything:\n` +
		`    npx --node-range='>=${MINIMUM_NODE}' secure-term --help\n\n` +
		`  Or use the web version, which needs no Node at all:\n` +
		`    https://hfconsultant.github.io/`
	);
}

const EXIT = {
	OK: 0,
	USAGE: 1,
	CRYPTO: 2,
	IO: 3,
	INTERRUPTED: 130
};

// ---------------------------------------------------------------- presentation

const useColour = process.stderr.isTTY && !process.env.NO_COLOR;
const c = {
	bold: (s) => (useColour ? `\x1b[1m${s}\x1b[0m` : s),
	dim: (s) => (useColour ? `\x1b[2m${s}\x1b[0m` : s),
	green: (s) => (useColour ? `\x1b[32m${s}\x1b[0m` : s),
	yellow: (s) => (useColour ? `\x1b[33m${s}\x1b[0m` : s),
	red: (s) => (useColour ? `\x1b[31m${s}\x1b[0m` : s)
};

const say = (message = '') => process.stderr.write(`${message}\n`);

// ----------------------------------------------------------------------- help

/**
 * The main help screen.
 *
 * Ordered for someone who has never used it: what it does in plain language,
 * then copy-pasteable examples, and only then the options table. Someone who
 * already knows what they are doing skims to OPTIONS; someone who does not
 * gets a working command in the first ten lines. The warning is last because
 * it is the thing that must not be missed.
 */
function mainHelp() {
	return `
${c.bold('secure-term')} — scramble a secret so you can send it through any channel

  Turns a file, or anything you type, into a block of meaningless characters.
  Send that block through email, Slack, a text message — anywhere. Whoever
  intercepts it sees nothing useful. Only someone who knows your passphrase
  can turn it back into the original.

${c.bold('USAGE')}
  secure-term encrypt [file] [options]
  secure-term decrypt [file] [options]

${c.bold('GETTING STARTED')}
  ${c.dim('Scramble a file, saving the result next to it:')}
    secure-term encrypt .env -o .env.enc

  ${c.dim('Turn it back:')}
    secure-term decrypt .env.enc -o .env

  ${c.dim('Scramble something you type or paste in (finish with Ctrl-D):')}
    secure-term encrypt

  ${c.dim('It will ask you for a passphrase. Nothing is sent anywhere —')}
  ${c.dim('all the work happens on this machine.')}

${c.bold('IN A PIPELINE')}
  cat .env | secure-term encrypt | pbcopy
  pbpaste | secure-term decrypt > .env
  secure-term decrypt .env.enc | grep DATABASE_URL

${c.bold('OPTIONS')}
  -o, --out ${c.dim('<file>')}       Write to a file instead of the screen
  -p, --pepper           Also ask for a second secret ${c.dim('(secure-term help pepper)')}
  -f, --force            Overwrite the output file if it already exists
      --iterations ${c.dim('<n>')}   Key-stretching rounds for new payloads ${c.dim(`(default ${ITERATIONS.toLocaleString()})`)}
      --no-confirm       Do not ask for the passphrase twice when encrypting
  -q, --quiet            Only report errors
  -h, --help             Show this help
  -V, --version          Show the version

${c.bold('LEARN MORE')}
  secure-term help pepper     ${c.dim('the optional second secret, and why')}
  secure-term help sharing    ${c.dim('how to get a payload to someone safely')}
  secure-term help scanners   ${c.dim('stopping security scanners flagging payloads')}
  secure-term help env        ${c.dim('sharing a .env file with a teammate')}
  secure-term help format     ${c.dim('the payload format, for other tools')}

${c.yellow(c.bold('IMPORTANT'))}
  ${c.yellow('There is no password reset and no recovery. If you forget the')}
  ${c.yellow('passphrase, the encrypted text is gone permanently. That is what')}
  ${c.yellow('makes it safe to store anywhere — and it means the passphrase')}
  ${c.yellow('needs to be something you genuinely will not lose.')}
`;
}

const TOPICS = {
	pepper: `
${c.bold('The pepper — an optional second secret')}

  A pepper is a second piece of information mixed in with your passphrase.
  Both are needed to unlock the result.

  It is useful when the passphrase is something you might be persuaded,
  tricked or compelled into revealing, because the pepper can be a detail
  that only exists in your head and was never typed anywhere else — a year,
  a street you lived on, a nickname nobody else uses.

  ${c.bold('Example')}
    Passphrase:  My dog Rex ate pizza in Paris last summer
    Pepper:      2019

  ${c.bold('Using it')}
    secure-term encrypt seed.txt -p -o seed.enc
    secure-term decrypt seed.enc -p

  ${c.yellow('A pepper is not a backup.')} It is a second thing you can lose. If you
  forget either half, the text is gone. Only use one if the pepper is
  something you are certain you will still know in ten years.

  A wrong passphrase and a wrong pepper give the same error, deliberately —
  telling you which half was right would help someone guessing.
`,

	sharing: `
${c.bold('Getting a payload to someone else safely')}

  The encrypted payload is safe to send through anything. The passphrase is
  not. Sending both the same way defeats the entire exercise.

  ${c.red('Wrong:')}  payload in Slack, passphrase in the next Slack message
  ${c.green('Right:')}  payload in Slack, passphrase said out loud on a call

  The rule: the payload and the passphrase should travel by routes that a
  single compromised account or device does not cover. Slack plus a phone
  call is fine. Two emails is not. Email plus a text message is reasonable.

  ${c.bold('Choosing a passphrase for someone else')}
  Do not invent a clever one and read it out character by character. Use
  several ordinary words — they are easy to say over a call and get right
  first time, and they are stronger than a short complicated one:

    tractor-window-brisket-9

  ${c.bold('Afterwards')}
  Delete the message once they confirm they have it. The payload does not
  expire on its own, and an old payload with a passphrase someone still
  remembers is a credential nobody is tracking.
`,

	scanners: `
${c.bold('Security scanners and false positives')}

  Tools like gitleaks and TruffleHog look for the ${c.bold('shape')} of a secret. They
  cannot tell a real credential from something safely encrypted, so an
  encrypted payload can get flagged even though it is harmless.

  ${c.bold('The good news')}
  Encryption destroys the shape. An encrypted Stripe key no longer looks
  like 'sk_live_...', so the pattern-matching rules that cause most alerts
  stay quiet. What can still fire is a generic "high entropy" rule, and
  usually only when the payload sits next to a revealing name:

    ${c.red('flagged:')}   STRIPE_SECRET_KEY=STv1.600000.WGo4...
    ${c.green('quiet:')}     STv1.600000.WGo4...

  So encrypt the ${c.bold('whole file')} into one payload rather than encrypting
  values individually. That is what this tool does by default.

  ${c.bold('Allowlisting payloads')}
  Every payload starts with 'STv1.', which makes them easy to exclude once
  instead of file by file. For gitleaks, in .gitleaks.toml:

    [[rules.allowlist]]
    regex = '''STv1\\.\\d+\\.'''

  ${c.bold('Better still, do not commit them')}
  Payloads are meant to travel through chat, not to live in git history.
  Anything committed is there permanently, and a payload that sits in a
  public repository for years is a payload someone can attack offline for
  years. Add this to .gitignore:

    *.enc
`,

	env: `
${c.bold('Sharing a .env file with a teammate')}

  The common problem: a colleague needs your local .env to run the project,
  and there is no good way to send it. Pasting it into chat puts live
  credentials into a searchable archive forever.

  ${c.bold('Send it')}
    secure-term encrypt .env -o .env.enc

  Send .env.enc — or the payload itself — through chat. Tell them the
  passphrase on a call, not in the same chat. See: secure-term help sharing

  ${c.bold('Receive it')}
    secure-term decrypt .env.enc -o .env

  ${c.bold('Check it arrived intact, without printing your credentials')}
    secure-term decrypt .env.enc | grep -c '='

  When the input looks like a .env file, this tool prints the ${c.bold('names')} of the
  variables it found and never the values, so you can confirm you have the
  right file on a shared screen or in a CI log.

  ${c.bold('Then clean up')}
  Delete the .enc file once it has been used, and make sure .env is in your
  .gitignore. Encrypting a file does not make it safe to commit — it makes
  it safe to ${c.bold('send')}.
`,

	format: `
${c.bold('The payload format')}

  STv1.<iterations>.<salt>.<iv>.<ciphertext>

  Dot-separated. The last three fields are base64url. For example:

    STv1.600000.WGo4u3ngZmEMzAUbsrn_kg.YkgymMBTWb3dx7TE.odYexKpVxxg...

  ${c.bold('Fields')}
    STv1         format version
    iterations   PBKDF2 rounds used for this payload, in decimal
    salt         16 random bytes
    iv           12 random bytes
    ciphertext   AES-256-GCM output, including its 16-byte tag

  ${c.bold('Why it is shaped this way')}
  The iteration count travels inside the payload, so raising the default in
  a later release can never orphan something you encrypted today. base64url
  avoids '+', '/' and '=', so a payload survives being pasted into a URL or
  a QR code, and a double-click selects all of it.

  ${c.bold('Interoperating')}
  PBKDF2-HMAC-SHA256 over the passphrase (joined to the pepper with a single
  space when one is used) derives a 256-bit AES-GCM key. Any language with a
  crypto library can read these; there is nothing bespoke in here.

  Payloads from the pre-2.0 release still decrypt. New ones are never
  written in that older format.
`
};

function topicHelp(topic) {
	const known = Object.keys(TOPICS);
	if (!topic) {
		say(`\n${c.bold('Help topics')}\n`);
		for (const name of known) say(`  secure-term help ${name}`);
		say('');
		return EXIT.OK;
	}

	const match = TOPICS[topic.toLowerCase()];
	if (!match) {
		say(c.red(`\nThere is no help topic called '${topic}'.`));
		say(`Available topics: ${known.join(', ')}\n`);
		return EXIT.USAGE;
	}

	say(match);
	return EXIT.OK;
}

/** Shown when run with no arguments — an orientation, not an error. */
function orientation() {
	return `
${c.bold('secure-term')} — scramble a secret so you can send it through any channel

  ${c.bold('Encrypt a file')}      secure-term encrypt .env -o .env.enc
  ${c.bold('Decrypt it again')}    secure-term decrypt .env.enc -o .env
  ${c.bold('Full help')}           secure-term --help

  Nothing is uploaded. Everything happens on this machine.
`;
}

// ------------------------------------------------------------------ arguments

class UsageError extends Error {}
class Interrupted extends Error {}

function parseArgs(argv) {
	const options = {
		command: null,
		file: null,
		out: null,
		pepper: false,
		force: false,
		quiet: false,
		confirm: true,
		iterations: ITERATIONS,
		help: false,
		version: false,
		topic: null
	};

	const rest = [...argv];

	while (rest.length) {
		const arg = rest.shift();

		switch (arg) {
			case '-h': case '--help': options.help = true; break;
			case '-V': case '--version': options.version = true; break;
			case '-p': case '--pepper': options.pepper = true; break;
			case '-f': case '--force': options.force = true; break;
			case '-q': case '--quiet': options.quiet = true; break;
			case '--no-confirm': options.confirm = false; break;

			case '-o': case '--out': {
				options.out = rest.shift();
				if (!options.out) throw new UsageError('--out needs a filename after it.');
				break;
			}

			case '--iterations': {
				const raw = rest.shift();
				const value = Number(raw);
				if (!Number.isInteger(value) || value < 1000) {
					throw new UsageError(
						`--iterations needs a whole number of at least 1000 (got ${raw ?? 'nothing'}).`
					);
				}
				options.iterations = value;
				break;
			}

			default: {
				if (arg.startsWith('-') && arg !== '-') {
					throw new UsageError(
						`Unknown option '${arg}'. Run 'secure-term --help' to see the options.`
					);
				}
				if (!options.command) {
					options.command = normaliseCommand(arg);
				} else if (options.command === 'help' && !options.topic) {
					options.topic = arg;
				} else if (!options.file) {
					options.file = arg;
				} else {
					throw new UsageError(
						`Unexpected extra argument '${arg}'. Only one file can be given at a time.`
					);
				}
			}
		}
	}

	return options;
}

/**
 * Map what the user typed onto a command.
 *
 * Accepts the single letters the web app uses, so muscle memory carries over,
 * and points at the right thing when someone reaches for a verb from a
 * different tool.
 */
function normaliseCommand(word) {
	const lower = word.toLowerCase();

	const aliases = {
		e: 'encrypt', enc: 'encrypt', encrypt: 'encrypt',
		d: 'decrypt', dec: 'decrypt', decrypt: 'decrypt',
		h: 'help', help: 'help'
	};
	if (aliases[lower]) return aliases[lower];

	const suggestions = {
		lock: 'encrypt', scramble: 'encrypt', seal: 'encrypt', hide: 'encrypt',
		unlock: 'decrypt', unscramble: 'decrypt', open: 'decrypt', read: 'decrypt'
	};
	if (suggestions[lower]) {
		throw new UsageError(
			`There is no '${word}' command — did you mean '${suggestions[lower]}'?\n` +
			`  secure-term ${suggestions[lower]} <file>`
		);
	}

	throw new UsageError(
		`There is no '${word}' command.\n` +
		`  secure-term encrypt <file>    scramble it\n` +
		`  secure-term decrypt <file>    turn it back\n` +
		`  secure-term --help            everything else`
	);
}

// ------------------------------------------------------------------------- io

/**
 * Whether stdin has been read to EOF.
 *
 * Matters because after `secure-term encrypt` reads typed input terminated by
 * Ctrl-D, stdin is finished and cannot also be used to prompt for the
 * passphrase -- the prompt has to go to the terminal directly.
 */
let stdinConsumed = false;

/**
 * Read all of stdin.
 *
 * Asynchronously, via the stream, rather than readFileSync(0): when stdin is a
 * pipe whose upstream process is still writing, the synchronous read fails
 * with EAGAIN, which breaks the `... | secure-term encrypt | ...` case that is
 * half the point of having a CLI.
 */
async function readStdin() {
	const chunks = [];
	for await (const chunk of process.stdin) chunks.push(chunk);
	stdinConsumed = true;
	return Buffer.concat(chunks).toString('utf8');
}

/** Read the thing to be processed: a named file, or piped stdin, or typed in. */
async function readInput(options) {
	if (options.file) {
		if (!existsSync(options.file)) {
			throw new IoError(
				`There is no file called '${options.file}' here.\n` +
				`  Check the name, or run 'ls' to see what is in this directory.`
			);
		}
		try {
			return readFileSync(options.file, 'utf8');
		} catch (error) {
			throw new IoError(`Could not read '${options.file}': ${error.message}`);
		}
	}

	if (!process.stdin.isTTY) {
		return readStdin(); // piped or redirected
	}

	// Interactive with no file: take typed input, and say so, because a
	// terminal that silently blocks on stdin is the single most confusing
	// thing a command line tool can do to someone new.
	if (!options.quiet) {
		const verb = options.command === 'encrypt' ? 'Type or paste the text to encrypt' : 'Paste the payload';
		say(c.dim(`${verb}, then press Ctrl-D when you are done:`));
	}
	return readStdin();
}

class IoError extends Error {}

function writeOutput(text, options) {
	if (!options.out) {
		process.stdout.write(text.endsWith('\n') ? text : `${text}\n`);
		return;
	}

	if (existsSync(options.out) && !options.force) {
		throw new IoError(
			`'${options.out}' already exists, and overwriting it would destroy what is there.\n` +
			`  Use a different name, or pass --force to overwrite it on purpose.`
		);
	}

	try {
		writeFileSync(options.out, text.endsWith('\n') ? text : `${text}\n`, { mode: 0o600 });
	} catch (error) {
		throw new IoError(`Could not write '${options.out}': ${error.message}`);
	}
}

// ------------------------------------------------------------------- secrets

/**
 * Get a terminal to prompt on.
 *
 * When input is piped, stdin is the data, so the passphrase has to be read
 * from the controlling terminal directly. Without this, `cat .env |
 * secure-term encrypt` would try to read the passphrase out of the .env file.
 */
function openTerminal() {
	// Try the controlling terminal first, not stdin. stdin may be carrying the
	// data, or may already have been read to EOF by typed input -- in both
	// cases it is useless for prompting, and /dev/tty still works.
	try {
		const fd = openSync('/dev/tty', 'r');
		const stream = new ReadStream(fd);
		return {
			stream,
			close: () => {
				try { stream.destroy(); closeSync(fd); } catch { /* already gone */ }
			}
		};
	} catch {
		// No /dev/tty (Windows outside a POSIX shell). Fall back to stdin, but
		// only if it is a terminal and nothing has consumed it.
		if (process.stdin.isTTY && !stdinConsumed) {
			return { stream: process.stdin, close: () => process.stdin.pause() };
		}
		return null; // CI, cron, a container
	}
}

/** Read a line with the characters masked. Prompts on stderr, never stdout. */
function promptSecret(stream, label) {
	return new Promise((resolve, reject) => {
		process.stderr.write(label);

		const wasRaw = Boolean(stream.isRaw);
		stream.setRawMode(true);
		stream.resume();

		let value = '';

		const finish = (fn, arg) => {
			stream.off('data', onData);
			stream.setRawMode(wasRaw);
			stream.pause();
			process.stderr.write('\n');
			fn(arg);
		};

		const onData = (chunk) => {
			for (const ch of chunk.toString('utf8')) {
				if (ch === '\r' || ch === '\n') return finish(resolve, value);
				if (ch === '\u0003') return finish(reject, new Interrupted()); // Ctrl-C
				if (ch === '\u0004') return finish(resolve, value); // Ctrl-D

				if (ch === '\u007f' || ch === '\b') {
					if (value.length) {
						value = value.slice(0, -1);
						process.stderr.write('\b \b');
					}
					continue;
				}

				if (ch < ' ') continue; // ignore other control characters
				value += ch;
				process.stderr.write('*');
			}
		};

		stream.on('data', onData);
	});
}

/**
 * Collect the passphrase, and the pepper when asked for.
 *
 * Environment variables are supported for automation, but there is
 * deliberately no --passphrase flag: anything on the command line is visible
 * in `ps` output and lands in shell history.
 */
async function collectSecrets(options) {
	const fromEnv = process.env.SECURE_TERM_PASSPHRASE;
	const pepperFromEnv = process.env.SECURE_TERM_PEPPER;

	if (fromEnv) {
		if (!options.quiet) {
			say(c.dim('Using the passphrase from SECURE_TERM_PASSPHRASE.'));
		}
		return { passphrase: fromEnv, pepper: pepperFromEnv || '' };
	}

	const terminal = openTerminal();
	if (!terminal) {
		throw new UsageError(
			'No terminal is available to ask for a passphrase.\n' +
			'  This usually means you are in CI, a cron job or a container.\n' +
			'  Set SECURE_TERM_PASSPHRASE in the environment instead:\n' +
			'    SECURE_TERM_PASSPHRASE=... secure-term decrypt .env.enc -o .env'
		);
	}

	try {
		const passphrase = await promptSecret(terminal.stream, 'Passphrase: ');
		if (!passphrase) throw new UsageError('A passphrase is required.');

		// Typos are unrecoverable when encrypting, so confirm. There is nothing
		// to confirm against when decrypting -- a wrong one simply fails.
		if (options.command === 'encrypt' && options.confirm) {
			const again = await promptSecret(terminal.stream, 'Passphrase again: ');
			if (again !== passphrase) {
				throw new UsageError(
					'Those two passphrases are not the same.\n' +
					'  Nothing was encrypted. Try again.'
				);
			}
		}

		let pepper = pepperFromEnv || '';
		if (options.pepper && !pepper) {
			pepper = await promptSecret(terminal.stream, 'Pepper: ');
			if (options.command === 'encrypt' && options.confirm && pepper) {
				const again = await promptSecret(terminal.stream, 'Pepper again: ');
				if (again !== pepper) {
					throw new UsageError('Those two peppers are not the same. Nothing was encrypted.');
				}
			}
		}

		return { passphrase, pepper };
	} finally {
		terminal.close();
	}
}

// -------------------------------------------------------------------- actions

async function doEncrypt(options) {
	const input = await readInput(options);
	if (!input.trim()) {
		throw new UsageError('There is nothing to encrypt — the input was empty.');
	}

	const summary = summarize(input);
	if (!options.quiet) {
		const what = summary.kind === 'env' ? 'Found a .env file' : 'Read';
		say(c.dim(`${what}: ${describe(summary).join('\n  ')}`));
	}

	const { passphrase, pepper } = await collectSecrets(options);

	if (!options.quiet) process.stderr.write(c.dim('Encrypting... '));
	const payload = await encryptText(input, passphrase, pepper, options.iterations);
	if (!options.quiet) say(c.green('done'));

	writeOutput(payload, options);

	if (!options.quiet && options.out) {
		say('');
		say(c.green(`Written to ${options.out}`));
		say(c.dim('Send that file or its contents anywhere you like. Tell the other'));
		say(c.dim('person the passphrase some other way — not in the same message.'));
		say(c.dim('  secure-term help sharing'));
	}

	return EXIT.OK;
}

async function doDecrypt(options) {
	const input = await readInput(options);
	if (!input.trim()) {
		throw new UsageError('There is nothing to decrypt — the input was empty.');
	}

	const { passphrase, pepper } = await collectSecrets(options);

	if (!options.quiet) process.stderr.write(c.dim('Decrypting... '));

	let plaintext;
	try {
		plaintext = await decryptText(input.trim(), passphrase, pepper);
	} catch (error) {
		if (!options.quiet) say('');
		throw error;
	}

	if (!options.quiet) say(c.green('done'));

	writeOutput(plaintext, options);

	if (!options.quiet) {
		const summary = summarize(plaintext);
		if (summary.kind === 'env') {
			say(c.dim(`Recovered ${describe(summary).join('\n  ')}`));
		}
		if (options.out) say(c.green(`Written to ${options.out}`));
	}

	return EXIT.OK;
}

// ----------------------------------------------------------------------- main

/** Turn an error into an explanation and a suggested next step. */
function report(error, options) {
	if (error instanceof Interrupted) {
		say(c.dim('\nCancelled. Nothing was written.'));
		return EXIT.INTERRUPTED;
	}

	if (error instanceof DecryptionError) {
		say(c.red('Could not decrypt that.'));
		say('');
		say('  The usual reasons, in order of likelihood:');
		say('    - the passphrase is not quite right (check caps lock)');
		say(`    - it was encrypted with a pepper${options?.pepper ? ', and this one is not right' : ", and -p was not passed"}`);
		say('    - the payload was truncated or altered in transit');
		say('');
		say(c.dim('  A wrong passphrase and a wrong pepper give the same message on'));
		say(c.dim('  purpose, so it is not possible to tell which half was correct.'));
		return EXIT.CRYPTO;
	}

	if (error instanceof PayloadError) {
		say(c.red(`That does not look like an encrypted payload.`));
		say('');
		say(`  ${error.message}`);
		say('');
		say('  A payload starts with "STv1." and is one long unbroken line.');
		say('  If you copied it out of a chat window, check that the whole thing');
		say('  came across and that nothing wrapped onto a second line.');
		say(c.dim('  secure-term help format'));
		return EXIT.CRYPTO;
	}

	if (error instanceof IoError) {
		say(c.red(error.message));
		return EXIT.IO;
	}

	if (error instanceof UsageError) {
		say(c.red(error.message));
		return EXIT.USAGE;
	}

	say(c.red(`Unexpected error: ${error.message}`));
	if (process.env.SECURE_TERM_DEBUG) say(error.stack);
	return EXIT.IO;
}

async function main(argv) {
	let options;

	try {
		options = parseArgs(argv);
	} catch (error) {
		return report(error);
	}

	if (options.version) {
		process.stdout.write(`${VERSION}\n`);
		return EXIT.OK;
	}

	// --help beats everything, including an otherwise invalid command line, so
	// that reaching for help always works.
	if (options.help || (!options.command && argv.length === 0)) {
		say(options.help ? mainHelp() : orientation());
		return EXIT.OK;
	}

	if (options.command === 'help') return topicHelp(options.topic);

	if (!options.command) {
		say(orientation());
		return EXIT.USAGE;
	}

	const unsupported = checkRuntime();
	if (unsupported) return report(unsupported, options);

	try {
		return options.command === 'encrypt'
			? await doEncrypt(options)
			: await doDecrypt(options);
	} catch (error) {
		return report(error, options);
	}
}

process.on('SIGINT', () => {
	say(c.dim('\nCancelled. Nothing was written.'));
	process.exit(EXIT.INTERRUPTED);
});

main(process.argv.slice(2)).then((code) => {
	process.exitCode = code;
});
