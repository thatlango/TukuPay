# Request validation and reconciliation settings

These are development candidate compatibility requirements, not a deployed API announcement.

Collection and payout creation share one HTTP parser:
| Field | Contract |
|---|---|
| product | 1–64 characters; lowercase normalized; letters, digits, underscore, hyphen; begins with letter or digit |
| externalId | Nonblank string, max 128 characters |
| country | Two letters, normalized uppercase; supported-market checks remain in service |
| money.currency | Three letters, normalized uppercase; supported currency allowlist |
| money.amount | Positive decimal string, max 64 characters; currency precision and signed BIGINT limit enforced |
| phone | Nonblank string, max 64 characters; provider-specific normalization remains separate |
| provider | Optional; mtn or airtel |
| description | Optional string, max 1024 characters; empty string omitted |
| metadata | Optional object, max 32768 serialized UTF-8 bytes |
| Idempotency-Key | Optional, one visible ASCII string of 1–128 characters, no whitespace or comma |

Text fields reject ASCII control characters. Invalid fields return HTTP 400 using the existing validation or monetary error code. Unknown extra fields remain ignored. Existing clients must be checked against these limits before promotion. These checks do not prove beneficiary ownership or valid phone numbering.

Reconciliation settings:
| Variable | Default | Valid values |
|---|---|---|
| RECONCILIATION_ENABLED | true | true or false, case-insensitive |
| RECONCILIATION_INTERVAL_MS | 15000 | Integer 5000–3600000 |
| RECONCILIATION_BATCH_SIZE | 50 | Integer 1–500 |

Invalid configuration fails before worker timer creation, including when disabled. Manual batch limits must also be integers in range. Existing polling worker is still process-local; distributed coordination and persistent run history are outstanding.

Signed monetary formatting accepts integer strings or bigint, supports zero and negative reporting values, and preserves exact precision. This does not permit nonpositive payment creation. No production activation or accounting policy changes.
