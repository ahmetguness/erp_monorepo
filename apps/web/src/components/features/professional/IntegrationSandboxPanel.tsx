"use client";

import { useMemo, useState } from "react";
import { Download, FileJson, FlaskConical, Terminal, TestTube2 } from "lucide-react";
import { API_BASE_URL } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { type IntegrationSandbox, type IntegrationSandboxExample } from "@/services/api-key.service";

interface IntegrationSandboxPanelProps {
  sandbox?: IntegrationSandbox;
  loading?: boolean;
}

function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function methodClass(method: IntegrationSandboxExample["method"]): string {
  if (method === "GET") return "bg-emerald-500/10 text-emerald-300 border-emerald-500/20";
  if (method === "POST") return "bg-sky-500/10 text-sky-300 border-sky-500/20";
  if (method === "PATCH") return "bg-amber-500/10 text-amber-300 border-amber-500/20";
  return "bg-red-500/10 text-red-300 border-red-500/20";
}

function exampleKey(example: Pick<IntegrationSandboxExample, "method" | "path">): string {
  return `${example.method}-${example.path}`;
}

export function IntegrationSandboxPanel({ sandbox, loading = false }: IntegrationSandboxPanelProps) {
  const examples = useMemo(() => sandbox?.examples ?? [], [sandbox?.examples]);
  const groups = useMemo(() => Array.from(new Set(examples.map((example) => example.group))), [examples]);
  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  const [activeExampleKey, setActiveExampleKey] = useState<string | null>(null);
  const selectedGroup = activeGroup ?? groups[0] ?? "";
  const visibleExamples = examples.filter((example) => example.group === selectedGroup);
  const selectedExample = visibleExamples.find((example) => exampleKey(example) === activeExampleKey) ?? visibleExamples[0];

  return (
    <div className="mb-6 bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
      <div className="flex flex-col gap-3 border-b border-slate-800/80 pb-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-2">
          <FlaskConical className="h-5 w-5 text-cyan-400" />
          <div>
            <h3 className="text-sm font-bold text-white">Entegrasyon Sandbox</h3>
            <p className="text-[11px] text-slate-500 font-medium">
              API anahtarları için test endpointleri, sandbox header örnekleri ve dışa aktarılabilir dokümantasyon.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href={`${API_BASE_URL}/api/api-keys/postman.json`}
            download
            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-orange-500/20 bg-orange-500/10 px-3 text-xs font-semibold text-orange-300 transition-colors hover:bg-orange-500/20"
          >
            <Download className="h-3.5 w-3.5" />
            Postman
          </a>
          <a
            href={`${API_BASE_URL}/api/api-keys/openapi.json`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-sky-500/20 bg-sky-500/10 px-3 text-xs font-semibold text-sky-300 transition-colors hover:bg-sky-500/20"
          >
            <FileJson className="h-3.5 w-3.5" />
            OpenAPI
          </a>
        </div>
      </div>

      {loading && (
        <div className="h-40 rounded-xl border border-slate-850 bg-slate-950/40 animate-pulse" />
      )}

      {!loading && sandbox && (
        <div className="grid gap-4 xl:grid-cols-[280px_1fr]">
          <div className="space-y-3">
            <div className="rounded-xl border border-slate-850 bg-slate-950/40 p-3">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Base URL</span>
              <code className="mt-2 block break-all rounded-lg bg-slate-950 px-2 py-1.5 text-[11px] text-slate-300">
                {sandbox.baseUrl}
              </code>
              <div className="mt-3 grid grid-cols-2 gap-2 text-[10px]">
                <div className="rounded-lg border border-slate-800 bg-slate-900 px-2 py-1.5">
                  <span className="block text-slate-500">Auth</span>
                  <span className="font-mono text-slate-300">{sandbox.auth.apiKeyHeader}</span>
                </div>
                <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/10 px-2 py-1.5">
                  <span className="block text-cyan-400">Sandbox</span>
                  <span className="font-mono text-cyan-200">{sandbox.auth.sandboxHeader}: true</span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {groups.map((group) => (
                <button
                  key={group}
                  type="button"
                  onClick={() => {
                    setActiveGroup(group);
                    setActiveExampleKey(null);
                  }}
                  className={cn(
                    "h-7 rounded-lg border px-2.5 text-xs font-semibold transition-colors",
                    group === selectedGroup
                      ? "border-cyan-500/30 bg-cyan-500/15 text-cyan-200"
                      : "border-slate-800 bg-slate-950/30 text-slate-500 hover:text-slate-300",
                  )}
                >
                  {group}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <div className="grid gap-2 lg:grid-cols-2">
              {visibleExamples.map((example) => (
                <button
                  key={exampleKey(example)}
                  type="button"
                  onClick={() => setActiveExampleKey(exampleKey(example))}
                  className={cn(
                    "rounded-xl border p-3 text-left transition-colors",
                    selectedExample && exampleKey(example) === exampleKey(selectedExample)
                      ? "border-cyan-500/30 bg-cyan-500/10"
                      : "border-slate-850 bg-slate-950/35 hover:border-slate-700",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={cn("rounded-md border px-1.5 py-0.5 text-[10px] font-bold", methodClass(example.method))}>
                          {example.method}
                        </span>
                        <span className="text-xs font-semibold text-white">{example.title}</span>
                      </div>
                      <p className="mt-1 line-clamp-2 text-[11px] text-slate-500">{example.description}</p>
                    </div>
                    <span className="shrink-0 rounded-md bg-slate-900 px-1.5 py-0.5 font-mono text-[10px] text-slate-400">
                      {example.scope}
                    </span>
                  </div>
                  <code className="mt-2 block truncate rounded-lg bg-slate-950 px-2 py-1.5 text-[11px] text-slate-400">
                    {example.path}
                  </code>
                </button>
              ))}
            </div>

            {selectedExample && (
              <div className="grid gap-3 lg:grid-cols-2">
                <div className="rounded-xl border border-slate-850 bg-slate-950/40 p-3">
                  <div className="mb-2 flex items-center gap-2 text-xs font-bold text-white">
                    <Terminal className="h-3.5 w-3.5 text-cyan-400" />
                    cURL Sandbox Örneği
                  </div>
                  <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-950 p-3 text-[11px] leading-5 text-slate-300">
                    {selectedExample.curl}
                  </pre>
                </div>
                <div className="rounded-xl border border-slate-850 bg-slate-950/40 p-3">
                  <div className="mb-2 flex items-center gap-2 text-xs font-bold text-white">
                    <TestTube2 className="h-3.5 w-3.5 text-cyan-400" />
                    Örnek Yanıt
                  </div>
                  <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-950 p-3 text-[11px] leading-5 text-slate-300">
                    {formatJson(selectedExample.responseExample)}
                  </pre>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
