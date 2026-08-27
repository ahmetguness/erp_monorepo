// Node 26 on Windows can report ENOMEM from os.userInfo(), which tsx uses only
// to namespace its temporary directory. A numeric process identity avoids that
// unrelated platform lookup before the tsx loader is registered.
if (typeof process.geteuid !== 'function') {
  Object.defineProperty(process, 'geteuid', { value: () => 0 });
}
