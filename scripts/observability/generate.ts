import { writeOperationalConfiguration } from "./configuration.js";
writeOperationalConfiguration().catch(() => {
  process.stderr.write("Operational configuration generation failed.\n");
  process.exitCode = 1;
});
