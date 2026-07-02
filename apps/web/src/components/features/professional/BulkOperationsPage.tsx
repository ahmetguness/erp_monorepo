"use client";

import { useMemo, useState } from "react";
import { ClipboardList, Loader2, Play, RotateCcw, Search } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useExecuteBulkOperation, usePreviewBulkOperation } from "@/hooks/useBulkOperations";
import { cn } from "@/lib/utils";
import type { BulkOperationPayload, BulkOperationResult, BulkOperationTarget, BulkOperationValue } from "@/services/bulk-operation.service";

interface FieldOption {
  value: string;
  label: string;
  kind: "text" | "number" | "boolean" | "date";
  nullable?: boolean;
}

const TARGET_OPTIONS: Array<{ value: BulkOperationTarget; label: string }> = [
  { value: "contacts", label: "Cari" },
  { value: "products", label: "Urun" },
  { value: "invoices", label: "Fatura" },
];

const FIELD_OPTIONS: Record<BulkOperationTarget, FieldOption[]> = {
  contacts: [
    { value: "isActive", label: "Aktiflik", kind: "boolean" },
    { value: "city", label: "Sehir", kind: "text", nullable: true },
    { value: "country", label: "Ulke", kind: "text" },
    { value: "paymentTermDays", label: "Odeme vadesi", kind: "number", nullable: true },
    { value: "notes", label: "Not", kind: "text", nullable: true },
  ],
  products: [
    { value: "isActive", label: "Aktiflik", kind: "boolean" },
    { value: "salesPrice", label: "Satis fiyati", kind: "number" },
    { value: "purchasePrice", label: "Alis fiyati", kind: "number" },
    { value: "minStockLevel", label: "Minimum stok", kind: "number" },
    { value: "description", label: "Aciklama", kind: "text", nullable: true },
  ],
  invoices: [
    { value: "dueDate", label: "Vade tarihi", kind: "date", nullable: true },
    { value: "notes", label: "Not", kind: "text", nullable: true },
  ],
};

function parseIds(value: string): string[] {
  return value
    .split(/[\n,;]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function resolveValue(field: FieldOption, rawValue: string): BulkOperationValue {
  if (field.nullable && rawValue.trim() === "") return null;
  if (field.kind === "boolean") return rawValue === "true";
  if (field.kind === "number") return rawValue.trim();
  return rawValue.trim();
}

function formatValue(value: BulkOperationValue): string {
  if (value === null) return "Bos";
  if (typeof value === "boolean") return value ? "Evet" : "Hayir";
  return String(value);
}

function ResultSummary({ result }: { result: BulkOperationResult }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
      <div className="rounded-lg border border-slate-800 bg-slate-900 p-3">
        <p className="text-[10px] font-medium uppercase text-slate-500">Istenen</p>
        <p className="mt-1 text-lg font-semibold text-white">{result.totalRequested}</p>
      </div>
      <div className="rounded-lg border border-slate-800 bg-slate-900 p-3">
        <p className="text-[10px] font-medium uppercase text-slate-500">Bulunan</p>
        <p className="mt-1 text-lg font-semibold text-white">{result.matched}</p>
      </div>
      <div className="rounded-lg border border-slate-800 bg-slate-900 p-3">
        <p className="text-[10px] font-medium uppercase text-slate-500">Degisecek</p>
        <p className="mt-1 text-lg font-semibold text-emerald-400">{result.changed}</p>
      </div>
      <div className="rounded-lg border border-slate-800 bg-slate-900 p-3">
        <p className="text-[10px] font-medium uppercase text-slate-500">Atlanan</p>
        <p className="mt-1 text-lg font-semibold text-amber-400">{result.skipped}</p>
      </div>
      <div className="rounded-lg border border-slate-800 bg-slate-900 p-3">
        <p className="text-[10px] font-medium uppercase text-slate-500">Eksik ID</p>
        <p className="mt-1 text-lg font-semibold text-red-400">{result.missingIds.length}</p>
      </div>
    </div>
  );
}

export function BulkOperationsPage() {
  const [target, setTarget] = useState<BulkOperationTarget>("contacts");
  const [field, setField] = useState(FIELD_OPTIONS.contacts[0].value);
  const [rawValue, setRawValue] = useState("true");
  const [idsText, setIdsText] = useState("");
  const [result, setResult] = useState<BulkOperationResult | null>(null);

  const preview = usePreviewBulkOperation();
  const execute = useExecuteBulkOperation();
  const fields = FIELD_OPTIONS[target];
  const selectedField = fields.find((item) => item.value === field) ?? fields[0];
  const ids = useMemo(() => parseIds(idsText), [idsText]);

  const payload: BulkOperationPayload = {
    ids,
    field: selectedField.value,
    value: resolveValue(selectedField, rawValue),
  };

  const updateRawValue = (value: string) => {
    setRawValue(value);
    setResult(null);
  };

  const resetField = (nextTarget: BulkOperationTarget) => {
    const nextField = FIELD_OPTIONS[nextTarget][0];
    setTarget(nextTarget);
    setField(nextField.value);
    setRawValue(nextField.kind === "boolean" ? "true" : "");
    setResult(null);
  };

  const runPreview = () => {
    preview.mutate(
      { target, payload },
      { onSuccess: (data) => setResult(data) },
    );
  };

  const runExecute = () => {
    execute.mutate(
      { target, payload },
      { onSuccess: (data) => setResult(data) },
    );
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Toplu Islem Merkezi"
        subtitle="Cari, urun ve fatura kayitlari icin onizlemeli ve audit kayitli toplu guncelleme."
      />

      <section className="rounded-xl border border-slate-800 bg-slate-900 p-5">
        <div className="grid gap-4 lg:grid-cols-4">
          <Select
            label="Hedef"
            value={target}
            onChange={(event) => resetField(event.target.value as BulkOperationTarget)}
            options={TARGET_OPTIONS}
          />
          <Select
            label="Alan"
            value={field}
            onChange={(event) => {
              const nextField = fields.find((item) => item.value === event.target.value) ?? fields[0];
              setField(nextField.value);
              setRawValue(nextField.kind === "boolean" ? "true" : "");
              setResult(null);
            }}
            options={fields.map((item) => ({ value: item.value, label: item.label }))}
          />
          {selectedField.kind === "boolean" && (
            <Select
              label="Yeni deger"
              value={rawValue}
              onChange={(event) => updateRawValue(event.target.value)}
              options={[
                { value: "true", label: "Aktif / Evet" },
                { value: "false", label: "Pasif / Hayir" },
              ]}
            />
          )}
          {selectedField.kind !== "boolean" && (
            <Input
              label="Yeni deger"
              type={selectedField.kind === "date" ? "date" : "text"}
              value={rawValue}
              onChange={(event) => updateRawValue(event.target.value)}
              placeholder={selectedField.nullable ? "Bos birakilirsa null olur" : "Yeni deger"}
            />
          )}
        </div>

        <div className="mt-4">
          <label className="mb-2 block text-xs font-medium text-slate-400">Kayit ID listesi</label>
          <textarea
            value={idsText}
            onChange={(event) => {
              setIdsText(event.target.value);
              setResult(null);
            }}
            className="min-h-28 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none transition-colors placeholder:text-slate-600 focus:border-sky-500"
            placeholder="Her satira bir ID veya virgulle ayrilmis ID listesi"
          />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge variant={ids.length > 100 ? "danger" : "neutral"}>{ids.length} kayit secildi</Badge>
            <Badge variant="info">Maksimum 100 kayit</Badge>
            <Badge variant="purple">Professional</Badge>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            leftIcon={preview.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
            disabled={ids.length === 0 || ids.length > 100 || preview.isPending}
            onClick={runPreview}
          >
            Onizle
          </Button>
          <Button
            type="button"
            leftIcon={execute.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
            disabled={!result || result.mode !== "preview" || result.changed === 0 || execute.isPending}
            onClick={runExecute}
          >
            Guvenli guncelle
          </Button>
          <Button
            type="button"
            variant="ghost"
            leftIcon={<RotateCcw className="h-3.5 w-3.5" />}
            onClick={() => {
              setResult(null);
              setIdsText("");
            }}
          >
            Temizle
          </Button>
        </div>
      </section>

      {result && (
        <section className="space-y-4">
          <ResultSummary result={result} />

          <div className="rounded-xl border border-slate-800 bg-slate-900">
            <div className="flex flex-col gap-2 border-b border-slate-800 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <ClipboardList className="h-4 w-4 text-sky-400" />
                <h3 className="text-sm font-semibold text-white">Onizleme sonucu</h3>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant={result.mode === "execute" ? "success" : "warning"}>{result.mode === "execute" ? "Uygulandi" : "Onizleme"}</Badge>
                {result.rollbackLogId && <Badge variant="info">Rollback log: {result.rollbackLogId}</Badge>}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="border-b border-slate-800 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-5 py-3">Kayit</th>
                    <th className="px-5 py-3">Alan</th>
                    <th className="px-5 py-3">Eski</th>
                    <th className="px-5 py-3">Yeni</th>
                    <th className="px-5 py-3">Durum</th>
                  </tr>
                </thead>
                <tbody>
                  {result.changes.map((change) => (
                    <tr key={change.id} className="border-b border-slate-800/70 last:border-0">
                      <td className="px-5 py-3">
                        <p className="font-medium text-slate-100">{change.label}</p>
                        <p className="text-xs text-slate-500">{change.id}</p>
                      </td>
                      <td className="px-5 py-3 text-slate-300">{change.field}</td>
                      <td className="px-5 py-3 text-slate-400">{formatValue(change.oldValue)}</td>
                      <td className="px-5 py-3 text-slate-200">{formatValue(change.newValue)}</td>
                      <td className="px-5 py-3">
                        <Badge variant={change.changed ? "success" : "neutral"} className={cn(!change.changed && "opacity-70")}>
                          {change.changed ? "Degisecek" : "Ayni"}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
