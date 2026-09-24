'use strict';
const fs = require('node:fs');
const path = require('node:path');

function check(value, code) { if (!value) throw new Error(code); }
function inspect(runId, root = '/root') {
  check(typeof runId === 'string' && /^[1-9][0-9]{0,19}$/.test(runId), 'run_id');
  const toolsRoot = path.join(root, 'trbhh-release-tools');
  const dir = path.join(toolsRoot, runId);
  check(fs.realpathSync(toolsRoot) === toolsRoot && fs.realpathSync(dir) === dir, 'canonical_path');
  const dirInfo = fs.lstatSync(dir);
  check(dirInfo.isDirectory() && !dirInfo.isSymbolicLink() && (dirInfo.mode & 0o077) === 0, 'private_directory');

  const logPath = path.join(dir, 'deploy.log');
  const logInfo = fs.lstatSync(logPath);
  check(logInfo.isFile() && !logInfo.isSymbolicLink() && logInfo.nlink === 1 && logInfo.size <= 8 * 1024 * 1024 && (logInfo.mode & 0o077) === 0, 'private_log');
  const text = fs.readFileSync(logPath, 'utf8');
  const lines = text.split(/\r?\n/).slice(-300);
  const rules = [
    [/finance_capture status=(not_configured|unauthorized|http_[1-5][0-9]{2}|invalid_response|unavailable)/, 'capture_worker_rejected'],
    [/Database proof failed|database_proof_rejected/, 'database_preservation_check'],
    [/Supplier preservation.*failed|supplier_preservation_failed/, 'supplier_preservation_check'],
    [/finance-schema-check|Finance schema.*failed/, 'finance_schema_check'],
    [/Failed to (enable|start|stop).*trbhh-finance-capture|systemctl.*failed/i, 'capture_timer_operation'],
    [/ROLLBACK_REQUESTED/, 'rollback_watchdog_requested'],
    [/Finance deployment failed at stage finalize/, 'finalize_stage_failed'],
  ];
  const findings = [...new Set(rules.filter(([pattern]) => pattern.test(lines.join('\n'))).map(([, code]) => code))];
  const marker = (name) => {
    try {
      const file = path.join(root, 'trbhh-release-backups', `finance-${runId}`, name);
      const st = fs.lstatSync(file);
      check(st.isFile() && !st.isSymbolicLink() && st.nlink === 1 && st.size <= 256, 'marker_file');
      return fs.readFileSync(file, 'utf8').trim();
    } catch { return null; }
  };
  return {
    runId,
    findings: findings.length ? findings : ['finalize_substep_not_logged'],
    cutoverReady: marker('CUTOVER_READY') !== null,
    deploymentVerified: marker('DEPLOYMENT_VERIFIED') !== null,
    rolledBack: marker('ROLLED_BACK') !== null,
  };
}

try {
  const result = inspect(process.argv[2]);
  process.stdout.write(JSON.stringify(result) + '\n');
} catch {
  process.stderr.write('Release diagnostic unavailable; private deployment details withheld.\n');
  process.exitCode = 1;
}

module.exports = { inspect };
