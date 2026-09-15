.PHONY: bootstrap env-check test build quality python-check

bootstrap:
	npm ci
	python3 -m venv .venv
	.venv/bin/python -m pip install --upgrade pip
	.venv/bin/python -m pip install -r requirements-dev.txt

env-check:
	python3 scripts/check-environment.py

test:
	npm run test:all

build:
	npm run build

python-check:
	python3 -m compileall -q step6-a scripts

quality: env-check python-check test build
