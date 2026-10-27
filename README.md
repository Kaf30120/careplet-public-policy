# CarePlet national insurance policy service

This directory is a **separate public-data service bundle**, not the CarePlet app.
No Firebase access, tenant identifiers, payroll, staff information or credentials
belong in this repository. Only government-source collectors, their synthetic
tests, this guide, the workflow, and signed national-policy JSON may be published.
This repository is the approved standalone policy service. Its workflow runs only
when POLICY_SERVICE_ENABLED=true. App Hosting deployment remains separately approved.

## No-billing recommendation

- Create a new **public** GitHub repository, proposed name `careplet-public-policy`.
  Do not convert or upload the CarePlet app repository. Use main as default branch.
- Standard Ubuntu hosted runner only; no larger runner, Actions artifacts/cache,
  paid marketplace action, GitHub Pages, external domain or Firebase resource.
- After deployment approval, set variable `POLICY_SERVICE_ENABLED=true` and store
  a freshly generated Ed25519 private key in Actions secret `POLICY_SIGNING_KEY`.
  Never put it in a file committed to Git, command history, app, report or chat.
  Use an operator's local secret-management procedure; no production key exists
  in this bundle. Extract the raw 32-byte public key for the app only.
- Review workflow writer access and repository protections before activation.
  The workflow needs permission to publish `public/latest.json` to main. This is
  a separately approved automated commit/push in this service repository only.
  Do not use force-push or disable existing app-repository protection.
- Run workflow_dispatch bootstrap once. Later runs require the previous signed
  file, verify it with the same key and preserve its sequence/history.
- Cron runs at UTC 00:17/06:17/12:17/18:17 (KST 09:17/15:17/21:17/03:17).
  Successful rechecks publish fresh signatures and timestamps even if rates are
  unchanged. These are real policy verification records, not empty keep-alive commits.
- App URL after actual repository creation:
  `https://raw.githubusercontent.com/kaf30120/careplet-public-policy/main/public/latest.json`
  This is the publication endpoint; check the latest successful run before use. Verify HTTP 200/no redirect,
  MIME/browser fetch/CORS, signature, TLS and Android/iPhone access before use.
- Rebuild app with `INSURANCE_POLICY_URL` and base64 raw public key in
  `INSURANCE_POLICY_PUBLIC_KEY`. Private key is never a Dart define.
  Existing Firebase and company identifiers remain unchanged.
- App fetches on start, hourly while active, and before calculation/correction/
  confirmation. Current implementation keeps verified data in memory; restart
  offline cannot complete new payroll. Existing immutable records remain readable.

## Assurance and operational limits

GitHub states standard public-repository hosted runs are free:
https://docs.github.com/en/billing/concepts/product-billing/github-actions
No billing connection is part of this proposal. If onboarding unexpectedly asks
for payment or a private/paid runner is needed, stop rather than enabling billing.

Schedules can be delayed/dropped and public schedules can be disabled after
60 days without repository activity:
https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule
Normal successful publications produce repository activity. This does not
guarantee recovery from 60 days of failures, account suspension or a disabled
schedule. The developer/operator, not payroll users, receives Actions failure
notifications (enable the account's workflow notifications during deployment).
Configure an independent availability monitor only with separate authorization;
there is no paid-service SLA or permanent free-service guarantee.

The feed expires 72 hours after a successful full source read. Failures never
extend it. An installed app then blocks new automatic completion/confirmation;
it does not keep using unverified old values. Restore service by fixing the
collector/test or scheduler, not by extending old expiry without source checks.
Source layout/formula changes, exceptional eligibility and retroactive legal
interpretation require developer maintenance. No LLM guesses rates.

## Included parameters / exclusions

Automatic: national pension employee/employer rate and income bounds; health
rate and annual insurance bounds; care rate; unemployment employee/employer
rate and four employer business-category additions. Effective month and signed
old/new change history are included. Future months are collected when effective,
not inferred from an announcement or a single insurer's future table.

Not supplied: company-specific industrial final rate (individual experience /
commuting), actual agency bills, enrollment/relief decisions, income-tax tables,
minimum wage or new legal formulae. App retains industry/year confirmation and
blocks unsupported future tax/payroll completion. It does not claim every
company's exact final four-insurance bill can be obtained from public pages.

## Stop, recover, rotate

Set `POLICY_SERVICE_ENABLED=false` to stop scheduled writes. Never delete the
previous feed to reset sequence. Preserve prior signed file and commit history;
recover code then rerun with real official reads and a greater sequence. Do not
republish an expired old file as fresh. Old finalized payroll is not recalculated.
Key compromise requires disabling the service and a newly approved app build
pinning a new key; mere HTTPS hosting is not authority to replace the trusted key.
App-level sequence checks are in-memory; restart replay protection is bounded by
the signed 72-hour window and the device clock, not a persistent trusted clock.

Acceptance before production: real GitHub Linux source access, workflow permissions,
notification delivery, public raw endpoint/CORS, native WebCrypto/Dart signature
verification and a new app candidate. Local tests do not prove these external steps.
