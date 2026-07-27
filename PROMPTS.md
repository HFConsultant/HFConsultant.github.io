# Prompt History

A record of how this project was built with AI assistance, kept because the
process is part of what is being reviewed.

The project has two phases: the original build (2024), and a hardening pass
(2026) that produced version 2.0. Both used AI assistance; the second phase is
documented in more detail because it is where the interesting decisions were
made.

---

## Phase 1 — original build (2024)

The first version was built incrementally with AI assistance in short,
task-sized prompts. The commit history from `7d1fd6a` through `e8c7d49` is a
fair record of it: roughly 30 commits, most of them one focused change, largely
alternating between adding a terminal feature and fixing mobile layout.

No verbatim transcript was kept at the time. The prompts below are
**reconstructed from the commit history**, not quoted — they reflect what each
commit was asking for, and are included to show the shape of the workflow
rather than to claim a record that does not exist:

- "Build a browser-based encryption tool with a terminal interface using the
  Web Crypto API."
- "Simplify the commands to single letters — `e` to encrypt, `d` to decrypt,
  `c` to clear."
- "Add a copy button for the encrypted output."
- "The terminal input is hidden behind the keyboard on mobile. Fix it."
- "Add an optional second secret value on top of the passphrase."
- "Make it installable as a PWA with a manifest, icons and a service worker."

**What this phase got right:** it shipped, it used the Web Crypto API rather
than a hand-rolled cipher, and it kept everything client-side.

**What it got wrong** is visible in the commit titles: seven consecutive
commits fighting mobile viewport height. Each prompt asked for a fix to the
symptom in front of it, so the answer was another media query rather than a
reconsidered layout. Prompting fix-by-fix produces a fix-by-fix codebase.

---

## Phase 2 — hardening pass (2026)

### The opening prompt

The starting point was a review of the existing repository produced by GitHub
Copilot, pasted in alongside the deployment requirements. Condensed, the
instruction was:

> We have an existing project at `HFConsultant/HFConsultant.github.io`. Here is
> Copilot's breakdown of what I already have — we're improving it instead of
> starting from scratch. Reviewers will inspect source code, README, prompt
> history and commit history. Commit after meaningful progress rather than one
> giant commit at the end.

Copilot's review was a ten-section list covering cryptography, CSP, UX,
accessibility, features, CI, and documentation, with a prioritised roadmap and
sample code.

### How that review was used

The review was treated as **a set of hypotheses to verify, not a task list to
execute**. That distinction changed the outcome in both directions.

**Two of the most serious problems were not in the review at all.** Both were
found by reading the files rather than the summary of them:

1. **The PWA had never worked offline.** `service-worker.js` precached
   `/js/main.js`, a file that does not exist in this repository. `cache.addAll()`
   is atomic, so that single 404 rejected the install and the worker never
   activated. The feature had been advertised in the README since 2024 and had
   never once functioned. The review discussed service worker *caching
   strategies* without noticing the worker never installed.

2. **The passphrase was echoed to the screen and left in the DOM.**
   `terminal.js` called `writeOutput(command, true)` on every submitted line —
   including the passphrase step — and collected it in a `type="text"` input.
   The review flagged `prompt()` as bad for passphrase entry, which is true but
   much less bad than printing the passphrase into the page and leaving it in
   the scrollback.

The lesson generalises: a review that summarises a codebase reasons about what
the code *appears* to do. Verifying meant opening the files and, later, running
the app and inspecting `document.body.innerHTML` after an encrypt run to
confirm no secret survived.

**One recommendation was declined.** The review suggested clearing the
clipboard after copying the *encrypted* payload. That is backwards: the
ciphertext is not the secret — publishing it is the entire point of the tool —
while the decrypted plaintext is. The clipboard clear was implemented for
decrypted output instead, and it reads the clipboard back before overwriting so
that it does nothing if the user has since copied something else. Blindly
destroying a user's clipboard is a worse outcome than the risk it mitigates.

**Several were adopted as given,** because they were correct: `deriveKey`
instead of `deriveBits` + `importKey`, a versioned payload format, moving
inline scripts to external files so the CSP could drop `unsafe-inline`, and
removing the Font Awesome CDN.

**Several were deferred.** Argon2 via WASM, BIP-39 mnemonic encoding,
ECDH public-key mode and file encryption are all reasonable, and all of them
add a dependency or a format to a tool whose main virtue is that it is small
enough to read end to end. They are listed in the README as possible future
work rather than half-built.

### Prompts that shaped the result

The prompts that mattered were the ones that asked for verification rather
than implementation:

- "Pull the repo down and read the actual files before acting on the review."
- "Serve it locally and run a real encrypt/decrypt round trip through the UI."
- "After an encrypt run, check whether the passphrase appears anywhere in the
  DOM."
- "Benchmark the iteration count before committing to it."

That last one is small but representative. 600,000 PBKDF2 iterations is OWASP's
current recommendation, but recommending it and shipping it are different
things — it was measured at ~130 ms on desktop before being adopted, which is
the difference between a defensible number and a copied one.

Two problems were found *only* by running the app:

- Pressing Enter did not submit. The form's submit handler worked when invoked
  directly, but implicit submission did not fire once the page shipped a
  `form-action` CSP directive. Enter is now bound explicitly.
- The passphrase strength meter, drawn with `█` and `░`, rendered as an
  undifferentiated grey blob. It is plain ASCII now.

Neither would have been caught by reading the diff.

### On commit granularity

The instruction to commit after meaningful progress was followed literally, and
the commit messages are longer than the diffs sometimes justify. That is
deliberate: the *what* is recoverable from the diff, but the *why* — why
`cache.addAll` was replaced with `Promise.allSettled`, why the pepper is joined
with a separator instead of concatenated — is not.

---

## Reflection

The most useful thing AI did here was write the parts that are tedious and
mechanical: the base64url helpers, the test suite, the CSS. The most useful
thing a human did was refuse to treat a confident-sounding review as ground
truth.

Copilot's review was genuinely good — the cryptographic recommendations were
correct and worth implementing. But it was also incomplete in a way that was
invisible from inside it: it never claimed the service worker was fine, it
simply never checked, and nothing in its tone distinguished the parts it had
verified from the parts it had inferred.

The workflow that produced the good outcome was: read the review, read the
code, run the code, and let the third one settle disagreements between the
first two.
