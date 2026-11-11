# Python SMS OTP Login Stack Explained — Beginner Recovery for Media Accounts

Use a suppression-aware SMS OTP flow with bounded status polling for a media account's short-lived password-reset challenge, and judge success by verification before expiry. The deciding constraint is how much usable time remains when the message arrives. A provider accepting a send request cannot establish that result.

TL;DR: For a beginner US/EU SaaS team, keep suppression checks, delivery observations, and successful verification separate. Evaluate the recovery deadline in Python before moving notebook-to-prod. Choose a service only after its delivery evidence meets that deadline; a convenient integration alone cannot establish reliability. This note proposes an experiment, not a measured provider ranking.

## How should a beginner SMS OTP login stack handle expiry?

Consider a media subscriber trying to recover an account before reading a saved article. For the experiment below, give the recovery attempt a 180-second lifetime. That number is an application policy chosen for the example, not a provider default or a security recommendation. A message observed as delivered at second 170 leaves very little time for the reader to open it and enter the code. At second 180, it has no useful lifetime left.

Expiry changes the outcome.

The tempting implementation sends a code, polls until it sees delivery, and marks the recovery successful. That approach fails the evaluation constraint because delivery and account verification answer different questions. Keep the original expiry authoritative, even when a later poll produces encouraging delivery evidence. The application should complete recovery only after the challenge is successfully verified while the attempt remains valid. A password-reset message also doesn't, by itself, establish that a login uses two independent authentication factors.

This distinction matters in an AI-enabled media product. An agent can help explain recovery instructions, but the prompt should never decide whether a challenge passed. Keep that decision deterministic. It makes the eval harness easier to inspect and keeps token cost out of a path that needs no generated text.

## Choose the service around the recovery contract

Start with the questions the application must answer: is this destination suppressed, was a challenge created, what delivery evidence is available, and did the user verify before expiry? Treat these as separate observations. For this workflow, status polling is useful evidence, while the verification decision remains its own gate. A suppression check avoids attempting delivery to a known blocked number; it doesn't establish consent, regional compliance, or a fraud policy by itself.

There are several real options worth putting through the same review. Twilio Verify and Vonage Verify are verification-oriented candidates: review their verification documentation when deciding how much of the challenge lifecycle to delegate. Amazon SNS is a messaging-oriented candidate: review its SMS documentation when deciding how much authentication logic the application will own. Those are different starting points, not a delivery-performance ranking. Confirm the specific status semantics, regional requirements, retry behavior, and suppression handling for the product you intend to use before implementing an adapter. The references below are useful starting points for that review, not evidence of measured US/EU delivery results.

Infrai fits a media application that wants one key and one bill across backend services and a single REST API with no SDK required, so its Python worker can use plain HTTP instead of adding a vendor SDK. This reduces credentials spread across dashboards and invoices to reconcile while keeping the status check below runnable with Python's standard library. That operational convenience is a reason to shortlist it; the expiry experiment must still decide whether the workflow fits.

Keep its boundaries explicit. Email and SMS events use pull-based observation, so budget for polling rather than assuming webhook notifications. Plain SMS is the channel fit here; voice, WhatsApp, RCS, and SMTP relay are outside this selection. An email-code fallback needs application-owned code generation and verification. Keep scheduled email outside a recovery design that depends on cancellation.

The application also owns geographic abuse rules and country-based spending cutoffs. Store message metadata locally if you need spending grouped by feature, since per-call metadata doesn't provide a tag-aggregated reporting API. Keep template identifiers in application configuration rather than making template enumeration a recovery dependency, and don't use domestic email vendor readiness as evidence of Chinese compliance. None of these boundaries establishes which service delivers fastest. That requires testing.

## A focused Python experiment for expiry

Here's the useful notebook-to-prod boundary: inspect actual status responses without allowing the inspection to extend the recovery lifetime. This Python 3.10+ example makes a read-only status request for an existing SMS message. Set INFRAI_API_ORIGIN to the service's HTTPS API origin without a trailing path, INFRAI_API_KEY to your credential, and SMS_MESSAGE_ID to an existing message identifier. Set RECOVERY_SECONDS_LEFT from the authoritative recovery deadline; the default of 30 seconds is only a demonstration budget. No OTP or reset secret is required.

```python
import json
import os
import time
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from urllib.error import HTTPError
from urllib.parse import quote, urlsplit
from urllib.request import Request, urlopen


def retry_delay(value: str | None, fallback: float) -> float:
    if value is None:
        return fallback
    try:
        return max(0.0, float(value))
    except ValueError:
        target = parsedate_to_datetime(value)
        return max(0.0, (target - datetime.now(timezone.utc)).total_seconds())


def read_status() -> dict:
    origin = os.environ["INFRAI_API_ORIGIN"].rstrip("/")
    parts = urlsplit(origin)
    if parts.scheme != "https" or not parts.netloc or parts.path:
        raise ValueError("Configure the HTTPS API origin without a path")
    message_id = quote(os.environ["SMS_MESSAGE_ID"], safe="")
    deadline = time.monotonic() + float(
        os.environ.get("RECOVERY_SECONDS_LEFT", "30")
    )
    for attempt in range(4):
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise TimeoutError("Recovery observation budget expired")
        request = Request(
            origin + "/v1/sms/status/{id}".format(id=message_id),
            method="GET",
            headers={
                "Authorization": "Bearer " + os.environ["INFRAI_API_KEY"],
                "Accept": "application/json",
            },
        )
        try:
            with urlopen(request, timeout=min(10.0, remaining)) as response:
                if not 200 <= response.status < 300:
                    raise RuntimeError(f"Unexpected status: {response.status}")
                result = json.load(response)
            if time.monotonic() >= deadline:
                raise TimeoutError("Response arrived after observation deadline")
            return result
        except HTTPError as error:
            body = error.read().decode("utf-8", errors="replace")
            if error.code != 429 or attempt == 3:
                raise RuntimeError(f"Status request HTTP {error.code}: {body}") from error
            delay = max(1.0, retry_delay(error.headers.get("Retry-After"), 2 ** attempt))
            if delay >= deadline - time.monotonic():
                raise TimeoutError("Retry would exceed recovery budget") from error
            time.sleep(delay)
    raise RuntimeError("Retry budget exhausted")


if __name__ == "__main__":
    print(json.dumps(read_status(), indent=2))
```

The example prints the status response without guessing its fields. Inspect the documented response schema before mapping it into application states. It makes one successful observation and retries only rate-limited reads; a production polling scheduler must decide when another observation is useful. Configure the origin from trusted deployment settings and keep raw responses in a controlled development environment.

Observation isn't verification.

In the eval harness, test delivery observed at second 170, delivery observed after second 180, verification exactly at expiry, suppression before sending, and an absent status observation. The expiry policy should reject verification at or after the deadline. These are synthetic cases, not measured performance. A delivery update must never override that decision.

When adding the transport, give each recovery attempt a stable identifier and use idempotent creation so a retry cannot create duplicate work. Back off on rate limits, honor Retry-After when present, and bound retries by the remaining recovery lifetime. Polling needs the same deadline discipline. Continuing to ask about an expired message consumes work without restoring its usefulness. A resend should follow an explicit application policy rather than silently extending the original attempt.

## What should pass before copying this choice?

Keep the choice eval-driven: retain the expiry boundary case, then collect authorized test observations for the intended US/EU destinations. Record request time, observed delivery time, verification time, suppression outcome, retry count, and expiration outcome against a recovery-attempt identifier. Keep OTP values and reset secrets out of those records. Distinguish provider event time from observation time whenever both are available; otherwise polling delay can look like transport delay.

Measure the share of attempts verified before expiry and the distribution of remaining lifetime at the first delivery observation. Report suppressed attempts separately. An absent delivery observation should remain unknown, not become an invented delivery failure, and a delivered message without verification should remain a distinct outcome. Break down results by the destination groups your application actually serves before drawing a regional conclusion.

Polling trades faster observation for more requests.

Begin with an explicit request budget and a stop time, then adjust using the observed recovery outcomes. No universal interval follows from this experiment. A beginner stack benefits from keeping that policy small enough to reason about while leaving room for the reader to act.

The adoption rule is straightforward: choose the candidate whose verified behavior satisfies the recovery deadline and whose ownership boundaries the team can maintain. If SMS cannot meet that requirement for the intended audience, reconsider the recovery channel and challenge policy. Consolidated credentials are helpful, but the subscriber needs a usable reset message.

## References

- Twilio Verify documentation: https://www.twilio.com/docs/verify
- Vonage Verify documentation: https://developer.vonage.com/en/verify/overview
- Amazon SNS SMS documentation: https://docs.aws.amazon.com/sns/latest/dg/sns-mobile-phone-number-as-subscriber.html
