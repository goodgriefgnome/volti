import { describe, expect, it } from 'vitest';
import { backgroundOf, DEFAULT_TOOL_SETTINGS, strokeColor, toolSettingsFrom } from './tool-settings';

const colors = { color: '#111111', background: '#222222' };

describe('toolSettingsFrom', () => {
  it('is the defaults for nothing or junk', () => {
    expect(toolSettingsFrom(undefined)).toEqual(DEFAULT_TOOL_SETTINGS);
    expect(toolSettingsFrom('junk')).toEqual(DEFAULT_TOOL_SETTINGS);
  });
  it('fills what is missing from the defaults and keeps the rest', () => {
    const s = toolSettingsFrom({ pen: { color: '#c2271d' }, text: { font: 'f', color: '#1f4fd1', background: 'box' } });
    expect(s.text).toEqual({ font: 'f', color: '#1f4fd1', background: 'box', backgroundColor: 'default' });
    expect(s.pen.color).toBe('#c2271d');
    expect(s.highlighter).toEqual({ color: 'default' });
  });
  it('replaces values of the wrong type', () => {
    expect(toolSettingsFrom({ pen: { color: 3 }, text: { background: 'blob' } })).toEqual(DEFAULT_TOOL_SETTINGS);
  });
});

describe('strokeColor', () => {
  it('follows the marking colour for the pen and the background colour for the highlighter on Default', () => {
    expect(strokeColor('pen', 'default', colors)).toBe('#111111');
    expect(strokeColor('highlighter', 'default', colors)).toBe('#222222');
  });
  it('is the choice otherwise', () => {
    expect(strokeColor('pen', '#c2271d', colors)).toBe('#c2271d');
    expect(strokeColor('highlighter', '#fff09a', colors)).toBe('#fff09a');
  });
});

describe('backgroundOf', () => {
  it('is nothing for none', () => expect(backgroundOf('none', '#fff09a')).toBeUndefined());
  it('has no colour on Default', () => expect(backgroundOf('box', 'default')).toEqual({ shape: 'box' }));
  it('has its own colour otherwise', () => expect(backgroundOf('box', '#fff09a')).toEqual({ shape: 'box', color: '#fff09a' }));
});
