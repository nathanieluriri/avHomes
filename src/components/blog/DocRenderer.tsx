import { Fragment, type ReactNode } from "react";
import type { DocNode } from "@/lib/blog/types";
import { imageUrl, isAllowedHref, isExternalHref, plainText } from "@/lib/blog/utils";
import { highlightCode } from "@/lib/blog/highlight";

type DocMark = NonNullable<DocNode["marks"]>[number];

export default function DocRenderer({ doc }: { doc: DocNode | null | undefined }) {
  const content = doc?.content;
  if (!content || content.length === 0) return null;
  return <>{content.map((node, i) => renderNode(node, `n-${i}`))}</>;
}

/**
 * A code block, coloured by the SAME registry the editor uses.
 *
 * Highlighting happens here rather than in the browser: this renders on the
 * server, so the colour is in the HTML a reader receives and there is no
 * flash of monochrome while a client-side highlighter loads.
 *
 * A block with no language, or one naming a grammar we do not carry, renders
 * monochrome. It never guesses: a shell snippet becoming Perl in one paragraph
 * and Ruby in the next is worse than plain text.
 */
function renderCodeBlock(node: DocNode, key: string): ReactNode {
  const code = plainText(node);
  const language = typeof node.attrs?.language === "string" ? node.attrs.language : null;
  const tree = highlightCode(code, language);

  return (
    <pre key={key} className="doc-code" data-language={language ?? undefined}>
      <code>{tree ? tree.children.map((child, i) => renderHast(child, `${key}-${i}`)) : code}</code>
    </pre>
  );
}

/**
 * hast is a tiny tree, and highlighting only ever produces two shapes in it:
 * text, and a span carrying highlight.js class names. Narrowed structurally
 * rather than against hast's own types, so this file does not take a dependency
 * on them for four fields.
 */
function renderHast(node: unknown, key: string): ReactNode {
  if (node === null || typeof node !== "object") return null;
  const n = node as { type?: unknown; value?: unknown; properties?: unknown; children?: unknown };

  if (n.type === "text") return typeof n.value === "string" ? n.value : null;
  if (n.type !== "element") return null;

  const props = n.properties as { className?: unknown } | undefined;
  const className = Array.isArray(props?.className) ? props.className.join(" ") : undefined;
  const children = Array.isArray(n.children) ? n.children : [];

  return (
    <span key={key} className={className}>
      {children.map((child, i) => renderHast(child, `${key}-${i}`))}
    </span>
  );
}

function renderChildren(node: DocNode, keyBase: string): ReactNode[] {
  return (node.content ?? []).map((child, i) => renderNode(child, `${keyBase}-${i}`));
}

function renderNode(node: DocNode, key: string): ReactNode {
  switch (node.type) {
    case "text":
      return applyMarks(node.text ?? "", node.marks, key);

    case "paragraph":
      return <p key={key}>{renderChildren(node, key)}</p>;

    case "heading":
      return node.attrs?.level === 3 ? (
        <h3 key={key}>{renderChildren(node, key)}</h3>
      ) : (
        <h2 key={key}>{renderChildren(node, key)}</h2>
      );

    case "blockquote":
      return (
        <blockquote key={key} className="doc-quote">
          {renderChildren(node, key)}
        </blockquote>
      );

    case "bulletList":
      return <ul key={key}>{renderChildren(node, key)}</ul>;

    case "orderedList":
      return (
        <ol key={key} start={Number(node.attrs?.start) || undefined}>
          {renderChildren(node, key)}
        </ol>
      );

    case "listItem":
      return <li key={key}>{renderChildren(node, key)}</li>;

    case "taskList":
      return (
        <ul key={key} className="doc-tasks" data-type="taskList">
          {renderChildren(node, key)}
        </ul>
      );

    case "taskItem":
      return renderTaskItem(node, key);

    case "codeBlock":
      return renderCodeBlock(node, key);

    case "table":
      return renderTable(node, key);

    case "tableRow":
      return <tr key={key}>{renderChildren(node, key)}</tr>;

    case "tableHeader":
      return renderCell("th", node, key);

    case "tableCell":
      return renderCell("td", node, key);

    case "horizontalRule":
      return <hr key={key} className="doc-rule" />;

    case "hardBreak":
      return <br key={key} />;

    case "image":
      return renderImage(node, key);

    default:
      // Unknown node types unwrap to their children: text survives, the shape is dropped.
      return <Fragment key={key}>{renderChildren(node, key)}</Fragment>;
  }
}

function applyMarks(text: string, marks: DocMark[] | undefined, keyBase: string): ReactNode {
  if (!marks || marks.length === 0) return text;
  // Marks wrap outward in array order: marks[0] sits closest to the text.
  return marks.reduce<ReactNode>((child, mark, i) => wrapMark(mark, child, `${keyBase}-m${i}`), text);
}

function wrapMark(mark: DocMark, children: ReactNode, key: string): ReactNode {
  switch (mark.type) {
    case "bold":
      return <strong key={key}>{children}</strong>;
    case "italic":
      return <em key={key}>{children}</em>;
    case "underline":
      return <u key={key}>{children}</u>;
    case "strike":
      return <s key={key}>{children}</s>;
    case "code":
      return <code key={key}>{children}</code>;
    case "link":
      return renderLink(mark, children, key);
    default:
      // Unrecognised mark types are dropped; the content they would have wrapped still renders.
      return children;
  }
}

function renderLink(mark: DocMark, children: ReactNode, key: string): ReactNode {
  const hrefRaw = mark.attrs?.href;
  const href = typeof hrefRaw === "string" ? hrefRaw : "";
  // Disallowed or missing hrefs degrade to plain, unlinked text rather than dropping the content.
  if (!isAllowedHref(href)) return children;
  const external = isExternalHref(href);
  return (
    <a
      key={key}
      className="doc-link"
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noopener noreferrer nofollow" : undefined}
    >
      {children}
    </a>
  );
}

function renderTaskItem(node: DocNode, key: string): ReactNode {
  const checked = node.attrs?.checked === true;
  return (
    <li key={key} data-checked={checked ? "true" : "false"} data-type="taskItem">
      <label>
        <input
          type="checkbox"
          checked={checked}
          readOnly
          disabled
          aria-label={plainText(node) || "task item"}
        />
        <span />
      </label>
      <div>{renderChildren(node, key)}</div>
    </li>
  );
}

function renderTable(node: DocNode, key: string): ReactNode {
  const colWidths = firstRowColWidths(node);
  const hasWidth = colWidths.some((w) => w !== undefined);
  return (
    <div key={key} className="doc-table-wrap" tabIndex={0} role="region" aria-label="Table">
      <table className="doc-table">
        {hasWidth && (
          <colgroup>
            {colWidths.map((w, i) =>
              w === undefined ? <col key={i} /> : <col key={i} style={{ width: `${w}px` }} />
            )}
          </colgroup>
        )}
        <tbody>{renderChildren(node, key)}</tbody>
      </table>
    </div>
  );
}

// Column widths live in attrs.colwidth on the cells of the first row, one entry per colspan slot.
function firstRowColWidths(table: DocNode): (number | undefined)[] {
  const firstRowCells = table.content?.[0]?.content ?? [];
  const widths: (number | undefined)[] = [];
  for (const cell of firstRowCells) {
    const colspan = Number(cell.attrs?.colspan) || 1;
    const colwidthRaw = cell.attrs?.colwidth;
    const colwidthArr = Array.isArray(colwidthRaw) ? colwidthRaw : [];
    for (let slot = 0; slot < colspan; slot++) {
      widths.push(toWidth(colwidthArr[slot]));
    }
  }
  return widths;
}

function toWidth(value: unknown): number | undefined {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function renderCell(tag: "th" | "td", node: DocNode, key: string): ReactNode {
  const colSpan = spanValue(node.attrs?.colspan);
  const rowSpan = spanValue(node.attrs?.rowspan);
  const children = renderChildren(node, key);
  return tag === "th" ? (
    <th key={key} colSpan={colSpan} rowSpan={rowSpan}>
      {children}
    </th>
  ) : (
    <td key={key} colSpan={colSpan} rowSpan={rowSpan}>
      {children}
    </td>
  );
}

// A span of exactly 1, explicit or missing, is the HTML default, so the prop stays unset.
function spanValue(value: unknown): number | undefined {
  const n = Number(value) || 1;
  return n === 1 ? undefined : n;
}

function renderImage(node: DocNode, key: string): ReactNode {
  const attrs = node.attrs;
  const srcRaw = attrs?.src;
  const src = typeof srcRaw === "string" ? srcRaw : "";
  if (!src || !isAllowedHref(src)) return null;
  const altRaw = attrs?.alt;
  const alt = typeof altRaw === "string" ? altRaw : "";
  const titleRaw = attrs?.title;
  const title = typeof titleRaw === "string" ? titleRaw : "";
  return (
    <figure key={key} className="doc-figure">
      {/* eslint-disable-next-line @next/next/no-img-element -- src is a proxied, dynamically sized URL */}
      <img className="doc-image" src={imageUrl(src)} alt={alt} loading="lazy" decoding="async" />
      {title && <figcaption className="doc-caption">{title}</figcaption>}
    </figure>
  );
}
