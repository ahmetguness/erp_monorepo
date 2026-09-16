import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface CopilotMarkdownTextProps {
  content: string;
  isUser?: boolean;
}

export const CopilotMarkdownText: React.FC<CopilotMarkdownTextProps> = ({
  content,
  isUser = false,
}) => {
  if (!content) return null;

  // Split lines
  const lines = content.split('\n');

  // Check if we have table lines to render
  const elements: React.ReactNode[] = [];
  let tableBuffer: string[] = [];

  const flushTable = () => {
    if (tableBuffer.length === 0) return;

    // Parse markdown table
    const rows = tableBuffer
      .filter((line) => !line.match(/^\|?\s*[-:]+[-|\s:]*$/)) // Remove header divider line |---|---|
      .map((line) =>
        line
          .split('|')
          .map((c) => c.trim())
          .filter((c, idx, arr) => (idx === 0 && c === '' ? false : idx === arr.length - 1 && c === '' ? false : true)),
      );

    if (rows.length > 0) {
      const header = rows[0];
      const body = rows.slice(1);

      elements.push(
        <View key={`table-${elements.length}`} style={styles.tableCard}>
          {header && (
            <View style={styles.tableHeaderRow}>
              {header.map((col, idx) => (
                <Text key={`th-${idx}`} style={styles.tableHeaderText} numberOfLines={1}>
                  {col}
                </Text>
              ))}
            </View>
          )}
          {body.map((row, rIdx) => (
            <View
              key={`tr-${rIdx}`}
              style={[
                styles.tableBodyRow,
                rIdx % 2 === 1 && styles.tableBodyRowAlt,
                rIdx === body.length - 1 && styles.tableBodyRowLast,
              ]}
            >
              {row.map((cell, cIdx) => (
                <Text key={`td-${rIdx}-${cIdx}`} style={styles.tableCellText} numberOfLines={2}>
                  {cell}
                </Text>
              ))}
            </View>
          ))}
        </View>,
      );
    }
    tableBuffer = [];
  };

  lines.forEach((line, index) => {
    const trimmed = line.trim();

    // Table detection: starts and/or contains |
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      tableBuffer.push(trimmed);
      return;
    } else {
      flushTable();
    }

    // Empty line
    if (!trimmed) {
      elements.push(<View key={`space-${index}`} style={styles.spacer} />);
      return;
    }

    // Headers
    if (trimmed.startsWith('### ')) {
      elements.push(
        <Text key={`h3-${index}`} style={[styles.h3, isUser && styles.userText]}>
          {renderInlineMarkdown(trimmed.slice(4), isUser)}
        </Text>,
      );
      return;
    }
    if (trimmed.startsWith('## ')) {
      elements.push(
        <Text key={`h2-${index}`} style={[styles.h2, isUser && styles.userText]}>
          {renderInlineMarkdown(trimmed.slice(3), isUser)}
        </Text>,
      );
      return;
    }
    if (trimmed.startsWith('# ')) {
      elements.push(
        <Text key={`h1-${index}`} style={[styles.h1, isUser && styles.userText]}>
          {renderInlineMarkdown(trimmed.slice(2), isUser)}
        </Text>,
      );
      return;
    }

    // Bullet points
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ') || trimmed.startsWith('• ')) {
      const bulletContent = trimmed.replace(/^[-*•]\s+/, '');
      elements.push(
        <View key={`bullet-${index}`} style={styles.bulletRow}>
          <Text style={[styles.bulletDot, isUser && styles.userBulletDot]}>•</Text>
          <Text style={[styles.bulletText, isUser && styles.userText]}>
            {renderInlineMarkdown(bulletContent, isUser)}
          </Text>
        </View>,
      );
      return;
    }

    // Numbered list
    const numMatch = trimmed.match(/^(\d+)\.\s+(.*)/);
    if (numMatch) {
      elements.push(
        <View key={`num-${index}`} style={styles.bulletRow}>
          <Text style={[styles.numDot, isUser && styles.userBulletDot]}>{numMatch[1]}.</Text>
          <Text style={[styles.bulletText, isUser && styles.userText]}>
            {renderInlineMarkdown(numMatch[2], isUser)}
          </Text>
        </View>,
      );
      return;
    }

    // Code block line / quote
    if (trimmed.startsWith('```')) {
      return; // Skip code fences
    }
    if (trimmed.startsWith('> ')) {
      elements.push(
        <View key={`quote-${index}`} style={styles.quoteBlock}>
          <Text style={styles.quoteText}>{renderInlineMarkdown(trimmed.slice(2), isUser)}</Text>
        </View>,
      );
      return;
    }

    // Normal paragraph
    elements.push(
      <Text key={`p-${index}`} style={[styles.paragraph, isUser && styles.userText]}>
        {renderInlineMarkdown(line, isUser)}
      </Text>,
    );
  });

  flushTable();

  return <View style={styles.container}>{elements}</View>;
};

// ─────────────────────────────────────────────
// Inline Markdown Parser (Bold, Code, Highlight)
// ─────────────────────────────────────────────

function renderInlineMarkdown(text: string, isUser: boolean): React.ReactNode {
  // Regex to split by bold **text** and inline `code`
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);

  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      const boldText = part.slice(2, -2);
      return (
        <Text key={`b-${i}`} style={[styles.boldText, isUser && styles.userBoldText]}>
          {boldText}
        </Text>
      );
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      const codeText = part.slice(1, -1);
      return (
        <Text key={`c-${i}`} style={[styles.inlineCode, isUser && styles.userInlineCode]}>
          {codeText}
        </Text>
      );
    }
    return <Text key={`t-${i}`}>{part}</Text>;
  });
}

// ─────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    gap: 4,
  },
  spacer: {
    height: 6,
  },
  paragraph: {
    fontSize: 14,
    color: '#E2E8F0',
    lineHeight: 21,
  },
  userText: {
    color: '#FFFFFF',
  },
  h1: {
    fontSize: 17,
    fontWeight: '700',
    color: '#38BDF8',
    marginTop: 4,
    marginBottom: 4,
  },
  h2: {
    fontSize: 15,
    fontWeight: '700',
    color: '#38BDF8',
    marginTop: 3,
    marginBottom: 2,
  },
  h3: {
    fontSize: 14,
    fontWeight: '600',
    color: '#7DD3FC',
    marginTop: 2,
  },
  boldText: {
    fontWeight: '700',
    color: '#F8FAFC',
  },
  userBoldText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  inlineCode: {
    fontFamily: 'monospace',
    backgroundColor: '#0F172A',
    color: '#38BDF8',
    fontSize: 12.5,
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 4,
    borderWidth: 0.5,
    borderColor: '#334155',
  },
  userInlineCode: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    color: '#FFFFFF',
    borderColor: 'transparent',
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    paddingLeft: 4,
  },
  bulletDot: {
    color: '#38BDF8',
    fontSize: 16,
    lineHeight: 20,
  },
  numDot: {
    color: '#38BDF8',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 20,
  },
  userBulletDot: {
    color: '#FFFFFF',
  },
  bulletText: {
    flex: 1,
    fontSize: 14,
    color: '#E2E8F0',
    lineHeight: 20,
  },
  quoteBlock: {
    borderLeftWidth: 3,
    borderLeftColor: '#0EA5E9',
    paddingLeft: 10,
    marginVertical: 4,
  },
  quoteText: {
    fontSize: 13,
    color: '#94A3B8',
    fontStyle: 'italic',
  },
  tableCard: {
    backgroundColor: '#0F172A',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
    marginVertical: 6,
    overflow: 'hidden',
  },
  tableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: '#1E293B',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  tableHeaderText: {
    flex: 1,
    fontSize: 11,
    fontWeight: '700',
    color: '#94A3B8',
    textTransform: 'uppercase',
  },
  tableBodyRow: {
    flexDirection: 'row',
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: '#1E293B',
  },
  tableBodyRowAlt: {
    backgroundColor: 'rgba(30, 41, 59, 0.4)',
  },
  tableBodyRowLast: {
    borderBottomWidth: 0,
  },
  tableCellText: {
    flex: 1,
    fontSize: 12,
    color: '#E2E8F0',
  },
});
