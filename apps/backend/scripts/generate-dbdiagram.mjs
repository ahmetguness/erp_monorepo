import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Prisma } from '@prisma/client';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const outputPath = path.resolve(scriptDirectory, '../dbdiagram.dbml');
const schemaDirectory = path.resolve(scriptDirectory, '../prisma/schema');
const datamodel = Prisma.dmmf.datamodel;

const schemaIndexes = new Map();
for (const file of fs.readdirSync(schemaDirectory).filter((name) => name.endsWith('.prisma'))) {
  const source = fs.readFileSync(path.join(schemaDirectory, file), 'utf8');
  for (const match of source.matchAll(/model\s+(\w+)\s*\{([\s\S]*?)\n\}/g)) {
    const indexes = [...match[2].matchAll(/@@index\s*\(\s*\[([^\]]+)](?:\s*,\s*map:\s*"([^"]+)")?\s*\)/g)]
      .map((indexMatch) => ({
        fields: indexMatch[1].split(',').map((field) => field.trim().replace(/\(.+\)$/, '')),
        name: indexMatch[2] ?? null,
      }));
    schemaIndexes.set(match[1], indexes);
  }
}

const scalarTypes = {
  BigInt: 'bigint',
  Boolean: 'boolean',
  Bytes: 'bytea',
  DateTime: 'timestamp',
  Decimal: 'decimal',
  Float: 'float',
  Int: 'integer',
  Json: 'jsonb',
  String: 'varchar',
};

const referentialActions = {
  Cascade: 'cascade',
  NoAction: 'no action',
  Restrict: 'restrict',
  SetDefault: 'set default',
  SetNull: 'set null',
};

function tableName(modelName) {
  const model = datamodel.models.find((candidate) => candidate.name === modelName);
  return model?.dbName ?? modelName;
}

function columnName(model, fieldName) {
  const field = model.fields.find((candidate) => candidate.name === fieldName);
  return field?.dbName ?? fieldName;
}

function dbmlType(field) {
  const baseType = field.kind === 'enum' ? field.type : (scalarTypes[field.type] ?? field.type);
  return field.isList ? `${baseType}[]` : baseType;
}

function defaultValue(value) {
  if (value === null) return 'null';
  if (typeof value === 'boolean' || typeof value === 'number') return String(value);
  if (typeof value === 'string') return `'${value.replaceAll("'", "\\'")}'`;
  if (Array.isArray(value)) return value.length === 0 ? '`ARRAY[]`' : null;
  if (typeof value === 'object' && typeof value.name === 'string') {
    const args = Array.isArray(value.args) ? value.args.join(', ') : '';
    return `\`${value.name}(${args})\``;
  }
  return null;
}

function fieldAttributes(field) {
  const attributes = [];
  if (field.isId) attributes.push('pk');
  if (field.isUnique) attributes.push('unique');
  if (!field.isRequired) attributes.push('null');
  if (field.hasDefaultValue) {
    const renderedDefault = defaultValue(field.default);
    if (renderedDefault !== null) attributes.push(`default: ${renderedDefault}`);
  }
  if (field.isUpdatedAt) attributes.push('note: "Automatically updated timestamp"');
  return attributes.length > 0 ? ` [${attributes.join(', ')}]` : '';
}

function renderEnum(item) {
  const values = item.values.map((value) => `  ${value.dbName ?? value.name}`).join('\n');
  return `Enum ${item.dbName ?? item.name} {\n${values}\n}`;
}

function renderIndexes(model) {
  const indexes = [];
  const seen = new Set();
  for (const fields of model.uniqueFields) {
    const columns = fields.map((field) => columnName(model, field));
    const signature = `unique:${columns.join(',')}`;
    if (seen.has(signature)) continue;
    seen.add(signature);
    indexes.push(`    (${columns.join(', ')}) [unique]`);
  }
  if (model.primaryKey?.fields?.length) {
    const columns = model.primaryKey.fields.map((field) => columnName(model, field));
    indexes.push(`    (${columns.join(', ')}) [pk]`);
  }
  for (const index of schemaIndexes.get(model.name) ?? []) {
    const columns = index.fields.map((field) => columnName(model, field));
    const attributes = index.name ? ` [name: '${index.name}']` : '';
    indexes.push(`    (${columns.join(', ')})${attributes}`);
  }
  return indexes.length > 0 ? `\n\n  indexes {\n${indexes.join('\n')}\n  }` : '';
}

function renderTable(model) {
  const fields = model.fields
    .filter((field) => field.kind !== 'object')
    .map((field) => `  ${field.dbName ?? field.name} ${dbmlType(field)}${fieldAttributes(field)}`)
    .join('\n');
  return `Table ${model.dbName ?? model.name} {\n${fields}${renderIndexes(model)}\n}`;
}

function renderRelations() {
  const relations = [];
  const seen = new Set();
  for (const model of datamodel.models) {
    for (const field of model.fields) {
      if (field.kind !== 'object' || field.relationFromFields.length === 0) continue;
      const target = datamodel.models.find((candidate) => candidate.name === field.type);
      if (!target) continue;

      const sourceColumns = field.relationFromFields.map((sourceField) => columnName(model, sourceField));
      const targetColumns = field.relationToFields.map((targetField) => columnName(target, targetField));
      const sourceTable = model.dbName ?? model.name;
      const targetTable = target.dbName ?? target.name;
      const signature = `${sourceTable}.${sourceColumns.join(',')}:${targetTable}.${targetColumns.join(',')}`;
      if (seen.has(signature)) continue;
      seen.add(signature);

      const isUniqueRelation = model.uniqueFields.some((fields) =>
        fields.length === field.relationFromFields.length && fields.every((item) => field.relationFromFields.includes(item)),
      ) || (field.relationFromFields.length === 1 && model.fields.find((candidate) => candidate.name === field.relationFromFields[0])?.isUnique);
      const operator = isUniqueRelation ? '-' : '>';
      const settings = [];
      if (field.relationOnDelete) {
        settings.push(`delete: ${referentialActions[field.relationOnDelete] ?? field.relationOnDelete.toLowerCase()}`);
      }
      const sourceReference = sourceColumns.length === 1 ? `${sourceTable}.${sourceColumns[0]}` : `${sourceTable}.(${sourceColumns.join(', ')})`;
      const targetReference = targetColumns.length === 1 ? `${targetTable}.${targetColumns[0]}` : `${targetTable}.(${targetColumns.join(', ')})`;
      relations.push(`Ref: ${sourceReference} ${operator} ${targetReference}${settings.length ? ` [${settings.join(', ')}]` : ''}`);
    }
  }
  return relations.join('\n');
}

const output = [
  '// Generated from apps/backend/prisma/schema. Do not edit manually.',
  '// Regenerate with: npm --workspace=@repo/backend run db:diagram',
  '',
  'Project axon_erp {',
  "  database_type: 'PostgreSQL'",
  "  Note: 'AXON ERP database schema generated from Prisma DMMF'",
  '}',
  '',
  '// ENUMS',
  ...datamodel.enums.map(renderEnum),
  '',
  '// TABLES',
  ...datamodel.models.map(renderTable),
  '',
  '// RELATIONSHIPS',
  renderRelations(),
  '',
].join('\n\n');

fs.writeFileSync(outputPath, `${output.trimEnd()}\n`, 'utf8');
console.log(`Generated ${path.relative(process.cwd(), outputPath)} with ${datamodel.models.length} tables, ${datamodel.enums.length} enums.`);
