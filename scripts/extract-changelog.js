// =============================================================================
// scripts/extract-changelog.js
// Extracts release notes for a specific version from CHANGELOG.md
// =============================================================================

const fs = require('fs');
const path = require('path');

function getChangelogNotes(version, changelogPath) {
  const file = changelogPath || path.join(__dirname, '..', 'CHANGELOG.md');
  if (!fs.existsSync(file)) {
    return '';
  }

  const content = fs.readFileSync(file, 'utf8');
  // Strip optional 'v' prefix: v1.9.0 -> 1.9.0
  const cleanVersion = version.replace(/^v/, '');
  const escapedVersion = cleanVersion.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Match: ## [1.9.0] — 2026-09-12 (followed by anything until the next ## [ or EOF)
  const regex = new RegExp(`## \\[${escapedVersion}\\][^\\r\\n]*[\\r\\n]+([\\s\\S]*?)(?=[\\r\\n]+## \\[|$)`);
  const match = content.match(regex);
  if (!match) return '';

  let notes = match[1].trim();

  // Remove trailing horizontal rule (---) and whitespace if present
  notes = notes.replace(/[\r\n]+---\s*$/, '').trim();

  return notes;
}

if (require.main === module) {
  const version = process.argv[2] || process.env.VERSION;
  if (!version) {
    console.error('Error: Version argument required. Usage: node extract-changelog.js <version>');
    process.exit(1);
  }

  const notes = getChangelogNotes(version);
  const fallback = `Release v${version.replace(/^v/, '')}`;
  const finalNotes = notes || fallback;

  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `notes<<EOF\n${finalNotes}\nEOF\nNOTES<<EOF\n${finalNotes}\nEOF\n`);
    console.log(`Successfully extracted changelog for ${version} to GITHUB_OUTPUT.`);
  } else {
    console.log(finalNotes);
  }
}

module.exports = { getChangelogNotes };
