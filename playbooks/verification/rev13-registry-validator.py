#!/usr/bin/env python3
"""REV-13 R3.5 Registry <-> Source Bidirectional Validator.

Validates:
  - Registry structure: array, 33 unique IDs, all required fields
  - Registry -> Source: every test_id appears in source at its function
  - Source -> Registry: every record_test_result call is registered
  - Anchor verification: content hash of function body matches registry
  - Mode A enforcement: no test function directly calls record_test_result

Usage:
    python3 rev13-registry-validator.py \
        --registry tests/chinese-aesthetic/render/evidence/rev13-test-registry.json \
        --source playbooks/verification/verify-pipeline-artifacts.sh
"""
import sys
import json
import re
import hashlib
import argparse


def extract_function_bodies(source: str) -> dict:
    """Extract bash function bodies via brace matching. Returns {name: body}."""
    bodies = {}
    # Match function_name() { or function function_name {
    pattern = re.compile(r'^(?:function\s+)?([a-zA-Z_][a-zA-Z0-9_]*)\s*\(\s*\)\s*\{', re.MULTILINE)

    for m in pattern.finditer(source):
        fname = m.group(1)
        start = m.end()
        # Brace matching
        depth = 1
        pos = start
        while pos < len(source) and depth > 0:
            if source[pos] == '{':
                depth += 1
            elif source[pos] == '}':
                depth -= 1
            pos += 1
        body = source[start:pos - 1]
        bodies[fname] = body

    return bodies


def normalize_body(body: str) -> str:
    """Normalize whitespace for content hashing."""
    return re.sub(r'\s+', ' ', body.strip())


def content_hash(body: str) -> str:
    """SHA-256 of normalized function body."""
    return hashlib.sha256(normalize_body(body).encode('utf-8')).hexdigest()


def find_record_test_result_calls(source: str) -> list:
    """Find all record_test_result call arguments in source."""
    pattern = re.compile(r'record_test_result\s+["\']?([A-Za-z0-9_$\-]+)["\']?')
    ids = []
    for m in pattern.finditer(source):
        arg = m.group(1)
        if arg.startswith('$'):
            continue
        ids.append(arg)
    return ids


def find_run_one_test_calls(source: str) -> list:
    """Find all run_one_test dispatch IDs in source (Mode A emission path)."""
    pattern = re.compile(r'run_one_test\s+["\']([A-Za-z0-9_\-]+)["\']')
    ids = []
    for m in pattern.finditer(source):
        ids.append(m.group(1))
    return ids


def find_test_result_in_functions(bodies: dict) -> dict:
    """Check which functions call record_test_result directly (Mode A violation)."""
    violations = {}
    for fname, body in bodies.items():
        if fname in ('run_one_test', 'record_test_result'):
            continue
        calls = re.findall(r'record_test_result\s+', body)
        if calls:
            violations[fname] = len(calls)
    return violations


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--registry', required=True)
    parser.add_argument('--source', required=True)
    parser.add_argument('--dump-anchors', action='store_true',
                        help='Output JSON mapping function -> actual content hash')
    args = parser.parse_args()

    errors = []
    warnings = []

    # 1. Load and validate registry
    try:
        with open(args.registry) as f:
            registry = json.load(f)
    except Exception as e:
        print(f"FAIL: registry_json_valid: false ({e})", file=sys.stderr)
        sys.exit(1)

    tests = registry.get('tests', [])
    if not isinstance(tests, list):
        errors.append("registry_tests_is_array: false")
    else:
        print(f"registry_tests_is_array: true (count={len(tests)})", file=sys.stderr)

    # Count and uniqueness
    ids = [t.get('test_id', '') for t in tests]
    unique_ids = set(ids)
    duplicate_ids = [x for x in unique_ids if ids.count(x) > 1]

    print(f"registered_id_count: {len(tests)}", file=sys.stderr)
    print(f"registry_id_unique: {'true' if not duplicate_ids else 'false'}")
    if duplicate_ids:
        errors.append(f"duplicate_registry_ids: {duplicate_ids}")

    if len(tests) != 33:
        errors.append(f"registry_count: {len(tests)} (expected 33)")

    # Field completeness
    required_fields = ['test_id', 'function', 'anchor', 'assertion', 'emission_path', 'category']
    malformed = []
    for t in tests:
        missing = [f for f in required_fields if not t.get(f)]
        if missing:
            malformed.append({'test_id': t.get('test_id', '?'), 'missing': missing})
    if malformed:
        errors.append(f"malformed_registry_entries: {malformed}")
    else:
        print("registry_fields_complete: true")

    # 2. Load source and extract functions
    with open(args.source) as f:
        source = f.read()

    bodies = extract_function_bodies(source)
    print(f"source_functions_found: {len(bodies)}", file=sys.stderr)

    # Dump anchors mode: output function -> hash mapping and exit
    if args.dump_anchors:
        anchor_map = {}
        for t in tests:
            fname = t.get('function', '')
            if fname in bodies:
                anchor_map[fname] = content_hash(bodies[fname])
        print(json.dumps(anchor_map, indent=2))
        sys.exit(0)

    # 3. Anchor verification
    anchor_mismatches = []
    missing_functions = []
    for t in tests:
        fname = t.get('function', '')
        expected_anchor = t.get('anchor', '')
        if fname not in bodies:
            missing_functions.append(fname)
            continue
        actual_hash = content_hash(bodies[fname])
        if actual_hash != expected_anchor:
            anchor_mismatches.append({
                'test_id': t['test_id'],
                'function': fname,
                'expected': expected_anchor[:16] + '...',
                'actual': actual_hash[:16] + '...',
            })

    if missing_functions:
        errors.append(f"registry_functions_missing_in_source: {missing_functions}")
    else:
        print("registry_functions_exist_in_source: true")

    if anchor_mismatches:
        errors.append(f"anchor_mismatches: {anchor_mismatches}")
    else:
        print("anchor_verification: all_match")

    # 4. Source -> Registry: find all emission IDs (record_test_result + run_one_test)
    record_ids = find_record_test_result_calls(source)
    dispatch_ids = find_run_one_test_calls(source)
    source_ids = list(set(record_ids) | set(dispatch_ids))
    source_id_set = set(source_ids)
    print(f"source_emission_id_count: {len(source_id_set)} (record={len(set(record_ids))}, dispatch={len(set(dispatch_ids))})")

    registered_id_set = set(ids)
    unmapped = registered_id_set - source_id_set
    unregistered = source_id_set - registered_id_set

    print(f"unmapped_registry_ids: {sorted(unmapped) if unmapped else 'none'}")
    print(f"unregistered_source_ids: {sorted(unregistered) if unregistered else 'none'}")

    if unmapped:
        errors.append(f"unmapped_registry_ids_count: {len(unmapped)}")
    if unregistered:
        errors.append(f"unregistered_source_ids_count: {len(unregistered)}")

    # 5. Mode A enforcement: test functions must not call record_test_result directly
    mode_a_violations = find_test_result_in_functions(bodies)
    if mode_a_violations:
        errors.append(f"mode_a_violations (test functions calling record_test_result): {mode_a_violations}")
    else:
        print("mode_a_enforcement: true (only run_one_test emits TEST_RESULT)")

    # 6. Final verdict
    print("")
    if errors:
        print("REGISTRY_VALIDATION: FAIL")
        for e in errors:
            print(f"  ERROR: {e}", file=sys.stderr)
        sys.exit(1)
    else:
        print("REGISTRY_VALIDATION: PASS")
        print(f"  registered_id_count == 33: {len(tests) == 33}")
        print(f"  source_emission_id_count == 33: {len(source_id_set) == 33}")
        print(f"  unmapped_registry_ids == 0: {len(unmapped) == 0}")
        print(f"  unregistered_source_ids == 0: {len(unregistered) == 0}")
        print(f"  duplicate_registry_ids == 0: {len(duplicate_ids) == 0}")
        print(f"  anchor_matches == all: {len(anchor_mismatches) == 0}")
        sys.exit(0)


if __name__ == '__main__':
    main()
