# Secure Terminal

**Turn something you must not lose into something nobody can read — using a
phrase you could never forget.**

A terminal-style web app and a matching CLI that encrypt text entirely on your
own machine. No server, no account, no storage, no analytics. Install it once and
it works offline.

## Live Demo

[View my project here](https://hfconsultant.github.io/)

## What do you want to do?

| I want to… | Do this |
| ---------- | ------- |
| Store a wallet seed phrase safely | Open the [web app](https://hfconsultant.github.io/), press `e` |
| Send a teammate my `.env` | `secure-term encrypt .env -o .env.enc` |
| Share secrets across a whole project | `secure-term init`, then `secure-term run -- npm run dev` |
| Never lose my project key | `secure-term backup` |
| Get a lost key back | `secure-term restore` |
| Understand the limits | `secure-term help limits` |

```bash
npx secure-term --help     # nothing to install
```

## The idea

Some things have to be written down, and writing them down is the whole problem.
A wallet's twelve-word recovery phrase is the clearest case: it must be stored
somewhere, and anywhere you store it as plain text is somewhere it can be found.

So don't store it as plain text. Encrypt it with **a sentence you could not
forget if you tried**, plus a personal detail nobody else knows:

```
Wallet phrase:  wagon rhythm exotic stand lens fortune brief grain siren wheel
Passphrase:     My dog Rex ate pizza in Paris last summer
Pepper:         2019
```

What comes out is meaningless, and now it is safe to keep somewhere unsafe — a
notes app, a printed page, cloud storage, a photo in your camera roll. To get the
wallet back, paste it in and supply the same sentence and the same detail.

**Nothing memorable is ever stored.** The memorable part is the *key*, not the
output; it stays in your head, and no copy of it exists anywhere.

The **pepper** is that optional second secret. It helps when the passphrase is
something you could be persuaded or compelled to reveal, since a pepper can be a
detail that was never typed anywhere. It is not a backup — lose either half and
the text is gone, permanently and by design.

## The web app

Type `e`, give it your text and a passphrase, and you get a payload back. Type
`d`, paste it with the same passphrase, and your text returns. That is the whole
application.

| Command | Does |
| ------- | ---- |
| `e` | Encrypt — paste as many lines as you like |
| `d` | Decrypt a payload |
| `c` | Clear the screen |
| `h` | Help |
| `about` | How it works, and what it does not protect against |
| `Esc` | Cancel the current step |
| `↑` `↓` | Previous commands |

You can also **drag a file onto the window** — a `.env` gets encrypted, a `.enc`
gets opened. The file is read in the browser and goes nowhere.

When content looks like a `.env`, the app lists the variable **names** it found
and never the values, so you can confirm you have the right file with someone
watching your screen.

## The command line

Same encryption, same format, same core module — a payload made on your phone
opens in your terminal and vice versa.

```bash
npx secure-term --help          # no install
npm install -g secure-term      # or keep it around
```

```bash
secure-term encrypt .env -o .env.enc     # scramble a file
secure-term decrypt .env.enc -o .env     # turn it back
cat .env | secure-term encrypt | pbcopy  # straight to the clipboard
secure-term decrypt .env.enc | grep DATABASE_URL
```

Needs Node 20 or newer. Zero dependencies; the published package is 40 kB.

The payload is the only thing on stdout — prompts and messages go to stderr — so
it composes in a pipeline. There is deliberately **no `--passphrase` flag**:
anything on a command line shows up in `ps` and in shell history. For automation,
set `SECURE_TERM_PASSPHRASE`.

`secure-term --help` leads with worked examples before the options table, and
`secure-term help <topic>` goes deeper on `project`, `backup`, `pepper`,
`sharing`, `scanners`, `env`, `format` and `limits`.

## In a project — any framework

Rails solves committed secrets with `config/master.key`: the encrypted file is
committed, the key is not. Nothing about that is Rails-specific.

```bash
secure-term init                      # generate a project key, gitignore it
secure-term encrypt .env -o .env.enc  # commit .env.enc — never .env
secure-term run -- npm run dev        # run with the secrets loaded
secure-term edit .env.enc             # change them in $EDITOR
```

After `init`, every command finds the key automatically. Nobody types a
passphrase again.

| File | In git? | What it is |
| ---- | ------- | ---------- |
| `.secure-term.key` | **never** | 32 random bytes, mode 0600 |
| `.env.enc` | **yes** | useless without the key |
| `.env` | **never** | no longer needed at all |

**Why committing the encrypted file is safe here**, when this README otherwise
says payloads belong in chat: that advice is right for a passphrase *you chose*,
because committed ciphertext can be attacked offline for as long as the
repository exists. A key from `init` is 32 bytes of system randomness, and there
is no guessing attack against 256 bits. That is why `init` **generates** a key
rather than asking you to invent one.

### One line, every framework

There is no Next.js plugin and there never will be, because none is needed.
`run` decrypts, puts the values in the environment, and starts your command —
and every framework already reads environment variables:

```bash
secure-term run -- next dev
secure-term run -- vite build
secure-term run -- python manage.py runserver
secure-term run -- go run ./cmd/server
```

Wire it into `package.json` once and the team stops thinking about it:

```json
{ "scripts": { "dev": "secure-term run -- next dev" } }
```

Decrypted values are **never written to disk** — they go straight into the child
process. Anything already set in your shell wins, so `PORT=4000 npm run dev`
behaves as expected.

**On a server**, there is no key file; put the key in the environment like any
other secret and the same command works unchanged:

```yaml
# GitHub Actions
env:
  SECURE_TERM_PASSPHRASE: ${{ secrets.SECURE_TERM_KEY }}
run: secure-term run -- npm start
```

**Onboarding someone**: they clone, you send them the key by a route that is not
the repository, they save it as `.secure-term.key`, and `npm run dev` works.

Full detail in `secure-term help project`.

## Never losing the key

This is where it goes further than Rails.

A project key is 32 random bytes. That strength is exactly what makes it
awkward — you cannot memorise it, so it must be *stored*, and Rails stores
`master.key` as plaintext, which means every copy of the backup is a copy of the
key. So seal it with the thing this whole app was built around:

```bash
secure-term backup
```

```
Backup verified — it decrypts back to your key.

Write this down, or keep it somewhere you will find it:

    STv1.600 000.5pdE dmspiG-O JJhH8OLF dA.KBLaQ
    bAEeync8 XmB.y44G LOon_uNC CkyCOz5A WeiVAwVe
    nzVgVKm1 QFFo-tXl Mv4UYs4e IMwFAhyZ HTiy4fj7
    tKIBxOTD EvA
```

Safe to keep anywhere your passphrase is not: printed in a drawer, in cloud
storage, emailed to yourself, photographed. Lost the key file?
`secure-term restore` rebuilds it from the phrase in your head.

- **It verifies itself.** `backup` decrypts its own output and compares it to the
  key before reporting success. A backup nobody has opened is not a backup, and
  this is the one file where finding out later means the key is gone.
- **It prints in groups because you may retype it.** Whitespace is ignored on
  restore, so it can be copied off paper exactly as shown.
- **A pepper works here too** (`backup -p`).

> **Never commit a sealed backup to the repository it unlocks.** That repository
> already holds `.env.enc`; storing both together means one guessed passphrase
> opens everything — precisely what a random key avoided. `backup` gitignores its
> own output, but the real rule is to keep it somewhere else entirely.

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

All of it through the browser's built-in [Web Crypto
API](https://developer.mozilla.org/docs/Web/API/Web_Crypto_API) — no hand-rolled
cryptography, no third-party crypto library.

### Payload format

```
STv1.<iterations>.<salt>.<iv>.<ciphertext>     plaintext is UTF-8 text
STv2.<iterations>.<salt>.<iv>.<ciphertext>     plaintext is gzip of that text
```

| Field | Encoding | Notes |
| ----- | -------- | ----- |
| version | literal | `STv1` raw, `STv2` gzip-compressed |
| `iterations` | decimal | PBKDF2 rounds used for *this* payload |
| `salt` | base64url | 16 bytes, random per payload |
| `iv` | base64url | 12 bytes, random per payload |
| `ciphertext` | base64url | AES-GCM output, includes the 16-byte tag |

- **The iteration count travels with the payload**, so raising the default later
  cannot orphan anything encrypted today.
- **The version is the content encoding.** No flag field, so compression costs
  nothing on the wire — which matters, since payload length is the constraint
  compression exists to relieve. Anything that would not benefit stays `STv1`,
  so short secrets remain readable by older copies of the tool.
- **base64url, not base64.** No `+`, `/` or `=`, so a payload survives a URL and
  a double-click selects all of it.

Pre-2.0 payloads still decrypt, including those made with a pepper.

## Limits

**Text: effectively unlimited.** There is no length limit in the format, and key
derivation costs a flat 150 ms whatever the size:

| Content | Input | Encrypt |
| ------- | ----- | ------- |
| A `.env` file | 2 KB | under 1 ms |
| A novel | 300 KB | 3 ms |
| War and Peace | 3.2 MB | 29 ms |
| Ten years of notes | 10 MB | 122 ms |
| — | 200 MB | 3.1 s |

The ceiling is memory, not the format: nothing streams, so peak use runs about
20× the input. 200 MB is fine on a laptop; 400 MB exhausts an 8 GB heap.

**The limit you will actually hit is the channel.** The clipboard is not the
problem — 50 MB copies without complaint. The destination is:

| Where | Limit | Plaintext, compressed |
| ----- | ----- | --------------------- |
| A QR code | 2,953 chars | ~6 KB |
| A Slack message | 40,000 chars | ~82 KB |
| A GitHub comment | 65,536 chars | ~134 KB |
| Email, or a file | no practical limit | 200 MB |

Both front-ends report the payload length and name anywhere it will not fit, so
you find out before you try. A novel will not paste into a chat window,
compressed or not — send large text as a file.

**Compression** is applied when it makes the payload smaller and skipped when it
would not: real prose and source compress 2.5–3×, while short secrets and
anything already random come out *larger* under gzip. `--no-compress` turns it
off. One honest caveat, covered in [SECURITY.md](SECURITY.md): compressing before
encrypting lets the payload's length hint at how compressible the content was.

**Binary files are refused, not encrypted.** Everything here works on text, and
bytes that are not valid UTF-8 cannot survive a round trip through a string.
Earlier versions did it anyway, silently, and reported success. For a small
binary, encode it first:

```bash
base64 -i cert.p12 | secure-term encrypt -o secret.enc
secure-term decrypt secret.enc | base64 -d > cert.p12
```

For encrypting files as files, use [age](https://age-encryption.org) — it
streams, it does not hold the file in memory, and it is built for the job. This
tool is for text you want to move through a channel never meant to carry it.

## Security

**It protects against** someone reading the payload: a leaked note file, a synced
clipboard, a screenshot in a chat backup, a stolen phone with the payload sitting
in a notes app.

**It does not protect against** a compromised device (a keylogger sees your
passphrase as you type it), someone watching your screen while you read the
decrypted result, a weak passphrase, or anyone who has both the payload and the
passphrase.

Nothing is uploaded, because there is nowhere to upload to. The page's Content
Security Policy sets `connect-src 'none'`, so the app is structurally incapable
of a network request — enforced by the browser, not promised in a README. No
third-party scripts, no CDN fonts, no analytics, no cookies, and nothing written
to `localStorage`.

You can check all of that rather than take it on trust: about 1,450 lines of
unminified, dependency-free JavaScript for the web app, and the network tab stays
empty after load.

This is a personal project, not an audited cryptosystem. It uses standard
primitives in a standard way but has not been independently reviewed. **Do not
stake anything irreplaceable on it without a backup you control.**

Full threat model and design rationale: [SECURITY.md](SECURITY.md).

## Install

A PWA, so it installs and runs offline:

- **Desktop:** open the [live demo](https://hfconsultant.github.io/) and click
  the install icon in the address bar
- **iOS:** Share → *Add to Home Screen*
- **Android:** menu → *Install app*

Needs Web Crypto and ES modules — current Chrome, Edge, Firefox or Safari. Web
Crypto requires a secure context, so HTTPS or `localhost`, not `file://`.

## Development

No build step, no dependencies. ES modules will not load from `file://`, so serve
the directory:

```bash
python3 -m http.server 8000   # then open http://localhost:8000
node cli/secure-term.js --help
npm test
```

143 tests under Node's built-in runner; `npm test` is the source of truth. The
crypto tests run against Node's Web Crypto — the same standard API the browser
provides — so `js/crypto.js` is exercised unmodified.

The rest guard things that stay invisible until they break in front of someone:
that every module reached through an import is precached (the bug that stopped
the service worker installing at all), that the CSP has not regained
`unsafe-inline`, that summaries never print a secret value, that no
`--passphrase` flag has been added as a convenience, and that no file in the repo
contains a credential-shaped string.

### Layout

```
index.html           markup and Content Security Policy
css/style.css        styles
js/crypto.js         encryption core — no DOM, runs in browser and Node
js/envfile.js        describing content safely — names, sizes, never values
js/envparse.js       .env parsing with values — CLI only, feeds `run`
js/terminal.js       web UI and command flow — no cryptography
js/register-sw.js    service worker registration
cli/secure-term.js   command line front-end
service-worker.js    offline caching
docs/scanners.md     keeping payloads out of secret-scanner alerts
tests/               crypto, .env, CLI, project, backup, asset, packaging
```

One core, two front-ends. `js/crypto.js` touches no DOM and performs no I/O;
`terminal.js` and `cli/secure-term.js` are thin shells over it and neither does
any cryptography of its own. That is what lets a payload made in a browser open
in a terminal, and it means the part that matters can be read and tested alone.

### Using it as a library

```js
import { encryptText, decryptText } from 'secure-term';
import { summarize } from 'secure-term/envfile';

const payload = await encryptText('hello', 'passphrase');
const back = await decryptText(payload, 'passphrase');
```

### Releasing

npm gets the CLI and the shared core; GitHub Pages serves the site from the same
commit. `tests/package.test.js` follows the CLI's imports and fails if any fall
outside the `files` whitelist, so the package cannot ship missing a module.

1. Bump `version` in `package.json` — a test asserts the CLI reports the same one
2. Push, and let CI pass
3. Create a GitHub Release, which triggers `.github/workflows/publish.yml`: it
   re-runs the tests, refuses a version already on npm, and publishes with
   provenance

Publishing needs an `NPM_TOKEN` repository secret. Without it the workflow is
inert, which is the safe default — nothing publishes on an ordinary push.

## Documentation

- [SECURITY.md](SECURITY.md) — threat model, design rationale, reporting
- [docs/scanners.md](docs/scanners.md) — secret scanners, false positives, and
  why payloads do not belong in git
- [PROMPTS.md](PROMPTS.md) — the prompt history behind this project

## License

MIT — see [LICENSE](LICENSE).
