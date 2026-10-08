# Case Study — AXYOM Context Governor R1

## Objective

Reduce unnecessary model context while keeping task scope explicit and auditable.

## Public self-test results

- Python compile: PASS
- MICRO budget: 1,962 estimated tokens of 2,000
- NORMAL budget: 2,586 estimated tokens of 12,000
- Agent executed during self-test: FALSE
- Network used during self-test: FALSE

## Important limitation

Token values above are local estimates based on a simple approximation and are **not** provider billing measurements.

## Principle

Use the smallest adequate context, expand only when required, then verify the result.
