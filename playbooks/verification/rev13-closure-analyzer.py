#!/usr/bin/env python3
"""REV-13 R3.5 Full Log Closure Analyzer (Normalized State Table).

Merges stdout+stderr into ordered event stream, validates TEST_START→RESULT→END
state machine per test ID, enforces strict assertions against registry.

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


def parse_events(lines: list, source: str) -> list:
    """Parse TEST_START/RESULT/END events from log lines."""
    events = []
    start_re = re.compile(r'^TEST_START\|id=(.+)$')
    result_re = re.compile(r'^TEST_RESULT\|id=(.+)\|status=(PASS|FAIL)$')
    end_re = re.compile(r'^TEST_END\|id=(.+)\|rc=(\d+)$')

    for lineno, line in enumerate(lines, 1):
        line = line.rstrip('\n')
        m = start_re.match(line)
        if m:
            events.append({'type': 'START', 'id': m.group(1), 'source': source, 'line': lineno})
            continue
        m = result_re.match(line)
        if m:
            events.append({'type': 'RESULT', 'id': m.group(1), 'status': m.group(2), 'source': source, 'line': lineno})
            continue
        m = end_re.match(line)
        if m:
            events.append({'type': 'END', 'id': m.group(1), 'rc': int(m.group(2)), 'source': source, 'line': lineno})
            continue
    return events


def validate_registry(registry_path: str) -> dict:
    """Validate registry structure before closure computation."""
    result = {
        'registry_file_exists': False,
        'registry_json_valid': False,
        'registry_tests_is_array': False,
        'registry_id_unique': False,
        'registry_count': 0,
        'registry_fields_complete': False,
        'duplicate_registry_ids': [],
        'malformed_registry_entries': [],
    }

    try:
        with open(registry_path) as f:
            registry = json.load(f)
        result['registry_file_exists'] = True
        result['registry_json_valid'] = True
    except Exception as e:
        result['error'] = str(e)
        return result

    tests = registry.get('tests', [])
    if isinstance(tests, list):
        result['registry_tests_is_array'] = True
        result['registry_count'] = len(tests)

    ids = [t.get('test_id', '') for t in tests]
    unique = set(ids)
    result['duplicate_registry_ids'] = [x for x in unique if ids.count(x) > 1]
    result['registry_id_unique'] = len(result['duplicate_registry_ids']) == 0

    required = ['test_id', 'function', 'anchor', 'assertion', 'emission_path', 'category']
    malformed = []
    for t in tests:
        missing = [f for f in required if not t.get(f)]
        if missing:
            malformed.append({'test_id': t.get('test_id', '?'), 'missing': missing})
    result['malformed_registry_entries'] = malformed
    result['registry_fields_complete'] = len(malformed) == 0

    result['expected_ids'] = sorted(ids)
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--stdout', required=True)
    parser.add_argument('--stderr', required=True)
    parser.add_argument('--registry', required=True)
    args = parser.parse_args()

    # 1. Validate registry first
    reg_info = validate_registry(args.registry)
    registry_valid = (
        reg_info['registry_file_exists']
        and reg_info['registry_json_valid']
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

    # 2. Merge stdout + stderr into ordered event stream
    with open(args.stdout) as f:
        stdout_lines = f.readlines()
    with open(args.stderr) as f:
        stderr_lines = f.readlines()

    stdout_events = parse_events(stdout_lines, 'stdout')
    stderr_events = parse_events(stderr_lines, 'stderr')
    all_events = stdout_events + stderr_events

    # 3. Build per-ID state machine
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

    # 4. Strict assertions
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
            failed_ids.append({'id': tid, 'occurrences': occ, 'pass': passes, 'fail': fails, 'state': st['state']})

    # 5. Verdict
    closure_pass = (
        len(missing_ids) == 0
        and len(unexpected_ids) == 0
        and len(incomplete_chains) == 0
        and len(failed_ids) == 0
        and len(strictly_passed) == 33
    )

    report = {
        'registry_validation': 'PASS' if registry_valid else 'FAIL',
        'expected_registry_count': 33,
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

    if not closure_pass:
        sys.exit(1)
    sys.exit(0)


if __name__ == '__main__':
    main()
