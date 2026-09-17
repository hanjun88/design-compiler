#!/usr/bin/env python3
"""REV-13 R3.6 Full Log Closure Analyzer (Seq-Ordered Cross-Stream Merge).

Merges stdout+stderr by global sequence number (seq=), validates TEST_START
-> RESULT -> END state machine per test ID, enforces rc<->status dual
implication, and checks sequence continuity 1..99 with zero gaps.

Usage:
    python3 rev13-closure-analyzer.py \
        --stdout selftest-stdout.log \
        --stderr selftest-stderr.log \
        --registry rev13-test-registry.json
"""
import sys
import json
import re
import argparse
from collections import defaultdict


def parse_events(lines: list, source: str) -> tuple:
    """Parse TEST_START/RESULT/END events. Returns (events, unparsed_lines)."""
    events = []
    unparsed = []
    start_re = re.compile(r'^TEST_START\|id=(.+?)\|seq=(\d+)$')
    result_re = re.compile(r'^TEST_RESULT\|id=(.+?)\|status=(PASS|FAIL)\|seq=(\d+)$')
    end_re = re.compile(r'^TEST_END\|id=(.+?)\|rc=(\d+)\|seq=(\d+)$')

    for lineno, line in enumerate(lines, 1):
        line = line.rstrip('\n')
        m = start_re.match(line)
        if m:
            events.append({'type': 'START', 'id': m.group(1), 'seq': int(m.group(2)),
                           'source': source, 'line': lineno})
            continue
        m = result_re.match(line)
        if m:
            events.append({'type': 'RESULT', 'id': m.group(1), 'status': m.group(2),
                           'seq': int(m.group(3)), 'source': source, 'line': lineno})
            continue
        m = end_re.match(line)
        if m:
            events.append({'type': 'END', 'id': m.group(1), 'rc': int(m.group(2)),
                           'seq': int(m.group(3)), 'source': source, 'line': lineno})
            continue
        # Lines that look like lifecycle events but don't match strict format
        if line.startswith('TEST_'):
            unparsed.append({'source': source, 'line': lineno, 'content': line})
    return events, unparsed


def validate_registry(registry_path: str) -> dict:
    """Validate registry structure before closure computation. Structured errors only."""
    result = {
        'registry_file_exists': False,
        'registry_json_valid': False,
        'registry_is_object': False,
        'registry_tests_is_array': False,
        'registry_id_unique': False,
        'registry_count': 0,
        'registry_fields_complete': False,
        'duplicate_registry_ids': [],
        'malformed_registry_entries': [],
        'structure_error': None,
        'expected_ids': [],
        'total_expected_events': 0,
    }
    try:
        with open(registry_path) as f:
            registry = json.load(f)
        result['registry_file_exists'] = True
        result['registry_json_valid'] = True
    except Exception as e:
        result['structure_error'] = f'REGISTRY_READ_FAILED: {e}'
        return result

    # P1-2: type defense — registry must be a JSON object
    if not isinstance(registry, dict):
        result['structure_error'] = f'REGISTRY_STRUCTURE_MALFORMED: expected object, got {type(registry).__name__}'
        return result
    result['registry_is_object'] = True

    tests = registry.get('tests')
    # P1-2: tests must be a list
    if not isinstance(tests, list):
        result['structure_error'] = f'REGISTRY_STRUCTURE_MALFORMED: tests expected array, got {type(tests).__name__}'
        return result
    result['registry_tests_is_array'] = True
    result['registry_count'] = len(tests)

    # P1-2: each entry must be a dict
    ids = []
    malformed = []
    for idx, t in enumerate(tests):
        if not isinstance(t, dict):
            malformed.append({'index': idx, 'error': f'expected object, got {type(t).__name__}'})
            continue
        ids.append(t.get('test_id', ''))

    unique = set(ids)
    result['duplicate_registry_ids'] = [x for x in unique if ids.count(x) > 1]
    result['registry_id_unique'] = len(result['duplicate_registry_ids']) == 0

    required = ['test_id', 'function', 'anchor', 'assertion', 'emission_path', 'category']
    for t in tests:
        if not isinstance(t, dict):
            continue
        missing = [f for f in required if not t.get(f)]
        if missing:
            malformed.append({'test_id': t.get('test_id', '?'), 'missing': missing})
    result['malformed_registry_entries'] = malformed
    result['registry_fields_complete'] = len(malformed) == 0
    result['expected_ids'] = sorted(ids)
    # P1-1 R3.8: per-test expected_events accumulation, no hardcoded multiplier
    result['total_expected_events'] = sum(
        int(t.get('expected_events', 3)) for t in tests if isinstance(t, dict)
    )
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--stdout', required=True)
    parser.add_argument('--stderr', required=True)
    parser.add_argument('--registry', required=True)
    args = parser.parse_args()

    # 1. Validate registry
    reg_info = validate_registry(args.registry)
    registry_valid = (
        reg_info.get('structure_error') is None
        and reg_info['registry_file_exists']
        and reg_info['registry_json_valid']
        and reg_info.get('registry_is_object', False)
        and reg_info['registry_tests_is_array']
        and reg_info['registry_id_unique']
        and reg_info['registry_count'] == 33
        and reg_info['registry_fields_complete']
    )
    if not registry_valid:
        print("CLOSURE_ANALYSIS: FAIL (registry invalid)", file=sys.stderr)
        print(json.dumps(reg_info, indent=2), file=sys.stderr)
        sys.exit(1)

    expected_ids = set(reg_info['expected_ids'])

    # 2. Parse both streams independently
    with open(args.stdout) as f:
        stdout_lines = f.readlines()
    with open(args.stderr) as f:
        stderr_lines = f.readlines()

    stdout_events, stdout_unparsed = parse_events(stdout_lines, 'stdout')
    stderr_events, stderr_unparsed = parse_events(stderr_lines, 'stderr')

    # 3. TRUE cross-stream ordered merge: sort by global seq number
    all_events = sorted(stdout_events + stderr_events, key=lambda e: e['seq'])
    all_unparsed = stdout_unparsed + stderr_unparsed

    # 4. Sequence continuity check: must be exactly 1..N, no gaps, no duplicates
    seq_values = [e['seq'] for e in all_events]
    # P1-1 R3.8: per-test expected_events accumulation, zero hardcoded multiplier
    expected_test_count = reg_info['registry_count']
    expected_events_count = reg_info['total_expected_events']
    expected_seq = list(range(1, expected_events_count + 1))
    seq_gaps = [s for s in expected_seq if s not in seq_values]
    seq_duplicates = [s for s in set(seq_values) if seq_values.count(s) > 1]
    seq_continuous = (seq_values == expected_seq)

    # 5. Build per-ID state machine (in seq order)
    id_states = defaultdict(lambda: {'events': [], 'state': 'NOT_STARTED'})
    for ev in all_events:
        tid = ev['id']
        id_states[tid]['events'].append(ev)
        current = id_states[tid]['state']
        if ev['type'] == 'START' and current == 'NOT_STARTED':
            id_states[tid]['state'] = 'STARTED'
        elif ev['type'] == 'RESULT' and current == 'STARTED':
            id_states[tid]['state'] = 'RESULT_EMITTED'
            id_states[tid]['status'] = ev['status']
        elif ev['type'] == 'END' and current == 'RESULT_EMITTED':
            id_states[tid]['state'] = 'ENDED'
            id_states[tid]['rc'] = ev['rc']
        else:
            id_states[tid]['state'] = f'PROTOCOL_ERROR(at_{ev["type"]}_from_{current})'

    # 6. rc <-> status dual implication assertion
    rc_status_violations = []
    for tid, st in id_states.items():
        if st['state'] == 'ENDED':
            status = st.get('status')
            rc = st.get('rc')
            if status == 'PASS' and rc != 0:
                rc_status_violations.append({'id': tid, 'status': status, 'rc': rc})
            if status == 'FAIL' and rc == 0:
                rc_status_violations.append({'id': tid, 'status': status, 'rc': rc})

    # 7. Strict assertions per ID
    observed_ids = set(id_states.keys())
    missing_ids = expected_ids - observed_ids
    unexpected_ids = observed_ids - expected_ids

    strictly_passed = []
    failed_ids = []
    incomplete_chains = []

    for tid in sorted(expected_ids):
        if tid not in id_states:
            missing_ids.add(tid)
            continue
        st = id_states[tid]
        occ = len([e for e in st['events'] if e['type'] == 'RESULT'])
        passes = len([e for e in st['events'] if e['type'] == 'RESULT' and e['status'] == 'PASS'])
        fails = len([e for e in st['events'] if e['type'] == 'RESULT' and e['status'] == 'FAIL'])

        if st['state'] != 'ENDED':
            incomplete_chains.append({'id': tid, 'state': st['state']})
        elif occ == 1 and passes == 1 and fails == 0:
            strictly_passed.append(tid)
        else:
            failed_ids.append({'id': tid, 'occurrences': occ, 'pass': passes,
                               'fail': fails, 'state': st['state']})

    # 8. Verdict
    closure_pass = (
        seq_continuous
        and len(seq_gaps) == 0
        and len(seq_duplicates) == 0
        and len(all_unparsed) == 0
        and len(rc_status_violations) == 0
        and len(missing_ids) == 0
        and len(unexpected_ids) == 0
        and len(incomplete_chains) == 0
        and len(failed_ids) == 0
        and len(strictly_passed) == 33
    )

    report = {
        'registry_validation': 'PASS' if registry_valid else 'FAIL',
        'merge_mode': 'seq_ordered_cross_stream',
        'expected_registry_count': expected_test_count,
        'expected_event_count': expected_events_count,
        'observed_event_count': len(all_events),
        'seq_continuous': seq_continuous,
        'seq_gaps': seq_gaps,
        'seq_duplicates': seq_duplicates,
        'unparsed_lifecycle_lines': len(all_unparsed),
        'rc_status_violations': rc_status_violations,
        'observed_total_records': len(observed_ids),
        'strictly_passed_count': len(strictly_passed),
        'missing_count': len(missing_ids),
        'unexpected_count': len(unexpected_ids),
        'incomplete_chain_count': len(incomplete_chains),
        'failed_count': len(failed_ids),
        'missing_ids': sorted(missing_ids),
        'unexpected_ids': sorted(unexpected_ids),
        'incomplete_chains': incomplete_chains,
        'failed_ids': failed_ids,
        'strictly_passed_ids': strictly_passed,
        'closure_verdict': 'PASS' if closure_pass else 'FAIL',
    }

    print(json.dumps(report, indent=2))
    sys.exit(0 if closure_pass else 1)


if __name__ == '__main__':
    main()
