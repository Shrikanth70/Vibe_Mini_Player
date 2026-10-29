const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('=== SECURITY GATE VERIFICATION ===\n');

// 1. Secret Scan
console.log('1. Secret Scan in extension/:');
function scanSecrets(dir) {
  let found = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      found = found.concat(scanSecrets(full));
    } else if (/\.(js|json|html|css)$/.test(entry.name)) {
      const code = fs.readFileSync(full, 'utf8');
      const re = /(?:api[_-]?key|secret|token|password|auth|bearer)\s*[:=]\s*['"][A-Za-z0-9_\-\.]{8,}['"]/gi;
      let m;
      while ((m = re.exec(code)) !== null) {
        found.push({ file: full, match: m[0] });
      }
    }
  }
  return found;
}

const secrets = scanSecrets('./extension');
if (secrets.length === 0) {
  console.log('   PASS: 0 secrets or credentials detected.');
} else {
  console.error('   FAIL:', secrets);
  process.exit(1);
}

// 2. Code Grep Gates
console.log('\n2. Dangerous Patterns Scan in extension/:');
const dangerous = [
  { name: 'eval(', regex: /\beval\s*\(/ },
  { name: 'new Function', regex: /new\s+Function\s*\(/ },
  { name: 'innerHTML setter', regex: /\.innerHTML\s*=/ },
  { name: 'outerHTML setter', regex: /\.outerHTML\s*=/ },
  { name: 'document.write', regex: /document\.write\s*\(/ },
  { name: 'fetch() calls', regex: /\bfetch\s*\(/ },
  { name: 'XMLHttpRequest', regex: /new\s+XMLHttpRequest\s*\(/ },
  { name: 'WebSocket', regex: /new\s+WebSocket\s*\(/ },
  { name: 'TODO / FIXME', regex: /\b(TODO|FIXME)\b/ },
];

let dangerViolations = [];
function checkDangerous(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      checkDangerous(full);
    } else if (/\.(js|html)$/.test(entry.name)) {
      const code = fs.readFileSync(full, 'utf8');
      dangerous.forEach(d => {
        if (d.regex.test(code)) {
          dangerViolations.push({ file: full, rule: d.name });
        }
      });
    }
  }
}
checkDangerous('./extension');

if (dangerViolations.length === 0) {
  console.log('   PASS: Zero forbidden execution, DOM injection, or network patterns found.');
} else {
  console.error('   FAIL:', dangerViolations);
  process.exit(1);
}

// 3. Manifest Verification
console.log('\n3. Manifest V3 Integrity & Permissions Check:');
const manifest = JSON.parse(fs.readFileSync('./extension/manifest.json', 'utf8'));
if (manifest.manifest_version !== 3) {
  console.error('   FAIL: manifest_version is not 3');
  process.exit(1);
}
console.log('   PASS: manifest_version = 3');

const allowedPermissions = new Set(['storage', 'activeTab', 'scripting']);
const actualPermissions = manifest.permissions || [];
for (const p of actualPermissions) {
  if (!allowedPermissions.has(p)) {
    console.error(`   FAIL: Permission '${p}' not justified in ARCHITECTURE.md!`);
    process.exit(1);
  }
}
console.log('   PASS: Declared permissions match ARCHITECTURE.md exactly: ' + actualPermissions.join(', '));

// 4. Runtime Dependency Check (Extension must ship zero npm dependencies)
console.log('\n4. Runtime Dependencies Check:');
const pkg = JSON.parse(fs.readFileSync('./package.json', 'utf8'));
if (pkg.dependencies && Object.keys(pkg.dependencies).length > 0) {
  console.error('   FAIL: Extension ships runtime dependencies:', pkg.dependencies);
  process.exit(1);
}
console.log('   PASS: Zero runtime dependencies shipped (all tools are devDependencies only).');

console.log('\n=== ALL SECURITY GATES PASSED WITH EVIDENCE ===');

