# GitHub Copilot Provider

Unofficial integration using the same internal API as VS Code and JetBrains. **Use at your own risk.** See [Legal Review](#legal-review) below.

## Setup

1. Sign in to Copilot via VS Code, JetBrains, or any IDE with the Copilot extension
2. Copy `oauth_token` from `~/.config/github-copilot/apps.json`
3. Save it:

```bash
soulforge --set-key copilot <token>
# or use /keys in the TUI
```

On Windows the config is at `~\AppData\Local\github-copilot\apps.json`.

## Usage

```bash
Ctrl+L > copilot/claude-sonnet-4          # TUI
soulforge --headless --model copilot/gpt-4o "prompt"  # Headless
```

## Legal Review (April 2026)

We reviewed 6 documents on 2026-04-04 to assess compliance:

1. **GitHub Copilot Product Specific Terms** (March 2026, deprecated 2026-03-05)
   - [github.com/customer-terms/github-copilot-product-specific-terms](https://github.com/customer-terms/github-copilot-product-specific-terms)
   - No restriction on which clients may access the service. Acceptable use is content-only.

2. **GitHub Generative AI Services Terms** (March 2026, effective 2026-03-05)
   - [github.com/customer-terms/github-generative-ai-services-terms](https://github.com/customer-terms/github-generative-ai-services-terms)
   - Content-only restrictions. Section 8 acknowledges third-party products without prohibiting them.

3. **GitHub Terms for Additional Products and Features**
   - [docs.github.com/...github-copilot](https://docs.github.com/en/site-policy/github-terms/github-terms-for-additional-products-and-features#github-copilot)
   - States installation requirements per interface but does not prohibit alternative access methods.

4. **GitHub Acceptable Use Policies**
   - [docs.github.com/...acceptable-use-policies](https://docs.github.com/en/site-policy/acceptable-use-policies/github-acceptable-use-policies)
   - "Unauthorized access" clause. Valid credentials from a paid subscription is not unauthorized.

5. **GitHub Terms of Service**
   - [docs.github.com/...terms-of-service](https://docs.github.com/en/site-policy/github-terms/github-terms-of-service)
   - Rate-limiting clause only, not a client restriction.

6. **Microsoft AI Code of Conduct**
   - [learn.microsoft.com/legal/ai-code-of-conduct](https://learn.microsoft.com/legal/ai-code-of-conduct)
   - Content safety only. No restrictions on access methods or clients.

**Conclusion:** No published terms prohibit third-party clients. One [community discussion](https://github.com/orgs/community/discussions/178117) has an employee stating the API is "intended solely for officially supported clients," but this is not in any legal document.

**Risks:** API could change without notice. Excessive volume could trigger rate-limiting. Terms could be updated to prohibit third-party clients.

**Re-verify if GitHub publishes updated terms after 2026-04-04.**
