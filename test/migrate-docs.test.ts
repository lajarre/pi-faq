import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  parseMigrationArgs,
  renderHelp,
} from '../script/migrate-docs.ts';

describe('migration CLI help', () => {
  it('documents dry-run default and supported apply flags', () => {
    const args = parseMigrationArgs(['--help']);
    const help = renderHelp();

    assert.equal(args.help, true);
    assert.match(help, /Dry-run is the default/);
    assert.match(help, /--apply/);
    assert.match(help, /--write-conflicts/);
    assert.match(help, /--conflict-dir/);
  });
});
