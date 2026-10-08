# Case Study — R4 to R5 Classification Adjudication

## Problem

An automated semantic classification pass produced useful results but also several role misclassifications.

## Response

The original R4 result was preserved unchanged as historical evidence. A separate R5 adjudication layer was created instead of rewriting history.

## Public result

- 18 repositories audited
- 8 material primary-role corrections
- 8 taxonomy refinements
- 2 classifications confirmed

## Engineering lesson

Historical evidence should remain immutable when a later review improves an earlier result.

The improved result should be recorded as a new adjudication, not retroactively substituted for the original.
