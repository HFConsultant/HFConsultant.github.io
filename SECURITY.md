# Security

## Status

Secure Terminal is a personal project. It uses standard primitives from the
browser's Web Crypto API in a standard way, and the crypto core is covered by
tests — but it **has not been independently audited**. Treat it accordingly.

## Design

| Choice                   | Value                                          |
| ------------------------ | ---------------------------------------------- |
| Cipher                   | AES-256-GCM (authenticated)                    |
| Key derivation           | PBKDF2-HMAC-SHA256                             |
| Iterations               | 600,000 (OWASP's current floor for PBKDF2)     |
| Salt                     | 16 bytes, random per payload                   |
| IV                       | 12 bytes, random per payload                   |
| Key handling             | Non-extractable `CryptoKey`, derived per call  |
| Randomness               | `crypto.getRandomValues`                       |

Notes on the implementation:

- Keys are produced with `deriveKey`, not `deriveBits` + `importKey`, so the
  raw key bytes are never exposed to JavaScript. The `CryptoKey` is created
  non-extractable.
- A fresh salt and IV are generated per payload, so encrypting the same
  plaintext twice under the same passphrase never yields the same ciphertext.
- AES-GCM is authenticated: a modified payload fails to decrypt rather than
  returning corrupted plaintext.
- The passphrase and pepper are joined with a separator before derivation.
  Bare concatenation would make `("ab", "c")` and `("a", "bc")` derive the
  same key.
- Decryption failures are deliberately vague. Distinguishing "wrong
  passphrase" from "wrong pepper" would tell an attacker which half is right.

## Application hardening

- **Content Security Policy** is `default-src 'none'` with an explicit
  allowlist. `connect-src 'none'` means the app cannot make a network request
  even if an attacker managed to inject code into it.
- **No third-party code.** No CDN, no fonts loaded remotely, no dependencies,
  no analytics. Nothing in the supply chain to compromise.
- **No `unsafe-inline` or `unsafe-eval`.** All scripts and styles are external.
- **No persistence.** Nothing is written to `localStorage`, `sessionStorage`,
  IndexedDB or cookies. Only the app's own static files are cached, for
  offline use.
- **Secrets are never written to the DOM.** The text being encrypted, the
  passphrase and the pepper are entered in a masked field and echoed as a
  fixed-width mask, so they do not appear in the page, in a screenshot or in a
  screen recording.
- **Clipboard.** Only decrypted plaintext schedules a clipboard clear, after
  45 seconds. It reads the clipboard back first and does nothing if you have
  copied something else in the meantime.

## The command line

The CLI (`cli/secure-term.js`) shares the core module and adds its own
surface, handled as follows:

- **The passphrase is prompted on `/dev/tty`, masked, and never accepted as a
  flag.** Anything on the command line is visible in `ps` output and lands in
  shell history, so there is deliberately no `--passphrase` option — a test
  asserts it stays absent. Arrow-key escape sequences are consumed rather than
  silently embedded in the secret.
- **`SECURE_TERM_PASSPHRASE` exists for automation** (CI has no terminal to
  prompt on). Environment variables are better than argv but not free: they
  are inherited by child processes and may be captured by shell profiling or
  crash reporting. Prefer the interactive prompt when a human is present, and
  scope the variable to the single command rather than exporting it.
- **Output files are written mode 0600** (owner read/write only).
- **stdout carries only the payload or plaintext**; prompts and summaries go
  to stderr. Piping output somewhere is an explicit act.
- **`.env` summaries print variable names, never values**, so the progress
  output is safe in CI logs and on shared screens.

## Project keys

`secure-term init` writes `.secure-term.key`: 32 bytes from
`crypto.getRandomValues`, base64url-encoded, mode 0600, added to `.gitignore`
automatically.

Nothing about the payload format changes for a key file — it is simply a
passphrase that lives in a file rather than in someone's head. What changes is
the **threat model**, and only in one direction:

- A **chosen passphrase** can be attacked offline. Ciphertext made with one
  should not live anywhere permanent, which is why the default advice is to
  send payloads through chat rather than commit them.
- A **generated key** cannot be meaningfully guessed. Ciphertext made with one
  is safe to commit, which is what makes the Rails `master.key` arrangement
  work and what makes it work here.

The consequences of that distinction:

- **The key must never be committed.** `init` edits `.gitignore` rather than
  leaving it to documentation, because committing the key next to the
  ciphertext removes all protection at once.
- **A key readable by other local users earns a warning**, like `ssh`. It is a
  warning rather than a refusal because containers and CI runners routinely
  mount files with unhelpful modes.
- **`init` refuses to overwrite an existing key** without `--force`, since a
  replaced key makes every file encrypted with the old one unreadable.
- **`run` never writes plaintext to disk.** Values are decrypted in memory and
  passed to the child process's environment. Environment variables are visible
  to that process and its children, and on some systems to the same user via
  `/proc`; this is the same exposure any `.env` loader has, and strictly less
  than leaving a decrypted `.env` on disk.
- **Real environment variables take precedence** over decrypted ones, so a
  value injected by CI is never silently replaced by a stale committed one.
- **`edit` writes plaintext to a 0600 temporary file** for as long as the
  editor is open, removes it in a `finally` block, and saves by writing a
  neighbouring temporary file and renaming it, so an interrupted save cannot
  truncate the payload.

## Sealed key backups

`secure-term backup` encrypts the project key with a passphrase the user
chooses, producing an ordinary `STv1` payload. `secure-term restore` reverses
it. This exists because a random key must be stored somewhere, and storing it
in plaintext — as Rails does with `master.key` — makes every copy of the
backup a copy of the key.

**The security of a sealed backup is the security of the chosen passphrase.**
Sealing does not inherit the 256-bit strength of the key it protects; it
replaces it with whatever the phrase is worth. That is an acceptable and
deliberate trade for an artefact stored outside the repository, and an
unacceptable one for an artefact stored inside it.

Which gives the single rule:

- **Never commit a sealed backup to the repository it unlocks.** The
  repository already holds the ciphertext the key opens. Storing both together
  means one offline attack against the passphrase yields everything, which is
  exactly what generating a random key prevented. `backup` adds its output to
  `.gitignore` when written into a repository, and says so.

Other properties:

- **A key file can never seal itself.** `backup` and `restore` refuse to take
  a passphrase from any key file, so a key cannot be encrypted with itself —
  a failure that would look successful and be discovered only when the backup
  was needed. An explicitly set `SECURE_TERM_PASSPHRASE` is still honoured,
  since that is a deliberate act rather than a file found lying around.
- **Backups are verified before being reported.** `backup` decrypts its own
  output and compares it to the key, so success is never claimed for a backup
  that would not open.
- **Restore validates what it recovered.** Decrypting the wrong payload — a
  `.env.enc`, say — is rejected with an explanation rather than writing a key
  file full of environment variables.
- **Restore refuses to overwrite an existing key** without `--force`.
- **Each backup is distinct.** Fresh salt and IV per call, so storing the same
  key in two places does not hand an attacker a matched pair.
- **Whitespace is ignored when decrypting**, so a backup printed in groups can
  be retyped by hand. This applies to all payloads and also rescues ones
  line-wrapped by an email client.

## Backwards compatibility

Payloads from the pre-2.0 release still decrypt, including those made with a
pepper — the original combined passphrase and pepper by bare concatenation,
and the legacy path reproduces that exactly. The current format joins them
with a separator instead, closing the ambiguity where `("ab", "c")` and
`("a", "bc")` derived the same key. Old payloads keep their original
semantics; new payloads get the fix.

## Threat model

**In scope.** An attacker who obtains the encrypted payload — from a synced
notes app, a chat backup, a screenshot, a stolen device, a shared drive.
Without the passphrase (and pepper, if used) the payload is not useful.

**Out of scope.**

- A compromised device. A keylogger or a malicious browser extension can read
  the passphrase as you type it. Nothing in a web page can prevent this.
- Someone watching the screen. Secrets are masked on entry, but decrypted
  output is displayed so you can read it.
- Weak passphrases. PBKDF2 raises the cost of guessing; it does not rescue a
  passphrase that is short or predictable. The app estimates strength and
  warns you, but that estimate is a heuristic, not a guarantee.
- Metadata. The payload does not hide its own length, and its length is
  roughly the length of your plaintext.
- Memory. JavaScript provides no way to wipe a string from memory. References
  to secrets are dropped after use, which makes them eligible for garbage
  collection sooner, but that is best-effort and not erasure.

## Reporting a vulnerability

Open an issue at
<https://github.com/HFConsultant/HFConsultant.github.io/issues>.

If the issue is sensitive, open an issue saying only that you have found
something and asking for a private channel — do not include details in the
public thread.
