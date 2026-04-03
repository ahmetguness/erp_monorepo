const reset  = "\x1b[0m";
const bold   = "\x1b[1m";
const dim    = "\x1b[2m";
const green  = "\x1b[32m";
const yellow = "\x1b[33m";
const red    = "\x1b[31m";
const cyan   = "\x1b[36m";
const magenta = "\x1b[35m";
const white  = "\x1b[37m";

function timestamp() {
  return `${dim}${new Date().toLocaleTimeString("tr-TR")}${reset}`;
}

export const logger = {
  info:    (msg: string) => console.log(`${timestamp()} ${cyan}${bold}INFO${reset}  ${white}${msg}${reset}`),
  success: (msg: string) => console.log(`${timestamp()} ${green}${bold} OK ${reset}  ${white}${msg}${reset}`),
  warn:    (msg: string) => console.log(`${timestamp()} ${yellow}${bold}WARN${reset}  ${white}${msg}${reset}`),
  error:   (msg: string) => console.log(`${timestamp()} ${red}${bold}ERR ${reset}  ${white}${msg}${reset}`),
  http:    (method: string, path: string, status: number, ms: number) => {
    const statusColor = status >= 500 ? red : status >= 400 ? yellow : green;
    const methodColor = magenta;
    console.log(
      `${timestamp()} ${cyan}${bold}HTTP${reset}  ${methodColor}${bold}${method.padEnd(6)}${reset}${white}${path.padEnd(30)}${reset} ${statusColor}${bold}${status}${reset} ${dim}${ms}ms${reset}`
    );
  },
};
