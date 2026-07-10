import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateImageDataUrl } from '../src/lib/image.js';

// Helpers to build data URLs from raw bytes.
const toDataUrl = (mime, bytes) =>
  `data:${mime};base64,` + Buffer.from(bytes).toString('base64');

const JPEG = [0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0];
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0];
const WEBP = [...Buffer.from('RIFF'), 0, 0, 0, 0, ...Buffer.from('WEBP')];

test('accepts a real JPEG', () => {
  const r = validateImageDataUrl(toDataUrl('image/jpeg', JPEG));
  assert.equal(r.ok, true);
  assert.equal(r.mime, 'image/jpeg');
});

test('accepts a real PNG', () => {
  assert.equal(validateImageDataUrl(toDataUrl('image/png', PNG)).ok, true);
});

test('accepts a real WebP', () => {
  assert.equal(validateImageDataUrl(toDataUrl('image/webp', WEBP)).ok, true);
});

test('rejects SVG (script-carrying vector) even if well-formed', () => {
  const svg = toDataUrl('image/svg+xml', Buffer.from('<svg onload="alert(1)"></svg>'));
  const r = validateImageDataUrl(svg);
  assert.equal(r.ok, false);
  assert.match(r.error, /JPEG, PNG, or WebP/);
});

test('rejects a script mislabeled as PNG (magic bytes catch the lie)', () => {
  // Claims image/png but the bytes are a shell script.
  const fake = toDataUrl('image/png', Buffer.from('#!/bin/sh\nrm -rf /'));
  const r = validateImageDataUrl(fake);
  assert.equal(r.ok, false);
  assert.match(r.error, /does not look like a real image/);
});

test('rejects a JPEG-labelled payload whose bytes are actually PNG', () => {
  // Type confusion: label says jpeg, bytes are png.
  const r = validateImageDataUrl(toDataUrl('image/jpeg', PNG));
  assert.equal(r.ok, false);
});

test('rejects non-data-url strings', () => {
  assert.equal(validateImageDataUrl('https://evil.example/x.png').ok, false);
  assert.equal(validateImageDataUrl('not a url').ok, false);
  assert.equal(validateImageDataUrl('').ok, false);
});

test('rejects oversized images', () => {
  const big = 'data:image/png;base64,' + 'A'.repeat(1_500_000);
  const r = validateImageDataUrl(big);
  assert.equal(r.ok, false);
  assert.match(r.error, /too large/);
});

test('rejects gif (not in allowlist)', () => {
  const gif = toDataUrl('image/gif', [0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
  assert.equal(validateImageDataUrl(gif).ok, false);
});

test('handles non-string input safely', () => {
  assert.equal(validateImageDataUrl(null).ok, false);
  assert.equal(validateImageDataUrl(undefined).ok, false);
  assert.equal(validateImageDataUrl(12345).ok, false);
});
