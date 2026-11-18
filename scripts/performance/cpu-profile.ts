import { number, object } from './validation.js';
interface CPUNode { name: string; url: string; line: number; samples: number }

export function summarizeCPU(value: unknown) {
  const profile = object(value);
  if (!Array.isArray(profile.nodes) || !Array.isArray(profile.samples)) throw new Error('Expected a Node CPU profile.');
  const nodes = new Map(profile.nodes.map((value: unknown): [number, CPUNode] => {
    const node = object(value); const frame = object(node.callFrame);
    return [number(node.id), { name: typeof frame.functionName === 'string' ? frame.functionName : '', url: typeof frame.url === 'string' ? frame.url : '', line: number(frame.lineNumber) + 1, samples: 0 }];
  }));
  for (const value of profile.samples as unknown[]) {
    const node = nodes.get(number(value)); if (node) node.samples++;
  }
  const active = [...nodes.values()].filter((node) => node.samples > 0 && !['(idle)', '(root)', '(program)'].includes(node.name));
  const total = active.reduce((sum, node) => sum + node.samples, 0);
  const grouped = new Map<string, CPUNode>();
  const files = new Map<string, number>();
  for (const node of active) {
    const key = `${node.url}:${node.line}:${node.name}`;
    const current = grouped.get(key) ?? { ...node, samples: 0 };
    current.samples += node.samples; grouped.set(key, current);
    files.set(node.url || '(native/GC)', (files.get(node.url || '(native/GC)') ?? 0) + node.samples);
  }
  return { totalActiveSamples: total, qualification: 'Node main-thread self samples, excluding idle/root/program and including GC/startup. Native query-engine worker CPU is not attributed; percentages are not process CPU seconds.',
    functions: [...grouped.values()].sort((a, b) => b.samples - a.samples).slice(0, 50).map((node) => ({ ...node, percent: total ? node.samples / total * 100 : 0 })),
    files: [...files].sort((a, b) => b[1] - a[1]).slice(0, 30).map(([url, samples]) => ({ url, samples, percent: total ? samples / total * 100 : 0 })),
  };
}
