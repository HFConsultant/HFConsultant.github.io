# Secure Terminal

**Turn something you must not lose into something nobody can read — using a
phrase you could never forget.**

A terminal-style web app and a matching CLI that encrypt text entirely on your
own machine. No server, no account, no storage, no analytics. Install it once and
it works offline.

## Live Demo

[View my project here](https://hfconsultant.github.io/)

## The problem it actually solves

Every security tool you use eventually hands you a **recovery artifact**: a
high-entropy string you did not choose, cannot memorise, must never lose, and
must not store in plain text.

| Tool | What it hands you | What it tells you to do |
| ---- | ----------------- | ----------------------- |
| A crypto wallet | A 12-word seed phrase | "Write it down and keep it safe" |
| 1Password | Secret Key / Emergency Kit | "Print it and put it in a safe" |
| Bitwarden | A recovery code | "Store it somewhere safe" |
| Rails | `config/master.key` | Gitignored, and otherwise your problem |
| age, SOPS, dotenvx | An identity or key file | Gitignored, and otherwise your problem |

Every one of them stops at the same sentence, and every one of them leaves you
holding plaintext. **That last mile is what this tool is for.**

Seal the artifact with a sentence you could not forget, plus a detail only you
know:

```
Recovery artifact:  wagon rhythm exotic stand lens fortune brief grain siren
Passphrase:         My dog Rex ate pizza in Paris last summer
Pepper:             2019
```

What comes out is meaningless, so it is safe to keep somewhere unsafe — a notes
app, a printed page, cloud storage, a photo in your camera roll. **Nothing
memorable is ever written down.** The memorable part is the *key*, and it stays
in your head.

The **pepper** is that optional second secret. It helps when the passphrase is
something you could be persuaded or compelled to reveal, since a pepper can be a
detail that was never typed anywhere. It is not a backup — lose either half and
the text is gone, permanently and by design.

## What do you want to do?

| I want to… | Do this |
| ---------- | ------- |
| Store a wallet seed phrase | Open the [web app](https://hfconsultant.github.io/), press `e` |
| Seal a key file so it is safe to back up | `secure-term backup -k <file>` |
| Get a sealed key back | `secure-term restore` |
| Send a teammate one secret, right now | `secure-term encrypt .env -o .env.enc` |
| Manage secrets across a whole project | Consider [dotenvx](https://dotenvx.com) first — [see below](#how-this-compares) |
| Understand the limits | `secure-term help limits` |

The [web app](https://hfconsultant.github.io/) needs no install at all. For the
command line — which is **not published to npm**, [and why](#the-command-line):

```bash
npx github:HFConsultant/HFConsultant.github.io --help
```

## How this compares

Being specific about this, because most of these are more mature and you should
use them where they fit.

| Tool | Better than this at | This is better at |
| ---- | ------------------- | ----------------- |
| [dotenvx](https://dotenvx.com) | Project secrets, by a distance. Public-key model, so CI can *add* a secret without reading the others. From the author of `dotenv`. | Sealing the key it gives you |
| [age](https://age-encryption.org) | Files, streaming, large data, an audited design | Text you paste into a chat window |
| [SOPS](https://github.com/getsops/sops) | Committed secrets at scale, KMS integration, per-value diffs | Nothing — different job |
| Password managers | Everything about managing passwords | Sealing their recovery code |

**If you want encrypted `.env` files for a team, use dotenvx.** It does what
this tool's `init`/`run`/`edit` commands do, with a better key model and nine
million weekly downloads behind it. Those commands exist here because they fall
out of the same core for free, not because they beat it.

### What is actually different here

Passphrase encryption is not new — `age -p` and `gpg -c` have done it for years,
and you could seal a key file with either. What none of them do is make it **a
step in the key's life**, with the safeguards that step needs:

- **`init` tells you to do it**, on the day the key is created rather than the
  day you lose it.
- **The backup verifies itself.** It decrypts its own output and compares it to
  the key before reporting success. A backup nobody has opened is not a backup,
  and this is the one artefact where finding out later means the key is gone.
- **A key can never seal itself.** `backup` and `restore` refuse to take a
  passphrase from any key file — a key encrypted with itself would look like a
  success and only fail when it mattered.
- **`restore` checks what came back is a key**, rather than writing whatever
  decrypted into place.
- **It prints in transcribable groups**, and ignores whitespace on the way back
  in, because a printed backup gets retyped by hand.
- **The same payload opens in a browser.** Paste the sealed text into the web
  app on a phone and it opens there — no install, on a machine that is not
  yours. Nothing else here pairs a CLI and a browser on one format.

That is a workflow claim, not a cryptography claim. The primitives are standard
and deliberately boring.

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

While typing a passphrase or pepper, the **eye beside the prompt** reveals what
you are typing — a masked field is how you misspell a passphrase twice without
ever learning which attempt was wrong. It clears itself when the flow ends, and
the scrollback still shows only a mask either way.

You can also **drag a file onto the window** — a `.env` gets encrypted, a `.enc`
gets opened. The file is read in the browser and goes nowhere.

When content looks like a `.env`, the app lists the variable **names** it found
and never the values, so you can confirm you have the right file with someone
watching your screen.

## The command line

Same encryption, same format, same core module — a payload made on your phone
opens in your terminal and vice versa.

> **Not on npm, deliberately.** `npm install secure-term` will 404. The
> `.env`-management commands overlap heavily with
> [dotenvx](https://dotenvx.com), and claiming a generic npm name for a
> personal project to compete with it was not worth doing. It installs
> perfectly well straight from this repository — all three commands below are
> verified working.

**Run it once, installing nothing:**

```bash
npx github:HFConsultant/HFConsultant.github.io --help
```

**Or keep it around:**

```bash
npm install -g github:HFConsultant/HFConsultant.github.io
secure-term --help
```

**Or clone and run it from the checkout:**

```bash
git clone https://github.com/HFConsultant/HFConsultant.github.io.git
node HFConsultant.github.io/cli/secure-term.js --help
```

Once installed, the command is `secure-term`:

```bash
secure-term backup -k ~/.age/key.txt      # seal a key file you already have
secure-term restore -o ~/.age/key.txt     # and get it back
secure-term encrypt .env -o .env.enc      # scramble a file
secure-term decrypt .env.enc -o .env      # turn it back
cat .env | secure-term encrypt | pbcopy   # straight to the clipboard
```

Needs Node 20 or newer. Zero dependencies; the whole thing is 40 kB.

**If you would rather not install anything at all**, the
[web app](https://hfconsultant.github.io/) does the same encryption on the same
format — and a payload sealed there opens in the CLI, and vice versa.

The payload is the only thing on stdout — prompts and messages go to stderr — so
it composes in a pipeline. There is deliberately **no `--passphrase` flag**:
anything on a command line shows up in `ps` and in shell history. For automation,
set `SECURE_TERM_PASSPHRASE`.

`secure-term --help` leads with worked examples before the options table, and
`secure-term help <topic>` goes deeper on `project`, `backup`, `pepper`,
`sharing`, `scanners`, `env`, `format` and `limits`.

## In a project — any framework

> For a team managing project secrets, **[dotenvx](https://dotenvx.com) is the
> better choice** and this section is not trying to displace it. What follows
> exists because it costs nothing on top of the core, and because it is what
> produces the key that [sealing](#never-losing-the-key) then protects.

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

**This is the part worth having.** Everything above is a convenience; this is
the bit no other tool in the list does for you.

A key is high-entropy by design, and that strength is exactly what makes it
awkward: you cannot memorise it, so it must be *stored* — and every tool that
issues one leaves it in plain text. Rails writes `master.key` to disk.
1Password tells you to print the Emergency Kit. A wallet tells you to write the
seed on paper. Every copy of that backup is a copy of the secret.

So seal it with something you could not forget:

```bash
secure-term backup              # seals ./.secure-term.key
secure-term backup -k id.age    # or any other key file you hold
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

A dependency-free suite under Node's built-in runner — `npm test` is the count
that matters, and the only one that cannot go stale. The
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

The core is exported, so the format is not locked inside either front-end:

```bash
npm install github:HFConsultant/HFConsultant.github.io
```

```js
import { encryptText, decryptText } from 'secure-term';
import { summarize } from 'secure-term/envfile';

const payload = await encryptText('hello', 'passphrase');
const back = await decryptText(payload, 'passphrase');
```

`js/crypto.js` uses only standard Web Crypto with no Node-specific imports, so
the same file runs unmodified in a browser.

### On not publishing

The packaging is complete and tested — `npm pack` produces a valid 40 kB
tarball, and `tests/package.test.js` follows the CLI's imports and fails if any
fall outside the `files` whitelist, so it cannot ship missing a module. It is
simply not pushed to the registry, because the `.env` commands duplicate
[dotenvx](https://dotenvx.com) and a generic npm name was not worth claiming for
that.

`.github/workflows/publish.yml` remains, inert. It runs only on a published
GitHub Release or a manual dispatch, never on a push, and needs an `NPM_TOKEN`
secret that is not set. Should this ever be published — most likely under a
scoped name like `@hfconsultant/secure-term` — the steps are: bump `version` in
`package.json` (a test asserts the CLI reports the same one), push, let CI pass,
then create a Release. The workflow re-runs the tests, refuses a version already
on npm, and publishes with provenance.

## Built with

Nothing was installed to build this. The whole stack is things that were
already there:

| | |
| --- | --- |
| **Web Crypto API** | every bit of the cryptography, built into browsers and Node alike |
| **`CompressionStream`** | gzip, same story — no library |
| **Node's test runner** | the whole suite, zero dev dependencies |
| **GitHub Pages + Actions** | hosting, CI on Node 20/22/24, and a publish workflow that has never fired |
| **[Claude Code](https://claude.com/claude-code)** | the pair programming — and why `claude` turns up in the contributor list |

On that last one, the honest version. It wrote most of the tests, and found
that the service worker had never once installed in the app's entire life. It
also *introduced* the bug where a payload sealed with a pepper could no longer
be opened — and then found that one eleven commits later, during a pre-publish
audit, in a test file it had written itself and quietly under-covered.

Fifty-nine commits here predate it entirely — the 2024 build. Everything after
that carries its co-author trailer, which is the tidiest summary of the split:
the app was one person's idea, and the hardening was a conversation.
[PROMPTS.md](PROMPTS.md) keeps the receipts, including the parts where the
confident-sounding review turned out to be wrong.

## Documentation

- [SECURITY.md](SECURITY.md) — threat model, design rationale, reporting
- [docs/scanners.md](docs/scanners.md) — secret scanners, false positives, and
  why payloads do not belong in git
- [PROMPTS.md](PROMPTS.md) — the prompt history behind this project

## License

MIT — see [LICENSE](LICENSE).
