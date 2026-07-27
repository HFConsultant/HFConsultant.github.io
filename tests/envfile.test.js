/**
 * Tests for .env summarising.
 *
 * The security-relevant test in here is the last one: the summary must never
 * contain a value. Everything this module produces gets printed to a terminal
 * or a shared screen, so a leak here would defeat the purpose of masking input
 * in the first place.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { summarize, describe, formatBytes, encryptedName, decryptedName } from '../js/envfile.js';

const ENV = `# Production credentials — do not commit
STRIPE_SECRET_KEY=sk_live_51H8xQ2eZvKYlo2C
DATABASE_URL=postgres://admin:hunter2@db.internal:5432/app

export AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
AWS_SECRET_ACCESS_KEY="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
`;

test('identifies a .env file and lists its variable names', () => {
	const summary = summarize(ENV);
	assert.equal(summary.kind, 'env');
	assert.deepEqual(summary.keys, [
		'STRIPE_SECRET_KEY',
		'DATABASE_URL',
		'AWS_ACCESS_KEY_ID',
		'AWS_SECRET_ACCESS_KEY'
	]);
});

test('ignores comments and blank lines', () => {
	const summary = summarize('# just a comment\n\n   \n# another\n');
	assert.equal(summary.kind, 'text');
	assert.deepEqual(summary.keys, []);
});

test('treats prose containing an equals sign as text, not configuration', () => {
	const prose = [
		'Hi Bob, here are the notes from standup.',
		'We agreed that latency = the main problem right now.',
		'Ship the fix on Friday.'
	].join('\n');

	const summary = summarize(prose);
	assert.equal(summary.kind, 'text');
	assert.deepEqual(summary.keys, []);
});

test('flags a variable defined more than once', () => {
	const summary = summarize('PORT=3000\nPORT=8080\nHOST=localhost\n');
	assert.deepEqual(summary.duplicates, ['PORT']);
	assert.deepEqual(summary.keys, ['PORT', 'HOST'], 'a duplicate is listed once');
});

test('handles empty input without throwing', () => {
	const summary = summarize('');
	assert.equal(summary.kind, 'text');
	assert.equal(summary.bytes, 0);
});

test('counts bytes, not characters', () => {
	// A naive .length would report 1 here.
	assert.equal(summarize('🔐').bytes, 4);
});

test('elides long variable lists', () => {
	const many = Array.from({ length: 20 }, (_, i) => `KEY_${i}=value`).join('\n');
	const text = describe(summarize(many), { max: 3 }).join(' ');
	assert.match(text, /KEY_0, KEY_1, KEY_2, and 17 more/);
});

test('suggests filenames that survive a round trip', () => {
	assert.equal(encryptedName('.env'), '.env.enc');
	assert.equal(decryptedName('.env.enc'), '.env');
	assert.equal(decryptedName(encryptedName('.env.production')), '.env.production');
	assert.equal(decryptedName('mystery'), 'mystery.decrypted');
});

test('formatBytes stays readable across magnitudes', () => {
	assert.equal(formatBytes(0), '0 bytes');
	assert.equal(formatBytes(512), '512 bytes');
	assert.equal(formatBytes(2048), '2.0 KB');
	assert.equal(formatBytes(5 * 1024 * 1024), '5.0 MB');
});

test('never reveals a value anywhere in the summary or its rendering', () => {
	// The point of the whole module. If this fails, the summary is unsafe to
	// show on a shared screen and the masking elsewhere is pointless.
	const secrets = [
		'sk_live_51H8xQ2eZvKYlo2C',
		'postgres://admin:hunter2@db.internal:5432/app',
		'hunter2',
		'AKIAIOSFODNN7EXAMPLE',
		'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'
	];

	const rendered = JSON.stringify(summarize(ENV)) + describe(summarize(ENV)).join('\n');

	for (const secret of secrets) {
		assert.ok(!rendered.includes(secret), `summary leaked a value: ${secret}`);
	}
});
