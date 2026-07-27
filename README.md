# Secure Terminal

A command-line-style web app that encrypts and decrypts text entirely in your
browser. No server, no account, no storage, no analytics. Install it once and it
works offline.

## Live Demo

[View my project here](https://hfconsultant.github.io/)

## What it does

Type `e`, give it some text and a passphrase, and it hands back a payload like:

```
STv1.600000.WGo4u3ngZmEMzAUbsrn_kg.YkgymMBTWb3dx7TE.odYexKpVxxgGpSIWhrnl5nsl...
```

Type `d`, paste that back with the same passphrase, and you get your text
returned. That is the whole application.

The point is that the payload is safe to put somewhere unsafe — a note app, a
chat message, a printed page, a photo in your camera roll — because it is
useless without the passphrase, which is never written down anywhere.

### Commands

| Command | Does                                                    |
| ------- | ------------------------------------------------------- |
| `e`     | Encrypt some text                                       |
| `d`     | Decrypt a payload                                       |
| `c`     | Clear the screen                                        |
| `h`     | Show help                                               |
| `about` | How it works, and what it does not protect against      |
| `Esc`   | Cancel the current step                                 |
| `↑` `↓` | Previous commands                                       |

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

You can verify all of this: it is about 700 lines of unminified,
dependency-free JavaScript, and the network tab stays empty after load.

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

### Tests

The crypto core is covered by tests that run under Node's built-in test runner
against Node's Web Crypto implementation — the same standard API the browser
provides, so `js/crypto.js` is exercised unmodified:

```bash
npm test
```

They cover round-trips, unicode handling, salt and IV uniqueness, tamper
rejection, malformed payloads, passphrase/pepper separation and backwards
compatibility with the pre-2.0 payload format.

### Layout

```
index.html            markup and Content Security Policy
css/style.css         styles
js/crypto.js          encryption core — no DOM access
js/terminal.js        UI and command flow — no cryptography
js/register-sw.js     service worker registration
service-worker.js     offline caching
tests/                crypto tests
```

The split between `crypto.js` and `terminal.js` is deliberate: the crypto
module touches no DOM and the UI module performs no cryptography, so the part
that matters can be read, reasoned about and tested on its own.

## Browser support

Needs Web Crypto and ES modules — Chrome, Edge, Firefox and Safari, current
versions. Web Crypto requires a secure context, so the app works over HTTPS or
on `localhost`, but not from a `file://` URL.

## Documentation

- [PROMPTS.md](PROMPTS.md) — the prompt history behind this project
- [SECURITY.md](SECURITY.md) — threat model and how to report an issue
- [LICENSE](LICENSE) — MIT

## License

MIT — see [LICENSE](LICENSE).
