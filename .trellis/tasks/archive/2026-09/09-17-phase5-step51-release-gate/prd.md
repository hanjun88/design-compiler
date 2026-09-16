# Phase 5 Step 5.1: Release Gate Evidence & Contract Audit

## Goal

Provide independently verifiable evidence for Phase 5 Step 5.1 sealing. Three gaps identified by forensic review:

1. RFC 8785 official test vectors must be physically fetched and wired into tests (not hand-written vectors)
2. Full raw test stdout/stderr must be captured as traceable artifacts
3. Line-by-line contract audit against CHINESE-AESTHETIC-P5-S5.1-REV-06 every P0/P1 requirement

## Requirements

- Fetch RFC 8785 official test vectors from canonical source (cyberphone/json-canonicalization testdata)
- Store vectors under tests/chinese-aesthetic/runtime/fixtures/rfc8785/
- Add test that reads vectors from disk: input parsed via JSON.parse, expected read as raw string (NEVER JSON.parse expected)
- Re-run all tests with full stdout/stderr capture to log files
- Perform line-by-line audit of all 5 modules against REV-06 spec
- Produce audit report documenting each requirement → code location → status

## Acceptance Criteria

- [ ] RFC 8785 official vectors present in fixtures and consumed by tests
- [ ] Official vector tests PASS (raw string comparison methodology)
- [ ] Full test log captured: runtime 103/103, full regression 573/573
- [ ] Dual-gate TS log captured: GATE-A 0 errors, GATE-B 3/3 matched
- [ ] Contract audit report covers every P0/P1 item in REV-06
- [ ] All evidence committed and pushed
- [ ] git status clean

## Non-Goals

- No new runtime features
- No modification to existing 5 modules unless audit finds a real defect
- No Phase 5 Step 5.2 work
