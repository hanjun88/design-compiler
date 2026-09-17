# R3.20 Implementation Plan

## Phase 1: Pre-check
1. Confirm HEAD=3e2aabe, r34/r32 files clean (committed)
2. Confirm working tree state (pre-existing dirty files not touched)

## Phase 2: Implementation

### Step 2.1: Create entry reachability audit script
- Create `playbooks/verification/rev13-r320-entry-reachability-audit.sh`
- chmod +x
- shellcheck -x verification

### Step 2.2: Re-run guard tests at HEAD=3e2aabe
- Execute r34, capture exit code and stderr
- Execute r32, capture exit code and stderr
- Verify no worktree/tmp residue
- Generate `rev13-r320-guard-effectiveness-at-3e2aabe.log`

### Step 2.3: Generate comprehensive policy + audit evidence log
- Run entry reachability audit script
- git diff --name-status a55c67f 3e2aabe (raw output for P1 item 2)
- git diff a55c67f 3e2aabe -- compiler-core/ evaluation/ schemas/ (protected zone)
- Embed exit 2 semantic, version strategy, registry DEFERRED_UNRESOLVED
- Generate `rev13-r320-policy-and-final-audit.log`

## Phase 3: Verification
- shellcheck on new script
- Guard exit codes = 2
- Reachability audit ACTIVE_REFERENCES=0
- Protected zone 0 diff
- New logs HEAD_AT_TEST=3e2aabe

## Phase 4: Commit (append-only, no amend)
1. Source freeze: audit script
2. Evidence: 2 logs (git add -f)
3. Trellis artifacts
4. trellis finish + archive
5. push
