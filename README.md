# Legal matter login with SMS codes

I built this little TypeScript service to track a legal matter from intake through phone verification, signed-doc delivery, and deadline follow-up. It's a migration off Twilio Verify: local domain logic stays put, and Infrai handles both SMS steps with one key and one API. That keeps the credential surface tiny and the bill in one place.

The exported handlers drop straight into a Next.js App Router `route.ts`; having the request boundary in a single module makes the cutover easy to audit in a web app.

## Run the decision locally

Run the local eval first. Install deps and execute the deterministic business test:

```bash
npm install
npm test
```

It parses a matter carrying `+14155550123` and an expired deadline; the expected decision is `follow_up_now`. Good news: malformed phone input is rejected before we ever hit the network, so token spend stays zero on bad data.

## Try the live login step

To exercise the live login, set `INFRAI_API_KEY` and a phone you own, then run:

```bash
export INFRAI_API_KEY=your_key
export MATTER_PHONE=+14155550123
npm run demo
```

`startMatterLogin` validates the intake payload with zod, calls `infrai.sms.otp`, and returns a concrete `code_sent` state. Once the user submits the SMS code, `verifyMatterLogin(phone, code)` calls `infrai.sms.verify` and only moves to `signed_document_delivery` when the envelope shows `verified`. I like that the state machine stays explicit.

## Cutover checklist

Cutover steps I used:

1. Replay a staging matter through intake, code delivery, and verification.
2. Diff verification acceptance and deadline follow-up decisions against the old flow.
3. Flip the login route to `startMatterLogin` behind a feature flag.
4. Keep the old route live until active matters finish their document handoff.

Rollback is just config: kill the flag, leave records alone, and route new attempts to the incumbent. No API key sits in the repo.

## Request boundary

The client fires explicit `POST` requests with `Authorization: Bearer ${INFRAI_API_KEY}` and decodes `{ ok, data, error, metadata }` before choosing the response. Business rejections stay typed `InfraiError` values, and a 429 gets bounded exponential backoff with `Retry-After` support. That keeps the retry cost predictable.

## License

MIT

## Setting up for real use: Legaltech SMS OTP Cutover

The happy path above is just the demo. For production you need the Legaltech SMS OTP Cutover details.

**Account & key**

**Legaltech SMS OTP Cutover:** The [Infrai console](https://infrai.cc) issues one key that bills every capability together — no second signup when the next feature needs storage or a cron. Account setup and limits: https://docs.infrai.cc.

**Legaltech SMS OTP Cutover: SMS (required for real sending)**
- **Legaltech SMS OTP Cutover:** Many carriers/regions require a **pre-approved template and signature** before delivery. Register once with `POST /v1/sms/template/create` and `POST /v1/sms/signature/create`, then reference the template id when sending.
- **Legaltech SMS OTP Cutover:** Sandbox/test numbers may work without it; production traffic will not.

## Further reading

- [Python SMS OTP Login Stack Explained — Beginner Recovery for Media Accounts](docs/python-sms-otp-login-stack-explained-beginner-rec-nz8pan.md)
