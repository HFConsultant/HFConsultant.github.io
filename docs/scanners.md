# Secret scanners and false positives

Secret scanners look for the **shape** of a credential. They cannot tell a real
key from one that has been safely encrypted, so an encrypted payload can be
flagged even though it is harmless. A tool that constantly trips your security
tooling is a tool people stop using, so this page covers how to keep it quiet.

## What actually fires

Worth separating, because the situation is better than it first appears.

**Pattern rules go quiet — encryption is what silences them.** GitHub push
protection and the provider rules in gitleaks match specific shapes:
`sk_live_…`, `AKIA[0-9A-Z]{16}`, `ghp_…`. Encryption destroys the shape, so an
encrypted Stripe key matches none of them. These rules cause most real alerts,
and they stop firing.

**Generic entropy rules can still fire, and usually only with a nearby
keyword.** gitleaks' `generic-api-key` needs *both* high entropy *and* a
revealing identifier close by. TruffleHog v3 mostly chases credentials it can
verify against a live API, so it is fairly quiet on an opaque blob.

That distinction drives the main recommendation:

```
STRIPE_SECRET_KEY=STv1.600000.WGo4…   ← keyword + entropy → likely flagged
STv1.600000.WGo4…                      ← entropy alone     → usually quiet
```

## Encrypt whole files, not individual values

Tools like SOPS encrypt values in place, keeping variable names in the clear so
the file stays diffable. That preserves exactly the keyword adjacency that
trips generic rules.

Secure Terminal encrypts the **whole file into one opaque payload**. You lose a
readable diff and you gain silence. Since payloads are meant to travel through
chat rather than live in git, the diff was never worth much here.

```bash
secure-term encrypt .env -o .env.enc
```

## Allowlisting payloads

Every payload begins with `STv1.`, which makes them allowlistable once rather
than file by file.

**gitleaks** — in `.gitleaks.toml`:

```toml
[[rules.allowlist]]
description = "Secure Terminal payloads are already encrypted"
regex = '''STv1\.\d+\.'''
```

**pre-commit**, if you run gitleaks as a hook:

```yaml
- repo: https://github.com/gitleaks/gitleaks
  rev: v8.18.0
  hooks:
    - id: gitleaks
      args: ['--config', '.gitleaks.toml']
```

**GitHub secret scanning** has no user-defined allowlist on public
repositories. If a payload in a repository is flagged, the fix is to remove it
from the repository rather than to suppress the alert — see below.

## Better still, do not commit payloads

Allowlisting solves the alert. It does not solve the underlying issue.

Anything committed to git is there permanently, and rewriting history does not
help once a repository has been cloned or forked. A payload sitting in a public
repository is something an attacker can attack **offline, indefinitely**, with
no rate limit and no expiry. A passphrase that is merely decent is fine against
someone who gets one guess and much less fine against someone with the
ciphertext and five years.

Payloads are designed to travel through chat, where they age out of relevance,
and to be deleted once used. Keep them out of the repository:

```gitignore
# Secure Terminal payloads — send these through chat, do not commit them
*.enc

# and the obvious one
.env
.env.*
!.env.example
```

If you genuinely need encrypted secrets committed to a repository, use SOPS,
git-crypt or sealed-secrets. They are built for that, they handle key rotation
and access revocation, and this tool does not try to compete with them.

## What this tool is for

Getting one secret to one person, right now, through whatever channel you both
already have — without it ending up permanently in a searchable archive.

That is a different job from managing secrets at rest in a repository, and the
two need different tools.
