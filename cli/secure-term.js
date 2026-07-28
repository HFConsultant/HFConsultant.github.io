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

import {
	readFileSync, writeFileSync, existsSync, openSync, closeSync,
	unlinkSync, renameSync, statSync, appendFileSync
} from 'node:fs';
import { ReadStream } from 'node:tty';
import { spawn } from 'node:child_process';
import { tmpdir, constants as osConstants } from 'node:os';
import { join } from 'node:path';

import {
	encryptText, decryptText, ITERATIONS, VERSION_GZIP, PayloadError, DecryptionError
} from '../js/crypto.js';
import { summarize, describe, decodeUtf8Strict, tooLongFor } from '../js/envfile.js';
import { parseEnv } from '../js/envparse.js';

const VERSION = '2.7.0';

/** The project key file, by convention — the analogue of Rails' master.key. */
const KEY_FILE = '.secure-term.key';

/** True while an editor or `run` child owns the terminal; see the SIGINT handler. */
let childActive = false;

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

${c.bold('FOR A PROJECT')}
  ${c.dim('Set your project up once, then nobody thinks about it again:')}
    secure-term init                     ${c.dim('# make a project key, gitignore it')}
    secure-term encrypt .env -o .env.enc ${c.dim('# commit .env.enc, never .env')}
    secure-term run -- npm run dev       ${c.dim('# run with the secrets loaded')}
    secure-term edit .env.enc            ${c.dim('# change them in your editor')}
    secure-term backup                   ${c.dim('# seal the key with a memorable phrase')}

  ${c.dim('`run` works with any framework, because it just sets environment')}
  ${c.dim('variables: next dev, vite, django, go run — all the same.')}
  ${c.dim('See: secure-term help project')}

${c.bold('IN A PIPELINE')}
  cat .env | secure-term encrypt | pbcopy
  pbpaste | secure-term decrypt > .env
  secure-term decrypt .env.enc | grep DATABASE_URL

${c.bold('OPTIONS')}
  -o, --out ${c.dim('<file>')}       Write to a file instead of the screen
  -k, --key-file ${c.dim('<file>')}  Read the passphrase from a file ${c.dim(`(default ${KEY_FILE})`)}
  -P, --prompt           Ask for the passphrase, ignoring any key file
  -p, --pepper           Also ask for a second secret ${c.dim('(secure-term help pepper)')}
  -f, --force            Overwrite the output file if it already exists
      --iterations ${c.dim('<n>')}   Key-stretching rounds for new payloads ${c.dim(`(default ${ITERATIONS.toLocaleString()})`)}
      --no-confirm       Do not ask for the passphrase twice when encrypting
      --no-compress      Do not compress, even when it would shrink the payload
  -q, --quiet            Only report errors
  -h, --help             Show this help
  -V, --version          Show the version

${c.bold('LEARN MORE')}
  secure-term help project    ${c.dim('project keys, and any framework in one line')}
  secure-term help backup     ${c.dim('sealing a project key with a memorable phrase')}
  secure-term help pepper     ${c.dim('the optional second secret, and why')}
  secure-term help sharing    ${c.dim('how to get a payload to someone safely')}
  secure-term help scanners   ${c.dim('stopping security scanners flagging payloads')}
  secure-term help env        ${c.dim('sharing a .env file with a teammate')}
  secure-term help format     ${c.dim('the payload format, for other tools')}
  secure-term help limits     ${c.dim('how big it can go, and where it stops')}

${c.yellow(c.bold('IMPORTANT'))}
  ${c.yellow('There is no password reset and no recovery. If you forget the')}
  ${c.yellow('passphrase, the encrypted text is gone permanently. That is what')}
  ${c.yellow('makes it safe to store anywhere — and it means the passphrase')}
  ${c.yellow('needs to be something you genuinely will not lose.')}
`;
}

const TOPICS = {
	limits: `
${c.bold('How big it can go, and where it actually stops')}

  ${c.bold('Text: effectively unlimited')}
  There is no length limit in the format. Measured end to end:

    a .env file          2 KB      under 1 ms
    a novel            300 KB          3 ms
    War and Peace      3.2 MB         29 ms
    ten years of notes  10 MB        122 ms
                       200 MB        3.1 s

  Key derivation costs a flat 150 ms whatever the size, so for anything a
  person writes the content is essentially free and the passphrase is the
  entire cost.

  ${c.bold('The ceiling is memory')}
  Nothing streams — the whole thing is held in memory at once, and peak use
  runs about 20x the input. 200 MB is comfortable on a laptop; 400 MB
  exhausts an 8 GB heap. Beyond that a hard limit waits anyway: the payload
  must fit in one JavaScript string, which caps at 536,870,888 characters.

  ${c.bold('The limit you will actually hit is the channel')}
  A payload is 1.33x the input before compression. The system clipboard is
  not the problem — 50 MB copies fine. Where you paste it is:

    a QR code            2,953 characters   (byte mode, lowest correction)
    a Slack message     40,000 characters   (and it collapses long before)
    a GitHub comment    65,536 characters
    email, or a file    no practical limit

  ${c.bold('Compression')}
  Text is compressed automatically when that makes the payload smaller, which
  moves the pasteable ceiling from roughly 30 KB of text to 80 KB. Measured
  on real prose and source: 2.5x to 3x, so payloads come out 60-67% shorter.

  It is skipped when it would not help — short secrets and anything already
  random get bigger under gzip, so those are left alone. Turn it off entirely
  with --no-compress.

  A novel still will not paste into a chat window, compressed or not. Send
  large text as a file.

  ${c.bold('Binary is not supported')}
  Images, PDFs and archives are refused rather than quietly ruined. Encode
  first if you need to:

    base64 -i file.png | secure-term encrypt -o secret.enc
    secure-term decrypt secret.enc | base64 -d > file.png

  For encrypting files as files, age (https://age-encryption.org) is the
  right tool — it streams, and it does not hold the file in memory.
`,

	backup: `
${c.bold('Turning the randomness back into something you can hold')}

  A project key is 32 random bytes. That is what makes it strong, and it is
  also what makes it a liability: you cannot memorise it, so it has to be
  stored, and wherever you store it is a place someone could find it.

  Every tool leaves this unsolved. Rails writes config/master.key in plain
  text. 1Password tells you to print the Emergency Kit. A wallet tells you to
  write the seed on paper. Every copy of that backup is a copy of the secret.

  This is the tool's original trick applied to itself:

    secure-term backup              # seals ./.secure-term.key
    secure-term backup -k id.age    # or any key file you hold

  It asks for a passphrase you could not forget — a whole sentence works
  best — and seals the key with it. What comes out is meaningless to anyone
  who does not know the phrase, so it can go anywhere:

    printed and put in a drawer          emailed to yourself
    in cloud storage                     photographed
    written on the back of something     in a password manager

  Something impossible to remember, protected by something impossible to
  forget. Nothing memorable is ever written down; the memorable part stays
  in your head and only the sealed form is stored.

  ${c.bold('Getting it back')}
    secure-term restore                  ${c.dim('# paste it, or:')}
    secure-term restore key-backup.txt

  That asks for the same phrase and rebuilds .secure-term.key.

  ${c.bold('It is checked before you are told it worked')}
  'backup' decrypts its own output and compares it to the key before
  reporting success. A backup nobody has ever opened is not a backup, and
  this is the one file where finding out later means the key is gone.

  ${c.bold('Retyping it')}
  The output is printed in short groups because it may be copied by hand.
  Spaces and line breaks are ignored when restoring, so type it as shown.

  ${c.red(c.bold('One rule'))}
  ${c.red('Do not commit the backup to the repository it unlocks.')}
  The repository already holds .env.enc. Putting the sealed key beside it
  means a single guessed passphrase opens both — which is precisely what
  generating a random key avoided. Store the backup somewhere the repository
  is not.

  ${c.bold('A pepper works here too')}
    secure-term backup -p

  Then the backup needs the phrase and a detail that only exists in your
  head. See: secure-term help pepper
`,

	project: `
${c.bold('Project keys — one line for any framework')}

  For a project, typing a passphrase every time is friction nobody accepts,
  and it does not survive being handed to a teammate. Instead, generate a
  key file once:

    secure-term init

  That writes ${KEY_FILE} — 32 random bytes, mode 0600 — and adds it
  to .gitignore. From then on every command finds it automatically.

  ${c.bold('The arrangement')}
    ${KEY_FILE}   ${c.red('never committed')}, shared like any other secret
    .env.enc            ${c.green('committed')}, useless without the key
    .env                ${c.red('never committed')}, and no longer needed

  ${c.bold('Why committing the encrypted file is safe here')}
  A memorable passphrase can be guessed offline for as long as a repository
  exists, so payloads made with one belong in chat, not in git. A generated
  key is 256 bits of randomness and cannot be guessed at all. That is the
  same reasoning behind Rails' config/master.key, and it is why 'init'
  generates a key rather than asking you to invent one.

  ${c.bold('Running anything with the secrets loaded')}
    secure-term run -- npm run dev
    secure-term run -- next dev
    secure-term run -- vite build
    secure-term run -- python manage.py runserver
    secure-term run -- go run ./cmd/server

  There is no framework integration and no plugin, because none is needed:
  'run' decrypts, puts the variables in the environment, and starts your
  command. Every framework already reads environment variables. The
  decrypted values are never written to disk.

  Put it in package.json once and the team never thinks about it:

    "scripts": {
      "dev": "secure-term run -- next dev"
    }

  ${c.bold('Changing a secret')}
    secure-term edit .env.enc

  That opens the decrypted contents in $EDITOR and re-encrypts on save. The
  plaintext exists only in a temporary file while the editor is open, and is
  removed afterwards even if the editor crashes.

  ${c.bold('Production and CI')}
  There is no key file on a server. Put the key in the environment instead,
  the same way you would any other secret:

    SECURE_TERM_PASSPHRASE=$(cat ${KEY_FILE})     ${c.dim('# locally')}
    SECURE_TERM_PASSPHRASE=\${{ secrets.SECURE_TERM_KEY }}  ${c.dim('# CI')}

  Then 'secure-term run -- npm start' works unchanged on the server.

  ${c.bold('Onboarding someone')}
  They clone the repository, you send them the key by a route that is not
  the repository (see: secure-term help sharing), they save it as
  ${KEY_FILE}, and everything works. No shared .env, and nothing
  sensitive in the clone.

  ${c.bold('If you lose the key')}
  The encrypted file cannot be recovered. Back the key up the day you create
  it — either copy it into a password manager, or seal it with a phrase you
  cannot forget so the backup is safe to keep anywhere:

    secure-term backup

  See: secure-term help backup
`,

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
  avoids '+', '/' and '=', so a payload survives being pasted into a URL and
  a double-click selects all of it. A QR code only fits about 2,950
  characters — see: secure-term help limits

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
		compress: true,
		iterations: ITERATIONS,
		help: false,
		version: false,
		topic: null,
		keyFile: null,
		promptForce: false,
		childArgv: null,
		needsConfirm: false,
		usedProjectKey: false
	};

	// Everything after a bare `--` belongs to the child command that
	// `secure-term run` will start, untouched by our own option parsing.
	const separator = argv.indexOf('--');
	if (separator !== -1) {
		options.childArgv = argv.slice(separator + 1);
		argv = argv.slice(0, separator);
	}

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
			case '--no-compress': options.compress = false; break;

			case '-o': case '--out': {
				options.out = rest.shift();
				if (!options.out) throw new UsageError('--out needs a filename after it.');
				break;
			}

			case '-k': case '--key-file': {
				options.keyFile = rest.shift();
				if (!options.keyFile) throw new UsageError('--key-file needs a filename after it.');
				break;
			}

			case '-P': case '--prompt':
				options.promptForce = true;
				break;

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
		h: 'help', help: 'help',
		init: 'init', edit: 'edit', run: 'run',
		backup: 'backup', restore: 'restore'
	};
	if (aliases[lower]) return aliases[lower];

	const suggestions = {
		lock: 'encrypt', scramble: 'encrypt', seal: 'encrypt', hide: 'encrypt',
		unlock: 'decrypt', unscramble: 'decrypt', open: 'decrypt', read: 'decrypt',
		exec: 'run', start: 'run', setup: 'init',
		remember: 'backup', memorize: 'backup', seal_key: 'backup',
		recover: 'restore', recall: 'restore'
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

	// Same reasoning as readInput: verify rather than decode-and-hope, so
	// `cat photo.png | secure-term encrypt` refuses instead of quietly
	// producing a payload that decrypts to a ruined file.
	const decoded = decodeUtf8Strict(Buffer.concat(chunks));
	if (!decoded.ok) {
		throw new IoError(
			'The input is not text, and this tool only handles text.\n' +
			'  Encrypting it would destroy it, silently. Nothing was encrypted.\n\n' +
			'  Pipe it through base64 first:\n' +
			'    base64 -i file.png | secure-term encrypt -o secret.enc\n' +
			'    secure-term decrypt secret.enc | base64 -d > file.png'
		);
	}
	return decoded.text;
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
		let raw;
		try {
			raw = readFileSync(options.file);
		} catch (error) {
			throw new IoError(`Could not read '${options.file}': ${error.message}`);
		}

		// Read as bytes and check, rather than decoding as utf8 and hoping.
		// Reading a PNG with { encoding: 'utf8' } succeeds, silently replacing
		// every invalid byte, and the file is then destroyed with both
		// commands reporting success.
		const decoded = decodeUtf8Strict(raw);
		if (!decoded.ok) {
			throw new IoError(
				`'${options.file}' is not a text file, and this tool only handles text.\n` +
				`  Encrypting it would destroy it: the bytes that are not valid text\n` +
				`  cannot be put back, so you would get a broken file back and no\n` +
				`  warning that it had happened. Nothing was encrypted.\n\n` +
				`  To send a file like this, encode it as text first:\n` +
				`    base64 -i '${options.file}' | secure-term encrypt -o secret.enc\n` +
				`  and on the other end:\n` +
					`    secure-term decrypt secret.enc | base64 -d > '${options.file}'`
			);
		}
		return decoded.text;
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
		let inEscape = false;

		const finish = (fn, arg) => {
			stream.off('data', onData);
			stream.setRawMode(wasRaw);
			stream.pause();
			process.stderr.write('\n');
			fn(arg);
		};

		const onData = (chunk) => {
			for (const ch of chunk.toString('utf8')) {
				// In raw mode an arrow key arrives as ESC [ D. Dropping only the
				// ESC would let its printable tail through, silently embedding
				// "[D" in the passphrase. Consume the whole sequence instead: a
				// letter or '~' is the final byte of CSI and SS3 sequences.
				if (inEscape) {
					if (/[a-zA-Z~]/.test(ch)) inEscape = false;
					continue;
				}
				if (ch === '\u001b') {
					inEscape = true;
					continue;
				}

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

				if (ch === '\u0015') { // Ctrl-U: start the line over
					process.stderr.write('\b \b'.repeat(value.length));
					value = '';
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
/**
 * Read a key file: one line holding the passphrase, the way Rails stores
 * config/master.key. Nothing about the payload format changes — a key file is
 * simply a passphrase that lives in a file, which is why a payload locked
 * with one can still be opened in the web app by pasting the file's contents.
 */
function readKeyFile(path) {
	if (!existsSync(path)) {
		throw new IoError(
			`There is no key file at '${path}'.\n` +
			`  Create one with: secure-term init`
		);
	}

	// Like ssh, warn about a key readable by other local users. A warning
	// rather than a refusal: containers and CI mount files with odd modes.
	if (statSync(path).mode & 0o077) {
		say(c.yellow(`Warning: ${path} is readable by other users on this machine.`));
		say(c.yellow(`  Fix it with: chmod 600 ${path}`));
	}

	const key = readFileSync(path, 'utf8').trim();
	if (!key) throw new IoError(`The key file '${path}' is empty.`);
	return key;
}

/**
 * Collect the passphrase (and pepper, when asked for).
 *
 * Sources, most explicit first:
 *
 *   1. -P / --prompt           always ask, ignoring everything below
 *   2. -k / --key-file <path>  read from the named file
 *   3. SECURE_TERM_PASSPHRASE  the environment (CI, production)
 *   4. ./.secure-term.key      the project key, when one exists here
 *   5. ask at the terminal
 *
 * There is deliberately no --passphrase flag: anything on the command line is
 * visible in `ps` output and lands in shell history.
 */
async function collectSecrets(options) {
	const pepperFromEnv = process.env.SECURE_TERM_PEPPER;
	let passphrase = null;

	// `backup` and `restore` set forbidKeyFile: their whole purpose is to move
	// between the key and a memorable phrase, so letting a key file supply the
	// passphrase would seal the key with itself — circular, and useless as a
	// backup. An explicitly set environment variable is still honoured, since
	// that is a deliberate choice rather than something found lying around.
	const keyFilesAllowed = !options.forbidKeyFile;

	if (!options.promptForce) {
		if (options.keyFile && keyFilesAllowed) {
			passphrase = readKeyFile(options.keyFile);
			if (!options.quiet) say(c.dim(`Using the key from ${options.keyFile}.`));
		} else if (process.env.SECURE_TERM_PASSPHRASE) {
			passphrase = process.env.SECURE_TERM_PASSPHRASE;
			if (!options.quiet) say(c.dim('Using the passphrase from SECURE_TERM_PASSPHRASE.'));
		} else if (existsSync(KEY_FILE) && keyFilesAllowed) {
			passphrase = readKeyFile(KEY_FILE);
			options.usedProjectKey = true;
			if (!options.quiet) say(c.dim(`Using the project key from ${KEY_FILE}.`));
		}
	}

	// A non-typed passphrase needs no confirmation, and the pepper may still
	// come from the environment — in that case no terminal is needed at all.
	if (passphrase !== null && (!options.pepper || pepperFromEnv)) {
		return { passphrase, pepper: pepperFromEnv || '' };
	}

	const terminal = openTerminal();
	if (!terminal) {
		throw new UsageError(
			'No terminal is available to ask for a passphrase.\n' +
			'  This usually means you are in CI, a cron job or a container.\n' +
			'  Set SECURE_TERM_PASSPHRASE in the environment instead:\n' +
			'    SECURE_TERM_PASSPHRASE=... secure-term decrypt .env.enc -o .env\n' +
			'  or use a project key file: secure-term help project'
		);
	}

	// Typing mistakes are unrecoverable when creating a payload, so those
	// flows confirm. Decryption never needs it -- a wrong entry simply fails.
	const confirming = options.confirm &&
		(options.command === 'encrypt' || options.needsConfirm);

	try {
		if (passphrase === null) {
			passphrase = await promptSecret(terminal.stream, 'Passphrase: ');
			if (!passphrase) throw new UsageError('A passphrase is required.');

			if (confirming) {
				const again = await promptSecret(terminal.stream, 'Passphrase again: ');
				if (again !== passphrase) {
					throw new UsageError(
						'Those two passphrases are not the same.\n' +
						'  Nothing was encrypted. Try again.'
					);
				}
			}
		}

		let pepper = pepperFromEnv || '';
		if (options.pepper && !pepper) {
			pepper = await promptSecret(terminal.stream, 'Pepper: ');
			if (confirming && pepper) {
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
	const payload = await encryptText(input, passphrase, pepper, options.iterations, {
		compress: options.compress
	});
	if (!options.quiet) say(c.green('done'));

	if (!options.quiet) reportSize(payload, summary.bytes);

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

/**
 * Say how long the payload is, and name anywhere it will not fit.
 *
 * Producing a payload nobody can paste is a real dead end, and silence about it
 * just moves the discovery to the moment it fails in front of someone else.
 */
function reportSize(payload, inputBytes) {
	const chars = payload.length;

	if (payload.startsWith(`${VERSION_GZIP}.`)) {
		// What the payload would have measured with compression switched off.
		const uncompressed = Math.ceil((inputBytes + 16) / 3) * 4 + 50;
		const saved = Math.round((1 - chars / uncompressed) * 100);
		say(c.dim(`Payload: ${chars.toLocaleString()} characters — compressed, ${saved}% smaller`));
	} else {
		say(c.dim(`Payload: ${chars.toLocaleString()} characters`));
	}

	const wontFit = tooLongFor(chars);
	if (wontFit.length) {
		say(c.yellow(`Too long to paste into ${wontFit.join(', or ')}.`));
		say(c.dim('Send it as a file, or by email, where length is not capped.'));
	}
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

// --------------------------------------------------------- project workflow

/**
 * Create a project key.
 *
 * The key is 32 random bytes, not a phrase someone chose. That distinction is
 * what makes it safe to commit the *encrypted* file alongside it: a memorable
 * passphrase can be attacked offline for as long as the repository exists,
 * while 256 bits of entropy cannot. It is the same reasoning behind Rails'
 * config/master.key.
 */
async function doInit(options) {
	const target = options.keyFile || KEY_FILE;

	if (existsSync(target) && !options.force) {
		throw new IoError(
			`'${target}' already exists.\n` +
			`  Overwriting it would make every file encrypted with it unreadable.\n` +
			`  If you are certain the old key is not in use: secure-term init --force`
		);
	}

	const key = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url');
	writeFileSync(target, `${key}\n`, { mode: 0o600 });

	if (!options.quiet) {
		say(c.green(`Created ${target}`));
		say(c.dim('  32 random bytes. Readable only by you (mode 0600).'));
	}

	const ignored = ensureGitignored(target, options);

	if (!options.quiet) {
		if (ignored === 'added') {
			say(c.green('Added it to .gitignore'));
		} else if (ignored === 'already') {
			say(c.dim('Already covered by .gitignore'));
		} else if (ignored === 'no-repo') {
			say(c.yellow('No .gitignore here — if this is a repository, add this line:'));
			say(c.yellow(`    ${target}`));
		}

		say('');
		say(c.bold('Next:'));
		say(`  secure-term encrypt .env -o .env.enc   ${c.dim('# commit .env.enc, not .env')}`);
		say(`  secure-term run -- npm run dev         ${c.dim('# run with the secrets loaded')}`);
		say('');
		say(c.yellow(`Back up ${target}. Lose it and the encrypted file`));
		say(c.yellow('cannot be recovered — there is no reset.'));
		say('');
		say(`  ${c.bold('secure-term backup')}   ${c.dim('seal it with a phrase you cannot forget,')}`);
		say(`                       ${c.dim('so the backup is safe to store anywhere')}`);
		say(c.dim('  or copy the file into a password manager.'));
		say('');
		say(c.dim('Share it with teammates the way you would any other secret:'));
		say(c.dim('  secure-term help sharing'));
	}

	return EXIT.OK;
}

/**
 * Make sure the key file is ignored by git.
 *
 * The single most damaging mistake available here is committing the key next
 * to the ciphertext it unlocks, so this is done automatically rather than
 * left as advice in a README nobody rereads.
 *
 * @returns {'added'|'already'|'no-repo'}
 */
function ensureGitignored(target, options) {
	const isRepo = existsSync('.git') || existsSync('.gitignore');
	if (!isRepo) return 'no-repo';

	const line = target.startsWith('/') ? target : `/${target}`;
	const existing = existsSync('.gitignore') ? readFileSync('.gitignore', 'utf8') : '';

	const alreadyListed = existing
		.split(/\r?\n/)
		.map((entry) => entry.trim())
		.some((entry) => entry === target || entry === line || entry === `${target}*`);

	if (alreadyListed) return 'already';

	const prefix = existing && !existing.endsWith('\n') ? '\n' : '';
	appendFileSync(
		'.gitignore',
		`${prefix}\n# Secure Terminal project key — never commit this\n${line}\n`
	);
	return 'added';
}

/**
 * Does this look like a project key rather than something else?
 *
 * Used when restoring, so that recovering the wrong blob — a .env.enc, say —
 * fails with an explanation instead of quietly installing a key file full of
 * environment variables that then fails to decrypt anything.
 */
function looksLikeKey(text) {
	const trimmed = text.trim();
	return !trimmed.includes('\n') && /^[A-Za-z0-9_-]{32,}$/.test(trimmed);
}

/**
 * Break a payload into short groups on short lines.
 *
 * Only for display: a backup is meant to be printed and possibly retyped, and
 * an unbroken 120-character string is miserable to transcribe. Decryption
 * strips whitespace, so the grouped form pastes back in as-is.
 */
function forTranscription(payload) {
	const groups = payload.match(/.{1,8}/g) ?? [];
	const lines = [];
	for (let i = 0; i < groups.length; i += 5) {
		lines.push(`    ${groups.slice(i, i + 5).join(' ')}`);
	}
	return lines;
}

/**
 * Seal the project key with a passphrase a human can remember.
 *
 * This is the original idea turned on the tool itself. The project key is 32
 * bytes of randomness — unrememberable by construction — so it has to be
 * stored somewhere, and Rails stores it as plaintext, which means backing it
 * up puts a plaintext key wherever the backup goes.
 *
 * Sealed with a memorable phrase, the backup can live anywhere the phrase does
 * not: printed in a drawer, in cloud storage, in an email to yourself, in a
 * photograph. Something impossible to remember, protected by something
 * impossible to forget.
 */
async function doBackup(options) {
	const source = options.keyFile || KEY_FILE;
	const key = readKeyFile(source);

	if (!options.quiet) {
		say(c.dim(`Sealing the key from ${source}.`));
		say(c.dim('Choose a passphrase you could not forget — a whole sentence is'));
		say(c.dim('ideal. It is the only thing that will open this backup, and'));
		say(c.dim('there is no way to recover it.'));
		say('');
	}

	// The key itself must never act as its own backup passphrase, and the
	// project key file is sitting right there, so ignore every automatic
	// source and insist on something typed.
	const asked = { ...options, forbidKeyFile: true, needsConfirm: true, quiet: true };
	const { passphrase, pepper } = await collectSecrets(asked);

	const payload = await encryptText(key, passphrase, pepper, options.iterations);

	// Verify before claiming success. A backup that has never been opened is
	// not a backup, and this is the one artefact where discovering the problem
	// later means the key is gone for good.
	const recovered = await decryptText(payload, passphrase, pepper);
	if (recovered !== key) {
		throw new IoError('The backup failed to verify. Nothing was written.');
	}

	writeOutput(payload, options);

	// Warning the user not to commit it and then leaving it trackable would be
	// advice where a safeguard belongs. Same reasoning as init.
	const ignored = options.out ? ensureGitignored(options.out, options) : null;

	if (!options.quiet) {
		say('');
		say(c.green('Backup verified — it decrypts back to your key.'));
		if (ignored === 'added') {
			say(c.green(`Added ${options.out} to .gitignore — but see below.`));
		}

		if (!options.out) {
			say('');
			say(c.bold('Write this down, or keep it somewhere you will find it:'));
			say('');
			for (const line of forTranscription(payload)) say(c.green(line));
			say('');
			say(c.dim('Spaces and line breaks are ignored when restoring, so it can be'));
			say(c.dim('retyped in these groups.'));
		} else {
			say(c.green(`Written to ${options.out}`));
		}

		say('');
		say('Safe to store anywhere your passphrase is not: print it, email it to');
		say('yourself, put it in cloud storage, photograph it. It is useless to');
		say('anyone who does not know the phrase.');
		say('');
		say(c.yellow(c.bold('Do not commit it to this repository.')));
		say(c.yellow('This repository already holds .env.enc. Keeping both in one place'));
		say(c.yellow('means one guessed passphrase opens everything, which is exactly'));
		say(c.yellow('what the generated key was protecting you from.'));
		say('');
		say(c.dim('Recover it later with: secure-term restore'));
	}

	return EXIT.OK;
}

/**
 * Rebuild the project key from a sealed backup.
 *
 * The other half of doBackup: on a new machine, or after losing the key file,
 * this turns the stored blob plus what is in your head back into
 * .secure-term.key.
 */
async function doRestore(options) {
	const target = options.out || KEY_FILE;

	if (existsSync(target) && !options.force) {
		throw new IoError(
			`'${target}' already exists.\n` +
			`  Restoring over it would replace the key this project is using.\n` +
			`  If that is what you want: secure-term restore --force`
		);
	}

	if (!options.file && process.stdin.isTTY && !options.quiet) {
		say(c.dim('Paste the backup, then press Ctrl-D:'));
	}
	const blob = options.file ? readFileSync(options.file, 'utf8') : await readStdin();

	if (!blob.trim()) {
		throw new UsageError('There is nothing to restore — the input was empty.');
	}

	// Always ask: the point of a backup is that it is opened by memory, and a
	// key file that happens to be lying around must not be used by accident.
	const asked = { ...options, forbidKeyFile: true, quiet: true };
	const { passphrase, pepper } = await collectSecrets(asked);

	const key = (await decryptText(blob, passphrase, pepper)).trim();

	// The shape check guards the default path only. Restoring a .env.enc by
	// mistake would otherwise install a file of environment variables as the
	// project key, which fails later and confusingly.
	//
	// When an output is named explicitly, the user has said what they are
	// recovering and where it goes — and a sealed artefact is legitimately any
	// shape: an age identity with comment lines above the key, a printed
	// recovery code, a wallet seed phrase. Refusing those would make `backup
	// -k <anything>` a one-way trip.
	if (!options.out && !looksLikeKey(key)) {
		throw new UsageError(
			'That decrypted correctly, but it does not contain a project key.\n' +
			'  It looks like a backup of something else — a .env.enc, perhaps.\n' +
			'  If you meant to recover it somewhere specific, name the file:\n' +
			'    secure-term restore <backup> -o <file>\n' +
			'  To recover ordinary encrypted text, use: secure-term decrypt'
		);
	}

	writeFileSync(target, `${key}\n`, { mode: 0o600 });
	const ignored = ensureGitignored(target, options);

	if (!options.quiet) {
		say(c.green(`Restored ${target}`));
		if (ignored === 'added') say(c.green('Added it to .gitignore'));
		say('');
		say(c.dim('Check it against this project:'));
		say('  secure-term run -- npm run dev');
	}

	return EXIT.OK;
}

/**
 * Decrypt into a temporary file, open $EDITOR, re-encrypt on save.
 *
 * The plaintext exists on disk only while the editor is open, in a file
 * created 0600, and is removed even if the editor exits badly. This is the
 * `rails credentials:edit` shape: you never manage the decrypted file
 * yourself, so there is no plaintext left lying around to forget about.
 */
async function doEdit(options) {
	const target = options.file || '.env.enc';
	const editor = process.env.SECURE_TERM_EDITOR || process.env.VISUAL || process.env.EDITOR;

	if (!editor) {
		throw new UsageError(
			'No editor is configured, so there is nothing to open.\n' +
			'  Set one for this shell:\n' +
			'    export EDITOR=nano\n' +
			'  or edit the file the long way:\n' +
			`    secure-term decrypt ${target} -o .env`
		);
	}

	const creating = !existsSync(target);

	// A new file is being authored, so a typed passphrase must be confirmed
	// exactly as it would be for `encrypt`.
	options.needsConfirm = creating;
	const { passphrase, pepper } = await collectSecrets(options);

	let plaintext = '';
	if (creating) {
		if (!options.quiet) say(c.dim(`${target} does not exist yet — creating it.`));
		plaintext = '# Secrets for this project. Encrypted on save.\n\n';
	} else {
		plaintext = await decryptText(readFileSync(target, 'utf8').trim(), passphrase, pepper);
	}

	// Keep the .env suffix so editors apply the right syntax highlighting.
	const scratch = join(tmpdir(), `secure-term-${process.pid}-${Date.now()}.env`);
	writeFileSync(scratch, plaintext, { mode: 0o600 });

	try {
		const status = await runChild(editor, [scratch], { shell: true });
		if (status !== 0) {
			throw new IoError(`The editor exited with status ${status}. ${target} is unchanged.`);
		}

		const edited = readFileSync(scratch, 'utf8');

		if (edited === plaintext) {
			if (!options.quiet) say(c.dim('No changes — nothing re-encrypted.'));
			return EXIT.OK;
		}
		if (!edited.trim()) {
			throw new UsageError(`The file was left empty, so ${target} is unchanged.`);
		}

		const payload = await encryptText(edited, passphrase, pepper, options.iterations);

		// Write via a temporary file in the same directory and rename, so an
		// interruption cannot leave a half-written payload where the real one
		// was. rename is atomic within a filesystem.
		const pending = `${target}.tmp-${process.pid}`;
		writeFileSync(pending, `${payload}\n`, { mode: 0o600 });
		renameSync(pending, target);

		if (!options.quiet) {
			say(c.green(`Saved ${target}`));
			const summary = summarize(edited);
			if (summary.kind === 'env') say(c.dim(`  ${describe(summary).join('\n  ')}`));
		}

		return EXIT.OK;
	} finally {
		try { unlinkSync(scratch); } catch { /* already gone */ }
	}
}

/**
 * Decrypt, then run a command with the secrets in its environment.
 *
 * This is the piece that makes the tool framework-agnostic. Every framework
 * worth the name reads configuration from environment variables, so injecting
 * them into a child process works for Next.js, Vite, Django, Go and anything
 * else without a plugin for any of them. The decrypted values never touch the
 * disk at all.
 */
async function doRun(options) {
	if (!options.childArgv || options.childArgv.length === 0) {
		throw new UsageError(
			'`run` needs a command to run, after a double dash.\n' +
			'    secure-term run -- npm run dev\n' +
			'    secure-term run -- next dev\n' +
			'  The dashes keep the command\'s own options away from this one.'
		);
	}

	const target = options.file || '.env.enc';
	if (!existsSync(target)) {
		throw new IoError(
			`There is no '${target}' here.\n` +
			`  Create one with: secure-term encrypt .env -o ${target}\n` +
			`  Or point at a different file: secure-term run ${'<file>'} -- ${options.childArgv.join(' ')}`
		);
	}

	const { passphrase, pepper } = await collectSecrets(options);
	const plaintext = await decryptText(readFileSync(target, 'utf8').trim(), passphrase, pepper);
	const vars = parseEnv(plaintext);
	const names = Object.keys(vars);

	if (names.length === 0) {
		say(c.yellow(`Warning: no variables found in ${target}. Running anyway.`));
	} else if (!options.quiet) {
		say(c.dim(`Loaded ${names.length} variable${names.length === 1 ? '' : 's'} from ${target}`));
		say(c.dim(`  ${names.join(', ')}`));
	}

	const [command, ...args] = options.childArgv;

	// The real environment wins over the file. That way a one-off override --
	// `PORT=4000 secure-term run -- npm start` -- behaves the way anyone would
	// expect, and CI-injected values are not silently replaced by stale ones.
	const inherited = Object.keys(vars).filter((name) => name in process.env);
	if (inherited.length && !options.quiet) {
		say(c.dim(`  (already set in this shell, left alone: ${inherited.join(', ')})`));
	}

	const childEnv = { ...vars, ...process.env };

	childActive = true;
	const status = await runChild(command, args, { env: childEnv });
	childActive = false;

	// Pass the child's exit code straight through, so this composes with `npm
	// test`, CI and anything else that inspects it.
	return status;
}

/**
 * Run a command with our stdio, resolving to its exit code.
 *
 * Signals are reported as the conventional 128 + signal number, which is what
 * a shell would report for the same command.
 */
function runChild(command, args, { env = process.env, shell = false } = {}) {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, { stdio: 'inherit', env, shell });

		child.on('error', (error) => {
			reject(
				error.code === 'ENOENT'
					? new IoError(
						`Could not run '${command}' — no such command.\n` +
						`  Check it is installed and on your PATH.`
					)
					: error
			);
		});

		child.on('close', (code, signal) => {
			resolve(signal ? 128 + (osConstants.signals[signal] ?? 0) : (code ?? 0));
		});
	});
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

	const actions = {
		encrypt: doEncrypt,
		decrypt: doDecrypt,
		init: doInit,
		edit: doEdit,
		run: doRun,
		backup: doBackup,
		restore: doRestore
	};

	try {
		return await actions[options.command](options);
	} catch (error) {
		return report(error, options);
	}
}

process.on('SIGINT', () => {
	// While a child owns the terminal, Ctrl-C went to it as well as to us.
	// Claiming "nothing was written" would be a lie -- the editor or dev
	// server may well have written something -- and printing over its output
	// is noise. Let the child's own exit path report.
	if (childActive) return;

	say(c.dim('\nCancelled. Nothing was written.'));
	process.exit(EXIT.INTERRUPTED);
});

main(process.argv.slice(2)).then((code) => {
	process.exitCode = code;
});
