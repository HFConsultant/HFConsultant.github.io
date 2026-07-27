# Secure Terminal

**Turn something you must not lose into something you cannot read — using a
phrase you will never forget.**

A terminal-style web app and a matching CLI that encrypt text entirely on your
own machine. No server, no account, no storage, no analytics. Install it once
and it works offline.

## Live Demo

[View my project here](https://hfconsultant.github.io/)

## The idea

Some things have to be written down, and writing them down is the whole
problem. A crypto wallet's twelve-word recovery phrase is the clearest example:
it must be stored somewhere, and anywhere you store it as plain text is a
place someone can find it.

So don't store it as plain text. Encrypt it with **a sentence you could not
forget if you tried**, plus a personal detail nobody else knows:

```
Wallet phrase:  wagon rhythm exotic stand lens fortune brief grain siren wheel
Passphrase:     My dog Rex ate pizza in Paris last summer
Pepper:         2019
```

What comes out is unintelligible, and now it is safe to put somewhere unsafe —
a notes app, a printed page, cloud storage, a photo in your camera roll. To get
the wallet back, paste it in and supply the same sentence and the same detail.

**Nothing memorable is ever stored. The memorable part is the key, not the
output** — it stays in your head, and there is no copy of it anywhere.

## What else it is good for

The same shape solves a problem developers hit constantly: **a teammate needs
your `.env` and there is no safe way to send it.** Pasting live credentials into
Slack puts them in a searchable archive forever.

```bash
secure-term encrypt .env -o .env.enc
```

Send `.env.enc` through Slack. Tell them the passphrase on a call — not in the
same channel. On their end:

```bash
secure-term decrypt .env.enc -o .env
```

Also useful for: sending a password to a colleague, keeping journal entries or
notes private, storing recovery codes, and putting anything sensitive through a
channel you do not fully trust.

See [`docs/scanners.md`](docs/scanners.md) for keeping encrypted payloads from
tripping gitleaks and similar tools.

## What it looks like

Type `e`, give it your text and a passphrase, and you get back a payload:

```
STv1.600000.WGo4u3ng….YkgymM….odYexKpVxxg…
```

Type `d`, paste it back with the same passphrase, and your text returns. That
is the whole application.

### Commands

| Command | Does                                                    |
| ------- | ------------------------------------------------------- |
| `e`     | Encrypt some text — paste as many lines as you like     |
| `d`     | Decrypt a payload                                       |
| `c`     | Clear the screen                                        |
| `h`     | Show help                                               |
| `about` | How it works, and what it does not protect against      |
| `Esc`   | Cancel the current step                                 |
| `↑` `↓` | Previous commands                                       |

You can also **drag a file straight onto the window**. A `.env` is read and
encrypted; a `.enc` is recognised and decrypted. The file is read in the
browser and goes nowhere.

When the content looks like a `.env`, the app reports the variable **names** it
found and never the values — so you can confirm you have the right file with
someone watching your screen.

## The command line

Same encryption, same payload format, same core module — a payload made on your
phone opens in your terminal and vice versa.

```bash
npx secure-term --help          # no install
npm install -g secure-term      # or keep it around
```

Needs Node 20 or newer. Zero dependencies — the whole package is about 21 kB.

```bash
secure-term encrypt .env -o .env.enc     # scramble a file
secure-term decrypt .env.enc -o .env     # turn it back
cat .env | secure-term encrypt | pbcopy  # straight to the clipboard
secure-term decrypt .env.enc | grep DATABASE_URL
```

The payload is the only thing written to stdout — every prompt and message goes
to stderr — so it composes properly in a pipeline.

`secure-term --help` leads with worked examples before the options table, and
`secure-term help <topic>` covers `pepper`, `sharing`, `scanners`, `env` and
`format` in depth. There is deliberately **no `--passphrase` flag**: anything on
the command line shows up in `ps` and in shell history. For automation, set
`SECURE_TERM_PASSPHRASE` in the environment.

## Using it in a project — any framework

Rails solves the committed-secrets problem with `config/master.key`: the
encrypted file is committed, the key is not. That pattern is good, and there is
nothing Rails-specific about it. Here it is, for anything:

```bash
secure-term init                      # generate a project key, gitignore it
secure-term encrypt .env -o .env.enc  # commit .env.enc — never .env
secure-term run -- npm run dev        # run with the secrets loaded
secure-term edit .env.enc             # change them in $EDITOR
```

After `init`, every command finds the key automatically. Nobody types a
passphrase again.

| File                | In git?           | What it is                            |
| ------------------- | ----------------- | ------------------------------------- |
| `.secure-term.key`  | **never**         | 32 random bytes, mode 0600            |
| `.env.enc`          | **yes**           | useless without the key               |
| `.env`              | **never**         | no longer needed at all               |

### Why committing the encrypted file is safe here

Elsewhere this README says payloads belong in chat, not in git — and that is
right *for a passphrase you chose*, because committed ciphertext can be
attacked offline for as long as the repository exists.

A key from `init` is different: 32 bytes from the system random source, not a
phrase anyone invented. There is no guessing attack against 256 bits of
entropy. Same reasoning Rails relies on, and the reason `init` **generates** a
key rather than asking you to think one up.

### One line, every framework

There is no Next.js plugin, and there never will be, because none is needed.
`run` decrypts, puts the variables in the environment, and starts your command
— and every framework already reads environment variables:

```bash
secure-term run -- next dev
secure-term run -- vite build
secure-term run -- python manage.py runserver
secure-term run -- go run ./cmd/server
secure-term run -- rails server
```

Wire it into `package.json` once and the team stops thinking about it:

```json
{
  "scripts": {
    "dev": "secure-term run -- next dev",
    "build": "secure-term run -- next build"
  }
}
```

The decrypted values are **never written to disk** — they go straight into the
child process's environment. Anything already set in your shell wins, so
`PORT=4000 npm run dev` still behaves the way you expect.

### Production and CI

Servers have no key file. Put the key in the environment, like any other
secret, and the same command works unchanged:

```yaml
# GitHub Actions
env:
  SECURE_TERM_PASSPHRASE: ${{ secrets.SECURE_TERM_KEY }}
run: secure-term run -- npm start
```

### Onboarding

They clone, you send them the key by a route that is not the repository, they
save it as `.secure-term.key`, and `npm run dev` works. No shared `.env`,
nothing sensitive in the clone.

And because a key file is just a passphrase that lives in a file, the format
never changed: paste the key into the [web app](https://hfconsultant.github.io/)
and it will open the same `.env.enc` on your phone.

Full detail: `secure-term help project`.

### Using it as a library

The core is exported too, so the format is not locked inside either front-end:

```js
import { encryptText, decryptText } from 'secure-term';
import { summarize } from 'secure-term/envfile';

const payload = await encryptText('hello', 'passphrase');
const back = await decryptText(payload, 'passphrase');
```

The same module runs unmodified in a browser — it uses only standard Web
Crypto, with no Node-specific imports.

### The pepper

Every flow offers an optional **pepper**: a second secret mixed into the key
alongside the passphrase. It is useful when the passphrase is something you
might be compelled or tricked into revealing, since the pepper can be a detail
that lives only in your head — a year, a street name, a nickname.

It is not a backup. Lose either the passphrase or the pepper and the text is
gone permanently. There is no recovery, by design.

## How it works

```
passphrase [+ pepper]
        │
        ▼
   PBKDF2-HMAC-SHA256          600,000 iterations, 16-byte random salt
        │
        ▼
   AES-256-GCM key             non-extractable CryptoKey
        │
        ▼
   AES-256-GCM encrypt         12-byte random IV, authenticated
        │
        ▼
   STv1.<iterations>.<salt>.<iv>.<ciphertext>
```

Everything runs through the browser's built-in [Web Crypto
API](https://developer.mozilla.org/docs/Web/API/Web_Crypto_API). There is no
hand-rolled cryptography and no third-party crypto library.

### Payload format

```
STv1.<iterations>.<salt>.<iv>.<ciphertext>
```

| Field        | Encoding  | Notes                                         |
| ------------ | --------- | --------------------------------------------- |
| `STv1`       | literal   | Format version                                |
| `iterations` | decimal   | PBKDF2 iteration count used for this payload  |
| `salt`       | base64url | 16 bytes, random per payload                  |
| `iv`         | base64url | 12 bytes, random per payload                  |
| `ciphertext` | base64url | AES-GCM output, includes the 16-byte auth tag |

Two decisions worth calling out:

- **The iteration count travels with the payload.** Raising the default in a
  future release cannot orphan a payload you encrypted today.
- **base64url, not base64.** No `+`, `/` or `=`, so a payload survives being
  pasted into a URL or a QR code, and double-clicking selects the whole thing.

Payloads written by the pre-2.0 version of this app still decrypt. New payloads
are never written in that format.

## What this protects against, and what it does not

**It protects against** someone reading the payload: a leaked note file, a
synced clipboard, a screenshot in a chat backup, a stolen phone where the
payload is sitting in a notes app.

**It does not protect against:**

- A compromised device. A keylogger or malicious browser extension sees your
  passphrase as you type it.
- Someone watching your screen. Secrets are masked as you type and never
  written to the page, but the decrypted result is displayed.
- A weak passphrase. PBKDF2 raises the cost of guessing; it does not make
  `password123` safe.
- Anyone who has both your payload and your passphrase.

This is a personal project, not an audited cryptosystem. It uses standard
primitives in a standard way, but it has not been independently reviewed.
**Do not stake anything irreplaceable on it without a backup you control.**

### Privacy

Nothing is uploaded, because there is nowhere to upload it to. The page's
Content Security Policy sets `connect-src 'none'`, so the app is structurally
incapable of making a network request — enforced by the browser, not by
promise. There are no third-party scripts, no fonts from a CDN, no analytics,
and no cookies. Nothing is written to `localStorage`; reload the page and the
session is gone.

You can verify all of this rather than take it on trust: it is about 2,000
lines of unminified, dependency-free JavaScript, and the network tab stays
empty after load. The CLI has no dependencies either — the published package is
about 21 kB.

## Install

The app is a PWA, so it can be installed and used offline:

- **Desktop:** open the [live demo](https://hfconsultant.github.io/) and click
  the install icon in the address bar.
- **iOS:** Share → *Add to Home Screen*.
- **Android:** menu → *Install app*.

## Development

No build step and no dependencies. Serve the directory over HTTP — ES modules
will not load from `file://`:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

The CLI runs straight from the checkout:

```bash
node cli/secure-term.js --help
```

### Tests

A dependency-free suite under Node's built-in runner — 67 tests at the time of
writing; `npm test` is the source of truth:

```bash
npm test
```

The crypto tests run against Node's Web Crypto — the same standard API the
browser provides — so `js/crypto.js` is exercised unmodified. They cover
round-trips, unicode, salt and IV uniqueness, tamper rejection, malformed
payloads, passphrase/pepper separation and pre-2.0 compatibility.

The rest guard things that are invisible until they break in front of a user:
that every module reached through an import is precached (the bug that broke
offline support for a year), that the CSP has not regained `unsafe-inline`,
that the summary never prints a secret value, and that no `--passphrase` flag
has been added as a convenience.

### Releasing

The published package is a deliberate subset of the repository: npm gets the
CLI and the shared core, GitHub Pages serves the site from the same commit.
`tests/package.test.js` follows the CLI's imports and fails if any of them fall
outside the `files` whitelist, so the package cannot be published missing a
module it needs.

To cut a release:

1. Bump `version` in `package.json`. A test asserts the CLI reports the same
   version, so `secure-term --version` cannot drift.
2. Push, and let CI pass.
3. Create a GitHub Release. That triggers `.github/workflows/publish.yml`,
   which re-runs the tests, refuses to publish a version already on npm, and
   publishes with provenance.

Publishing needs an `NPM_TOKEN` repository secret (an npm automation token).
Without it the workflow is inert, which is the safe default — nothing publishes
on an ordinary push.

### Layout

```
index.html            markup and Content Security Policy
css/style.css         styles
js/crypto.js          encryption core — no DOM, runs in browser and Node
js/envfile.js         .env summarising — names only, never values
js/envparse.js        .env parsing with values — CLI only, feeds `run`
js/terminal.js        web UI and command flow — no cryptography
js/register-sw.js     service worker registration
cli/secure-term.js    command line front-end
service-worker.js     offline caching
docs/scanners.md      keeping payloads out of secret-scanner alerts
tests/                crypto, .env, CLI, asset and packaging tests
```

One core, two front-ends. `js/crypto.js` touches no DOM and performs no I/O;
`terminal.js` and `cli/secure-term.js` are both thin shells over it and neither
does any cryptography of its own. That is what lets a payload made in a browser
open in a terminal, and it means the part that matters can be read and tested
on its own.

## Browser support

Needs Web Crypto and ES modules — Chrome, Edge, Firefox and Safari, current
versions. Web Crypto requires a secure context, so the app works over HTTPS or
on `localhost`, but not from a `file://` URL.

## Documentation

- [docs/scanners.md](docs/scanners.md) — secret scanners, false positives, and
  why payloads do not belong in git
- [PROMPTS.md](PROMPTS.md) — the prompt history behind this project
- [SECURITY.md](SECURITY.md) — threat model and how to report an issue
- [LICENSE](LICENSE) — MIT

## License

MIT — see [LICENSE](LICENSE).
