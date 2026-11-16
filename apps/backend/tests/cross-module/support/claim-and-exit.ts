import { claimNextEvent } from '../../../src/domain-events/delivery/repository.js';

// A real separate process exits without dispatching or acknowledging its committed claim.
async function crashAfterClaim(): Promise<void> {
  const lease = await claimNextEvent(process.argv[2]);
  if (!lease) throw new Error('Crash harness found no durable event.');
  process.stdout.write(JSON.stringify(lease));
  process.exit(88);

}
void crashAfterClaim().catch(() => process.exit(1));
